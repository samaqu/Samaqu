import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";
import { BIZ_OFFSET_MS, jakartaDayBounds, jakartaMonthBounds } from "@/lib/ops-followup";
import {
  aggregateBestSellers,
  isValidSaleOrder,
  type BestSellerCatalogRow,
  type BestSellerItem,
} from "@/lib/best-sellers";

/**
 * Produk Terlaris per PRODUK INDUK untuk halaman Laporan ops.
 *
 * - Periode: satu BULAN (`?month=YYYY-MM`, default bulan WIB sekarang), batasnya WIB.
 * - Pembanding apple-to-apple:
 *     · bulan berjalan (belum selesai) → rentang tanggal yang sama di bulan sebelumnya
 *       (mis. 1–23 Okt vs 1–23 Sep),
 *     · bulan yang sudah selesai        → bulan penuh vs bulan penuh sebelumnya.
 * - Aturan agregasi & filter pesanan sah SAMA untuk kedua periode: satu fungsi
 *   `aggregateBestSellers()` + `isValidSaleOrder()` dari `src/lib/best-sellers.ts`.
 * - `totals.units` adalah jumlah SELURUH unit item pesanan sah di periode itu (bukan top-N),
 *   sehingga bisa dicocokkan langsung dengan data transaksi mentah.
 */

const DAY_MS = 86_400_000;
/**
 * Basis pembanding terlalu kecil → persen menyesatkan (+100% dari 1 unit).
 * Di bawah ambang ini UI hanya menampilkan selisih unit.
 */
const MIN_PCT_BASE = 5;
const changePct = (current: number, previous: number) =>
  previous >= MIN_PCT_BASE ? Math.round(((current - previous) / previous) * 1000) / 10 : null;
const BULAN_SINGKAT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const CHUNK = 120;

const wibKey = (iso: string) => new Date(new Date(iso).getTime() + BIZ_OFFSET_MS).toISOString().slice(0, 10);

function prevMonthValue(value: string) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "2026-10-01".."2026-10-23" → "1–23 Okt"; tahun ditambahkan kalau diminta. */
function rangeShort(fromKey: string, toKey: string, withYear = false) {
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  const year = withYear ? ` ${ty}` : "";
  if (fy === ty && fm === tm) return `${fd}–${td} ${BULAN_SINGKAT[tm - 1]}${year}`;
  return `${fd} ${BULAN_SINGKAT[fm - 1]} – ${td} ${BULAN_SINGKAT[tm - 1]}${year}`;
}

/** "2026-10-01".."2026-10-23" → "1–23 Okt 2026". */
function rangeLong(fromKey: string, toKey: string) {
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  if (fy === ty && fm === tm) return `${fd}–${td} ${BULAN_SINGKAT[tm - 1]} ${ty}`;
  return `${fd} ${BULAN_SINGKAT[fm - 1]} ${fy} – ${td} ${BULAN_SINGKAT[tm - 1]} ${ty}`;
}

type Admin = ReturnType<typeof getSupabaseAdmin>;

interface PeriodSales {
  orders: number;
  validOrders: number;
  items: BestSellerItem[];
}

/** Pesanan sah + item-nya pada satu jendela waktu (batas ISO, `end` eksklusif). */
async function loadSales(admin: Admin, startIso: string, endIso: string): Promise<PeriodSales> {
  const { data: orders, error } = await admin
    .from("orders")
    .select("id, status")
    .gte("created_at", startIso)
    .lt("created_at", endIso)
    .limit(5000);
  if (error) throw new Error(error.message);

  const rows = (orders || []) as { id?: string; status?: string | null }[];
  const validIds = rows.filter((order) => isValidSaleOrder(order.status)).map((order) => String(order.id));

  const items: BestSellerItem[] = [];
  for (let i = 0; i < validIds.length; i += CHUNK) {
    const chunk = validIds.slice(i, i + CHUNK);
    const { data, error: itemError } = await admin
      .from("order_items")
      .select("order_id, product_id, product_name, size, kain, series, quantity, price, customer_price")
      .in("order_id", chunk);
    if (itemError) throw new Error(itemError.message);
    items.push(...((data || []) as BestSellerItem[]));
  }

  return { orders: rows.length, validOrders: validIds.length, items };
}

/** Nama & kategori katalog untuk produk induk (satu query per potongan id). */
async function loadCatalog(admin: Admin, items: BestSellerItem[]): Promise<BestSellerCatalogRow[]> {
  const ids = [...new Set(items.map((item) => String(item.product_id || "")).filter(Boolean))];
  const catalog: BestSellerCatalogRow[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("products")
      .select("id, name, category, series, kain, jenis_kain(name)")
      .in("id", chunk);
    if (error) throw new Error(error.message);
    catalog.push(...((data || []) as BestSellerCatalogRow[]));
  }
  return catalog;
}

