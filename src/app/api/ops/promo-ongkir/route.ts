import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";
import { BIZ_OFFSET_MS, jakartaMonthBounds } from "@/lib/ops-followup";
import { isValidSaleOrder } from "@/lib/best-sellers";
import { OPEN_ORDER_SOURCE_KEY, PROMO_FCH_SOURCE_KEY, orderSourceKey, statusLabel } from "@/lib/transaksi";
import {
  buildPromoOngkirReport,
  type PromoOngkirOrder,
  type PromoOngkirOrigin,
} from "@/lib/promo-ongkir-report";
import { readPromoSettings } from "@/lib/promo/ongkir-promo-server";

/**
 * Kartu "Promo Ongkir" di Laporan Office: berapa pesanan yang dapat free ongkir / potongan ongkir pada satu BULAN
 * (WIB), berapa Rp yang diberikan ke customer, dan berapa yang benar-benar keluar dari SAMAQU. HANYA MEMBACA.
 *
 * - Hanya pesanan sah (diproses/dikirim/selesai). Pesanan lama/tanpa promo (kolom promo kosong) tidak ikut.
 * - Asal pesanan sama dengan kartu Promo Free Cover Hanger (`/api/ops/promo-fch`): draft bot yang disetujui admin =
 *   Bot WA; sumber website/promo/Open Order = Website; sisanya Input admin.
 * - Rumus omset/laba TIDAK disentuh (omset = total - ongkir yang dibayar).
 */

export const dynamic = "force-dynamic";

const CHUNK = 120;

const COLUMNS =
  "id, order_number, status, source, customer_name, created_at, shipping_cost, shipping_cost_original, shipping_discount, shipping_promo_kind, shipping_city";

export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  const admin = getSupabaseAdmin();

  try {
    const now = new Date();
    const bounds = jakartaMonthBounds(new URL(req.url).searchParams.get("month"), now);
    const thisMonth = jakartaMonthBounds(null, now);
    const isPartial = bounds.value === thisMonth.value;
    const todayWib = new Date(now.getTime() + BIZ_OFFSET_MS);
    const hariBerjalan = isPartial ? todayWib.getUTCDate() : bounds.daysInMonth;
    const dayKeys = Array.from({ length: hariBerjalan }, (_, i) => `${bounds.value}-${String(i + 1).padStart(2, "0")}`);

    const settings = await readPromoSettings();

    const { data: orderRows, error: orderError } = await admin
      .from("orders")
      .select(COLUMNS)
      .gt("shipping_discount", 0)
      .gte("created_at", bounds.startIso)
      .lt("created_at", bounds.endIso)
      .limit(5000);

    // Kolom promo belum dibuat di database (migrasi belum dijalankan) = belum ada promo: kartu kosong, bukan error.
    const belumAktif = Boolean(orderError && /shipping_discount|column/i.test(orderError.message));
    if (orderError && !belumAktif) throw new Error(orderError.message);

    const orders = (((orderRows || []) as unknown) as (PromoOngkirOrder & { source?: string | null })[]).filter((order) =>
      isValidSaleOrder(order.status),
    );

    // Asal BOT: nomor pesanan yang lahir dari draft bot.
    const numbers = orders.map((order) => String(order.order_number || "")).filter(Boolean);
    const botNumbers = new Set<string>();
    for (let i = 0; i < numbers.length; i += CHUNK) {
      const { data, error } = await admin
        .from("order_drafts")
        .select("approved_order_number, ai_note")
        .in("approved_order_number", numbers.slice(i, i + CHUNK))
        .ilike("ai_note", "Draft dari chat WA%");
      if (error) throw new Error(error.message);
      for (const row of (data || []) as { approved_order_number?: string | null }[]) {
        botNumbers.add(String(row.approved_order_number || ""));
      }
    }

    const originOf = (order: PromoOngkirOrder): PromoOngkirOrigin => {
      const key = orderSourceKey(order as never);
      if (key === PROMO_FCH_SOURCE_KEY || key === OPEN_ORDER_SOURCE_KEY || key === "website") return "website";
      return botNumbers.has(String(order.order_number || "")) ? "bot" : "admin";
    };

    const report = buildPromoOngkirReport({
      orders,
      originOf,
      dayKeys,
      jntDiscountPercent: settings.jntDiscountPercent,
      statusLabel,
    });

    return NextResponse.json({
      period: { month: bounds.value, label: bounds.label, isPartial, hariBerjalan },
      luarPersen: settings.luarPercent,
      jntDiskonPersen: settings.jntDiscountPercent,
      belumAktif,
      ...report,
    });
  } catch (error) {
    console.error("[OPS] promo-ongkir GET:", error);
    return NextResponse.json({ error: "Gagal memuat promo ongkir" }, { status: 500 });
  }
}
