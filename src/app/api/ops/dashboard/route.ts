import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";
import { jakartaDayBounds, jakartaMonthBounds, BIZ_OFFSET_MS } from "@/lib/ops-followup";
import { resolveStock } from "@/lib/ops-stock";
import { rankTopProducts, isSaleOrder } from "@/lib/top-products";
import { SALE_STATUSES, orderRevenue } from "@/lib/transaksi";

/**
 * Dashboard ops — ringkasan lintas modul dalam satu request.
 * Semua angka dihitung dari database (tidak ada angka statis) dan memakai batas hari/bulan WIB.
 *
 * Ringkasan penjualan bisa difilter per bulan lewat query `?month=YYYY-MM`
 * (default: bulan WIB sekarang) supaya pemilih bulan di UI tahu posisinya.
 */

/**
 * Penjualan (omset/HPP/laba/AOV/margin) hanya dihitung dari pesanan yang SUDAH DIBAYAR.
 * Omset = `orderRevenue()` (harga PRODUK saja = total − ongkir, lihat src/lib/transaksi.ts);
 * ongkir yang dibayar customer bukan pendapatan — biaya kirimnya dibukukan terpisah di menu
 * Ongkir J&T.
 * `pending` = menunggu transfer: stoknya sudah direservasi saat order dibuat
 * (lihat /api/orders & /api/open-order), tapi uangnya belum masuk. `dibatalkan` tentu tidak.
 *
 * Daftarnya memakai SATU aturan bersama `SALE_STATUSES` (src/lib/transaksi.ts) — sama dengan
 * kartu "Total Omset" di menu Transaksi, Database Kota, dan Total Belanja pelanggan, supaya
 * angka antar layar tidak bisa berbeda. Status `dikirim` IKUT dihitung karena pesanannya sudah
 * dibayar (dulu daftarnya cuma `diproses`+`selesai`, jadi pesanan yang sudah dikirim hilang
 * dari omset dashboard padahal dihitung di menu Transaksi).
 */
const isPaidOrder = (o: { status?: string | null }) =>
  SALE_STATUSES.includes(String(o?.status || "").toLowerCase());

// Batas bulan WIB (`jakartaMonthBounds`) sekarang tinggal di `src/lib/ops-followup.ts` supaya
// dashboard ops dan asisten AI admin memakai definisi "bulan ini" yang sama persis.