export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  const admin = getSupabaseAdmin();

  try {
    const now = new Date();
    const current = jakartaMonthBounds(new URL(req.url).searchParams.get("month"), now);
    const thisMonth = jakartaMonthBounds(null, now);
    const isPartial = current.value === thisMonth.value;

    // Jendela periode terpilih: bulan berjalan dipotong sampai hari ini (WIB).
    const todayEndIso = jakartaDayBounds(now).endIso;
    const currentFrom = current.startIso;
    const currentEnd = isPartial ? todayEndIso : current.endIso;

    // Pembanding: rentang tanggal yang sama di bulan sebelumnya (dipotong akhir bulan bila lebih pendek).
    const previous = jakartaMonthBounds(prevMonthValue(current.value), now);
    const elapsedDays = Math.round((Date.parse(currentEnd) - Date.parse(currentFrom)) / DAY_MS);
    const previousEnd = isPartial
      ? new Date(Math.min(Date.parse(previous.startIso) + elapsedDays * DAY_MS, Date.parse(previous.endIso))).toISOString()
      : previous.endIso;

    const [currentSales, previousSales] = await Promise.all([
      loadSales(admin, currentFrom, currentEnd),
      loadSales(admin, previous.startIso, previousEnd),
    ]);

    // Katalog dimuat SEKALI untuk kedua periode → normalisasi produk induk identik.
    const catalog = await loadCatalog(admin, [...currentSales.items, ...previousSales.items]);
    const currentAgg = aggregateBestSellers(currentSales.items, catalog);
    const previousAgg = aggregateBestSellers(previousSales.items, catalog);

    const previousByKey = new Map(previousAgg.rows.map((row) => [row.key, row]));
    const currentKeys = new Set<string>();

    const rows = currentAgg.rows.map((row) => {
      currentKeys.add(row.key);
      const prevUnits = previousByKey.get(row.key)?.units ?? 0;
      return {
        ...row,
        prevUnits,
        deltaUnits: row.units - prevUnits,
        deltaPct: changePct(row.units, prevUnits),
        isNew: prevUnits === 0 && row.units > 0,
        share: currentAgg.units > 0 ? Math.round((row.units / currentAgg.units) * 1000) / 10 : 0,
      };
    });

    // Produk yang hanya terjual di periode pembanding tetap ikut (unit 0) → terlihat sebagai penurunan.
    for (const row of previousAgg.rows) {
      if (currentKeys.has(row.key)) continue;
      rows.push({
        ...row,
        units: 0,
        revenue: 0,
        sizes: [],
        covers: [],
        prevUnits: row.units,
        deltaUnits: -row.units,
        deltaPct: changePct(0, row.units),
        isNew: false,
        share: 0,
      });
    }

    rows.sort((a, b) => b.units - a.units || b.revenue - a.revenue || a.name.localeCompare(b.name));

    const top = rows.find((row) => row.units > 0) || null;
    const currentLastKey = wibKey(new Date(Date.parse(currentEnd) - 1).toISOString());
    const previousLastKey = wibKey(new Date(Date.parse(previousEnd) - 1).toISOString());

    return NextResponse.json({
      period: {
        month: current.value,
        label: current.label,
        from: currentFrom,
        to: currentEnd,
        isPartial,
        rangeLabel: rangeLong(wibKey(currentFrom), currentLastKey),
        shortLabel: rangeShort(wibKey(currentFrom), currentLastKey),
      },
      comparison: {
        month: previous.value,
        label: previous.label,
        from: previous.startIso,
        to: previousEnd,
        rangeLabel: rangeLong(wibKey(previous.startIso), previousLastKey),
        shortLabel: rangeShort(wibKey(previous.startIso), previousLastKey),
        hasData: previousAgg.units > 0,
      },
      totals: {
        units: currentAgg.units,
        revenue: currentAgg.revenue,
        products: rows.filter((row) => row.units > 0).length,
        validOrders: currentSales.validOrders,
        orders: currentSales.orders,
        top: top ? { name: top.name, units: top.units } : null,
        unitsPrev: previousAgg.units,
        deltaUnits: currentAgg.units - previousAgg.units,
        deltaPct: changePct(currentAgg.units, previousAgg.units),
      },
      rows,
    });
  } catch (error) {
    console.error("[OPS] best-sellers GET:", error);
    return NextResponse.json({ error: "Gagal memuat produk terlaris" }, { status: 500 });
  }
}
