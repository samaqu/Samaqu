import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";
import { BIZ_OFFSET_MS, jakartaMonthBounds } from "@/lib/ops-followup";
import { isValidSaleOrder } from "@/lib/best-sellers";
import { OPEN_ORDER_SOURCE_KEY, PROMO_FCH_SOURCE_KEY, orderSourceKey, statusLabel } from "@/lib/transaksi";
import {
  buildPromoFchReport,
  COVER_PRODUCT_IDS,
  perkiraanHariCukup,
  VARIAN_KOKO,
  VARIAN_THOBE,
  type PromoDraft,
  type PromoItem,
  type PromoOrder,
  type PromoOrigin,
} from "@/lib/promo-fch-report";

/**
 * Kartu "Promo Free Cover Hanger" di Laporan Office: berapa cover hanger gratis yang keluar pada satu BULAN (WIB),
 * dipecah per asal (Bot WA / Input admin / Website), per varian, per hari, plus sisa stok dan jumlah draft yang
 * masih menunggu review. HANYA MEMBACA; tidak mengubah data apa pun.
 *
 * - Yang dihitung "keluar" hanya pesanan sah (diproses/dikirim/selesai); batal dan belum bayar tidak masuk.
 * - Aturan gratis vs dibeli = aturan "Rincian Biaya Free Gift" di `/api/ops/laporan` (lihat `lib/promo-fch-report`).
 * - Asal BOT = pesanan yang lahir dari draft bot (`order_drafts.ai_note` "Draft dari chat WA") lalu disetujui admin
 *   (`approved_order_number`). Bot dan input admin sama-sama bersumber "whatsapp" di `orders.source`, jadi
 *   pembedanya jejak draft itu. Website = promo website (FCH-), pesanan website, dan Open Order.
 */

export const dynamic = "force-dynamic";

const CHUNK = 120;
const COVER_PRODUCT_ID = "cover-hanger";
const COVER_SIZE = "ALL SIZE";

type Admin = ReturnType<typeof getSupabaseAdmin>;

async function chunked<T, R>(values: T[], size: number, run: (part: T[]) => Promise<R[]>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < values.length; i += size) out.push(...(await run(values.slice(i, i + size))));
  return out;
}

