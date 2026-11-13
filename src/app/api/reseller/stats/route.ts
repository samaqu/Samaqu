import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { resellerSession, resellerUnauthorized } from "@/lib/reseller/auth";
import type { LevelSummary } from "@/lib/reseller/level";
import { levelsForResellers } from "@/lib/reseller/level-server";

/**
 * Statistik ringkas bulan ini untuk dashboard reseller (WIB):
 * jumlah pesanan, pcs terjual, belanja modal (harga beli), estimasi untung
 * (harga jual − harga beli per pcs), plus total top up yang belum dikonfirmasi.
 * Pesanan `dibatalkan` tidak dihitung di angka penjualan — sama seperti omset.
 */
export async function GET(req: NextRequest) {
  const session = await resellerSession(req);
  if (!session) return resellerUnauthorized();

  const resellerId = session.reseller.id;
  const supabase = getSupabaseAdmin();

  // Awal bulan WIB → awal bulan berikutnya.
  const nowWib = new Date(Date.now() + 7 * 3600 * 1000);
  const monthKey = nowWib.toISOString().slice(0, 7);
  const start = new Date(`${monthKey}-01T00:00:00+07:00`);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);

  const [{ data: orders, error: ordersError }, { data: pendingTopups }] = await Promise.all([
    supabase
      .from("orders")
      .select("id, status, order_items(quantity, price, reseller_sell_price)")
      .eq("reseller_id", resellerId)
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString()),
    supabase
      .from("reseller_topups")
      .select("amount")
      .eq("reseller_id", resellerId)
      .eq("status", "pending"),
  ]);

  if (ordersError) {
    console.error("[RESELLER-STATS] Gagal membaca pesanan:", ordersError.message);
    return NextResponse.json({ error: "Gagal memuat statistik" }, { status: 500 });
  }

  let pesanan = 0;
  let pcs = 0;
  let belanjaModal = 0;
  let estimasiUntung = 0;

  for (const order of orders ?? []) {
    if (order.status === "dibatalkan") continue;
    pesanan += 1;
    const items = (order.order_items ?? []) as Array<{
      quantity: number | null;
      price: number | null;
      reseller_sell_price: number | null;
    }>;
    for (const item of items) {
      const qty = Number(item.quantity) || 0;
      const buy = Number(item.price) || 0;
      const sell = Number(item.reseller_sell_price) || 0;
      pcs += qty;
      belanjaModal += buy * qty;
      estimasiUntung += Math.max(0, sell - buy) * qty;
    }
  }

  const pendingTopup = (pendingTopups ?? []).reduce(
    (sum, row) => sum + (Number(row.amount) || 0),
    0
  );

  // Level: SATU sumber aturan di level-server (rata-rata belanja 90 hari, batas dari pengaturan admin, dan level
  // manual dari admin bila ada). Query terpisah supaya statistik bulan ini di atas tidak berubah; kalau gagal,
  // level dikosongkan dan kartunya disembunyikan.
  const levels = await levelsForResellers([
    { id: resellerId, created_at: session.reseller.created_at, level_override: session.reseller.level_override },
  ]);
  const level: LevelSummary | null = levels.get(resellerId) ?? null;

  return NextResponse.json({
    level,
    bulan: monthKey,
    pesanan,
    pcs,
    belanja_modal: belanjaModal,
    estimasi_untung: estimasiUntung,
    pending_topup: pendingTopup,
  });
}