export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const admin = getSupabaseAdmin();
  const { startIso, endIso } = jakartaDayBounds();
  const month = jakartaMonthBounds(new URL(req.url).searchParams.get("month"));
  // Awal jendela "7 hari terakhir" (WIB): hari ini + 6 hari ke belakang.
  const trendStartIso = new Date(new Date(startIso).getTime() - 6 * 86400000).toISOString();

  const activeLead = "followup_status.eq.baru,followup_status.eq.dijadwalkan,followup_status.eq.dnd";
  const countOf = async (build: (q: any) => any) => {
    const { count } = await build(admin.from("leads").select("id", { count: "exact", head: true }));
    return count || 0;
  };

  const [
    leadTotal,
    leadBaruHariIni,
    leadBelumMembalas,
    leadUnscheduled,
    leadToday,
    leadOverdue,
    leadClosingBulan,
    ordersMonth,
    variants,
    activity,
    ordersTrend,
  ] = await Promise.all([
    countOf((q) => q),
    countOf((q) => q.gte("created_at", startIso)),
    countOf((q) => q.is("do_not_contact", false).or("outcome.is.null,outcome.eq.no_reply")),
    countOf((q) => q.is("do_not_contact", false).is("next_followup_at", null).or(activeLead)),
    countOf((q) => q.is("do_not_contact", false).gte("next_followup_at", startIso).lt("next_followup_at", endIso).or(activeLead)),
    countOf((q) => q.is("do_not_contact", false).not("next_followup_at", "is", null).lt("next_followup_at", startIso).or(activeLead)),
    countOf((q) => q.eq("outcome", "bought").gte("last_contact_at", month.startIso).lt("last_contact_at", month.endIso)),
    admin.from("orders").select("id, total, shipping_cost, status, created_at").gte("created_at", month.startIso).lt("created_at", month.endIso),
    admin.from("product_variants").select("product_id, stock, base_product_id"),
    admin.from("lead_activities").select("id, lead_id, action, note, created_at, actor").order("created_at", { ascending: false }).limit(6),
    // Order 7 hari terakhir (WIB) — sumber grafik `trendHarian` (batas bulan ≠ jendela 7 hari).
    admin.from("orders").select("id, total, shipping_cost, status, created_at").gte("created_at", trendStartIso).lt("created_at", endIso),
  ]);

  const orders = (ordersMonth.data || []) as any[];
  // Penjualan = hanya pesanan lunas (`diproses`/`selesai`). `pending` (menunggu
  // transfer) dan `dibatalkan` tidak dihitung — lihat PAID_ORDER_STATUS di atas.
  const valid = orders.filter(isPaidOrder);
  const validIds = valid.map((o) => o.id);
  const omset = valid.reduce((s, o) => s + orderRevenue(o), 0);
  const transaksi = valid.length;
  const rataRata = transaksi > 0 ? Math.round(omset / transaksi) : 0;

  /* ── Baris order_items untuk ranking "Produk Terlaris" (pesanan SAH bulan terpilih) ──
     Ranking memakai FUNGSI PUSAT `rankTopProducts` — sama dengan kartu di dashboard admin —
     supaya angkanya tidak bisa berbeda. Pesanan sah = dibayar (`diproses`), `dikirim`,
     `selesai`; batal/belum bayar/auto-cancel & produk Free Gift tidak dihitung. */
  const saleOrders = orders.filter((o) => isSaleOrder(o.status));
  const saleIds = saleOrders.map((o) => o.id);
  let saleItems: any[] = [];
  if (saleIds.length > 0) {
    const { data } = await admin.from("order_items").select("*").in("order_id", saleIds);
    saleItems = (data || []) as any[];
  }

  /* ── Sumber HPP ──
     Skema order_items tidak punya kolom `hpp`. Kalau runtime menyediakannya (per baris)
     nilainya dipakai; kalau kosong, jatuh ke `products.hpp`. Perhitungan HPP TIDAK berubah:
     tetap hanya dari pesanan `valid` lama (`diproses`/`selesai`) supaya angka profit sama. */
  const validIdSet = new Set(validIds);
  const hppItems = saleItems.filter((it) => validIdSet.has(String(it.order_id)));
  const productIds = Array.from(new Set(saleItems.map((it) => it.product_id).filter(Boolean))) as string[];
  let productRows: any[] = [];
  if (productIds.length > 0) {
    const { data: prods } = await admin
      .from("products")
      .select("id, hpp, sku, product_type")
      .in("id", productIds);
    productRows = (prods || []) as any[];
  }
  const hppByProduct = new Map<string, number>();
  for (const p of productRows) hppByProduct.set(String(p.id), Number(p.hpp) || 0);

  let hpp = 0;
  for (const it of hppItems) {
    const qty = Number(it.quantity ?? it.qty) || 0;
    const perLineHpp = Number(it.hpp);
    const unitHpp = Number.isFinite(perLineHpp) && perLineHpp > 0 ? perLineHpp : hppByProduct.get(String(it.product_id)) || 0;
    hpp += unitHpp * qty;
  }

  // Ranking terlaris — periode = BULAN TERPILIH (batas bulan sudah dipakai di query orders).
  const topProducts = rankTopProducts({
    orders,
    items: saleItems,
    products: productRows,
    limit: 5,
  });

  // BIAYA operasional & packing: belum ada modul Pengeluaran → 0.
  // (Menunggu modul Pengeluaran supaya netProfit tidak dikarang.)
  const biaya = 0;

  const netProfit = omset - hpp - biaya;
  const margin = omset > 0 ? Math.round((netProfit / omset) * 100) : 0;

  /* ── Tren penjualan harian (semua hari dalam bulan terpilih) ── */
  const dailyMap = new Map<string, number>();
  for (const o of valid) {
    const created = new Date(o.created_at);
    if (Number.isNaN(created.getTime())) continue;
    const wibDay = new Date(created.getTime() + BIZ_OFFSET_MS).toISOString().slice(0, 10);
    dailyMap.set(wibDay, (dailyMap.get(wibDay) || 0) + orderRevenue(o));
  }
  const trend: { tanggal: string; hari: string; omset: number }[] = [];
  for (let d = 1; d <= month.daysInMonth; d++) {
    const tanggal = `${month.value}-${String(d).padStart(2, "0")}`;
    trend.push({ tanggal, hari: String(d), omset: dailyMap.get(tanggal) || 0 });
  }

  /* ── Tren 7 hari terakhir (WIB, termasuk hari ini) — dipakai grafik dashboard ──
     Jendela 7 hari tidak selalu berada di dalam bulan terpilih (mis. awal bulan),
     jadi dihitung dari query `ordersTrend` sendiri. Urut paling lama → hari ini. */
  // Grafik tren juga penjualan → hanya pesanan lunas (bukan pending/batal).
  const trendValid = ((ordersTrend.data || []) as any[]).filter(isPaidOrder);
  const trendDailyMap = new Map<string, number>();
  for (const o of trendValid) {
    const created = new Date(o.created_at);
    if (Number.isNaN(created.getTime())) continue;
    const wibDay = new Date(created.getTime() + BIZ_OFFSET_MS).toISOString().slice(0, 10);
    trendDailyMap.set(wibDay, (trendDailyMap.get(wibDay) || 0) + orderRevenue(o));
  }

  const trendHarian: { tanggal: string; label: string; omset: number }[] = [];
  for (let back = 6; back >= 0; back--) {
    const wib = new Date(new Date(startIso).getTime() - back * 86400000 + BIZ_OFFSET_MS);
    const tanggal = wib.toISOString().slice(0, 10);
    const label = `${String(wib.getUTCDate()).padStart(2, "0")}/${String(wib.getUTCMonth() + 1).padStart(2, "0")}`;
    trendHarian.push({ tanggal, label, omset: trendDailyMap.get(tanggal) || 0 });
  }

  /* ── Stok ──
     Memakai resolver yang sama dengan /api/ops/products & /api/ops/product-variants:
     produk series yang menumpang stok produk basisnya tidak lagi dihitung "habis". */
  const { effectiveTotal } = resolveStock((variants.data || []) as any);
  const totalPerProduk = Object.values(effectiveTotal);
  const totalUnit = totalPerProduk.reduce((a, b) => a + b, 0);
  const varianHabis = totalPerProduk.filter((n) => n === 0).length;
  const varianMenipis = totalPerProduk.filter((n) => n > 0 && n <= 5).length;

  // Tugas follow-up hari ini (untuk daftar cepat) — berbasis "hari ini" WIB, bukan bulan terpilih.
  const { data: todayTasks } = await admin
    .from("leads")
    .select("id, kontak, produk, pic, sumber, next_followup_at, outcome")
    .is("do_not_contact", false)
    .gte("next_followup_at", startIso)
    .lt("next_followup_at", endIso)
    .or(activeLead)
    .order("next_followup_at", { ascending: true })
    .limit(6);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    hariIni: { startIso, endIso },
    bulan: month.label,
    bulanLabel: month.label,
    bulanValue: month.value,
    ringkasan: {
      omset,
      hpp,
      biaya,
      netProfit,
      margin,
      transaksi,
      rataRata,
    },
    trend,
    trendHarian,
    leads: {
      total: leadTotal,
      baruHariIni: leadBaruHariIni,
      belumMembalas: leadBelumMembalas,
      perluDijadwalkan: leadUnscheduled,
      followupHariIni: leadToday,
      terlambat: leadOverdue,
      closingBulanIni: leadClosingBulan,
    },
    stok: { totalUnit, varianHabis, varianMenipis, totalVarian: totalPerProduk.length },
    topProducts,
    aktivitas: activity.data || [],
    todayTasks: todayTasks || [],
  });
}