async function readCoverStock(admin: Admin, color: string): Promise<number | null> {
  try {
    const { data, error } = await admin
      .from("product_variant_stock")
      .select("effective_stock")
      .eq("product_id", COVER_PRODUCT_ID)
      .eq("color", color)
      .eq("size", COVER_SIZE)
      .maybeSingle();
    const value = Number((data as { effective_stock?: unknown } | null)?.effective_stock);
    return !error && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  const admin = getSupabaseAdmin();

  try {
    const now = new Date();
    const bounds = jakartaMonthBounds(new URL(req.url).searchParams.get("month"), now);
    const thisMonth = jakartaMonthBounds(null, now);
    const isPartial = bounds.value === thisMonth.value;

    // Hari yang ditampilkan di grafik: bulan berjalan sampai hari ini (WIB), bulan lampau penuh.
    const todayWib = new Date(now.getTime() + BIZ_OFFSET_MS);
    const hariBerjalan = isPartial ? todayWib.getUTCDate() : bounds.daysInMonth;
    const dayKeys = Array.from({ length: hariBerjalan }, (_, i) => `${bounds.value}-${String(i + 1).padStart(2, "0")}`);

    const { data: orderRows, error: orderError } = await admin
      .from("orders")
      .select("id, order_number, status, source, discount, customer_name, created_at")
      .gte("created_at", bounds.startIso)
      .lt("created_at", bounds.endIso)
      .limit(5000);
    if (orderError) throw new Error(orderError.message);
    const orders = ((orderRows || []) as (PromoOrder & { source?: string | null })[]).filter((order) =>
      isValidSaleOrder(order.status),
    );

    const items = await chunked(
      orders.map((order) => String(order.id)),
      CHUNK,
      async (part) => {
        const { data, error } = await admin
          .from("order_items")
          .select("*")
          .in("order_id", part)
          .in("product_id", [...COVER_PRODUCT_IDS]);
        if (error) throw new Error(error.message);
        return (data || []) as PromoItem[];
      },
    );

    // Modal per unit: HPP baris bila ada, kalau tidak HPP produk (id add-on lama memakai HPP produk cover).
    const { data: productRows } = await admin.from("products").select("id, hpp").in("id", [...COVER_PRODUCT_IDS]);
    const productHpp = new Map<string, number>(
      ((productRows || []) as { id: string; hpp?: number | null }[]).map((row) => [String(row.id), Number(row.hpp) || 0]),
    );
    const hppOf = (item: PromoItem) => {
      const line = Number(item.hpp);
      if (Number.isFinite(line) && line > 0) return line;
      return productHpp.get(String(item.product_id)) || productHpp.get(COVER_PRODUCT_ID) || 0;
    };

    // Asal BOT: nomor pesanan yang lahir dari draft bot.
    const idsWithCover = new Set(items.map((item) => String(item.order_id)));
    const numbersWithCover = orders
      .filter((order) => idsWithCover.has(String(order.id)))
      .map((order) => String(order.order_number || ""))
      .filter(Boolean);
    const botRows = await chunked(numbersWithCover, CHUNK, async (part) => {
      const { data, error } = await admin
        .from("order_drafts")
        .select("approved_order_number, ai_note")
        .in("approved_order_number", part)
        .ilike("ai_note", "Draft dari chat WA%");
      if (error) throw new Error(error.message);
      return (data || []) as { approved_order_number?: string | null }[];
    });
    const botNumbers = new Set(botRows.map((row) => String(row.approved_order_number || "")));

    const originOf = (order: PromoOrder & { source?: string | null }): PromoOrigin => {
      const key = orderSourceKey(order);
      if (key === PROMO_FCH_SOURCE_KEY || key === OPEN_ORDER_SOURCE_KEY || key === "website") return "website";
      return botNumbers.has(String(order.order_number || "")) ? "bot" : "admin";
    };

    // Draft yang masih menunggu review (antrean saat ini, bukan per bulan).
    const { data: draftRows } = await admin
      .from("order_drafts")
      .select("id, created_at, payload")
      .eq("status", "pending")
      .limit(500);

    const [stokThobe, stokKoko] = await Promise.all([readCoverStock(admin, VARIAN_THOBE), readCoverStock(admin, VARIAN_KOKO)]);
    const stokMentah = [
      { varian: VARIAN_THOBE, stok: stokThobe },
      { varian: VARIAN_KOKO, stok: stokKoko },
    ];

    const report = buildPromoFchReport({
      orders,
      items,
      originOf,
      hppOf,
      drafts: (draftRows || []) as PromoDraft[],
      dayKeys,
      statusLabel,
    });

    // Perkiraan dihitung PER VARIAN (stok varian itu / rata-rata keluar per hari varian itu), bukan stok gabungan.
    const stok = stokMentah.map((row) => ({
      ...row,
      perkiraanHari: perkiraanHariCukup(
        row.stok,
        report.perVarian.find((item) => item.varian === row.varian)?.gratis ?? 0,
        hariBerjalan,
      ),
    }));
    const hariTerdekat = stok
      .filter((row) => row.perkiraanHari !== null)
      .sort((a, b) => (a.perkiraanHari as number) - (b.perkiraanHari as number))[0];

    return NextResponse.json({
      period: { month: bounds.value, label: bounds.label, isPartial, hariBerjalan },
      ...report,
      stok,
      // Varian yang paling cepat habis (kira-kira), untuk peringatan di kartu.
      terdekat: hariTerdekat ? { varian: hariTerdekat.varian, hari: hariTerdekat.perkiraanHari } : null,
    });
  } catch (error) {
    console.error("[OPS] promo-fch GET:", error);
    return NextResponse.json({ error: "Gagal memuat promo free cover hanger" }, { status: 500 });
  }
}
