import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";
import { BIZ_OFFSET_MS } from "@/lib/ops-followup";
import { SALE_STATUSES, orderRevenue } from "@/lib/transaksi";
import { paymentChannelLabel } from "@/lib/payment-channel";

/**
 * Laporan keuangan owner.
 *
 * Aturan angka:
 *  - Omzet Bruto  = orderRevenue(orders) = total − ongkir (harga PRODUK saja), SALE_STATUSES
 *                   (diproses/dikirim/selesai). Ongkir yang dibayar customer TIDAK dihitung
 *                   sebagai pendapatan — biaya kirimnya dibukukan terpisah (menu Ongkir J&T).
 *  - Retur        = refund_amount dari returns type=return yang refund_settled_at-nya
 *                   jatuh di periode (retur selesai != refund selesai)
 *  - Penyesuaian  = price_difference_total Tukar Size yang price_difference_status=settled
 *                   dan price_difference_settled_at-nya jatuh di periode
 *  - Omzet Neto   = Bruto - Retur + Penyesuaian
 *  - Laba         = Neto - HPP - Biaya (estimasi; HPP retur belum dibalik)
 *
 * Semua angka memakai jendela tanggal WIB yang sama. Query `from`/`to` = YYYY-MM-DD
 * inklusif; default 30 hari terakhir.
 */

const DAY_MS = 86_400_000;

/**
 * Modul Pengeluaran (biaya operasional) belum ada di aplikasi — sidebar masih "SOON".
 * Selama belum ada sumber datanya, biaya TIDAK boleh dianggap Rp0; laporan harus
 * menandainya "belum tersedia" supaya laba tidak terlihat lebih besar dari kenyataan.
 */
const EXPENSES_AVAILABLE = false;

function todayWibKey() {
  return new Date(Date.now() + BIZ_OFFSET_MS).toISOString().slice(0, 10);
}

function keyToUtcMs(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function msToKey(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

function addDaysKey(key: string, n: number) {
  return msToKey(keyToUtcMs(key) + n * DAY_MS);
}

function startOfDayIso(key: string) {
  return new Date(keyToUtcMs(key) - BIZ_OFFSET_MS).toISOString();
}

function daysBetween(from: string, to: string) {
  return Math.round((keyToUtcMs(to) - keyToUtcMs(from)) / DAY_MS) + 1;
}

function wibKeyOf(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() + BIZ_OFFSET_MS).toISOString().slice(0, 10);
}

function validDateKey(value: unknown) {
  const key = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const date = new Date(`${key}T00:00:00+07:00`);
  return Number.isNaN(date.getTime()) ? null : key;
}

function fmtDay(key: string) {
  return new Date(`${key}T00:00:00+07:00`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

function rangeLabel(from: string, to: string) {
  return from === to ? fmtDay(from) : `${fmtDay(from)} – ${fmtDay(to)}`;
}

function monthLabel(key: string) {
  return new Date(`${key}-01T00:00:00+07:00`).toLocaleDateString("id-ID", {
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

type OrderRow = any;
type ReturnRow = any;

function sumBy<T>(rows: T[], pick: (row: T) => number) {
  return rows.reduce((sum, row) => sum + (Number(pick(row)) || 0), 0);
}

function pctChange(current: number, previous: number): number | null {
  if (!previous) return current ? null : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Label metode lama (sebelum `payment_method` menyimpan id tabel `payment_methods`). */
const LEGACY_PAYMENT_LABELS: Record<string, string> = {
  bank: "Transfer Bank",
  qris: "QRIS / E-Wallet",
  ewallet: "E-Wallet",
  cod: "Bayar di Tempat (COD)",
  cash: "Cash",
  other: "Lainnya",
};

const UNKNOWN_PAYMENT_LABEL = "Belum tercatat";

function paymentLabelFor(raw: string, methodById: Map<string, string>): string {
  const key = String(raw || "").trim();
  if (!key) return UNKNOWN_PAYMENT_LABEL;
  const known = methodById.get(key);
  if (known) return known;
  return LEGACY_PAYMENT_LABELS[key.toLowerCase()] || "Metode Pembayaran";
}

/**
 * Sebaran metode pembayaran pada pesanan sah (SALE_STATUSES).
 *
 * Porsi (%) dihitung dari NOMINAL omzet tiap metode, bukan jumlah transaksi — bar panjang
 * harus sebanding dengan uang yang masuk lewat metode itu. Metode online (Mayar) dipecah
 * lagi per channel (QRIS/VA/e-wallet) supaya rinciannya terlihat.
 */
function buildPaymentBreakdown(
  orders: OrderRow[],
  methodById: Map<string, string>,
  bankMethodIds: Set<string> = new Set(),
  mayarMethodIds: Set<string> = new Set(),
) {
  const groups = new Map<string, { key: string; label: string; count: number; amount: number }>();
  for (const order of orders) {
    const raw = String(order.payment_method || "").trim();
    const channel = String(order.payment_channel || "").trim().toLowerCase();
    const base = paymentLabelFor(raw, methodById);
    const channelLabel = channel ? paymentChannelLabel(channel) : "";
    // Transfer bank lama (`bank`) dan metode bank baru digabung satu baris.
    const isTransferBank = raw.toLowerCase() === "bank" || bankMethodIds.has(raw);
    // Pesanan online lama bisa belum punya `payment_channel` (mis. ditandai lunas manual).
    // Jangan sembunyikan detailnya: beri label eksplisit supaya tidak terbaca sebagai
    // "Pembayaran Online" tanpa keterangan.
    const isOnlineWithoutChannel =
      !channelLabel &&
      (String(order.payment_provider || "").toLowerCase() === "mayar" || mayarMethodIds.has(raw));
    const label = isTransferBank
      ? "Transfer Bank"
      : channelLabel
        ? `${base} · ${channelLabel}`
        : isOnlineWithoutChannel
          ? `${base} · channel belum tercatat`
          : base;
    const key = isTransferBank ? "transfer-bank" : `${raw}|${channel}`;
    const entry = groups.get(key) || { key, label, count: 0, amount: 0 };
    entry.count += 1;
    entry.amount += orderRevenue(order);
    groups.set(key, entry);
  }

  const total = [...groups.values()].reduce((sum, row) => sum + row.amount, 0);
  return [...groups.values()]
    .map((row) => ({
      ...row,
      share: total > 0 ? Math.round((row.amount / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

async function loadPeriod(
  admin: ReturnType<typeof getSupabaseAdmin>,
  from: string,
  to: string,
  includeDetails: boolean,
) {
  const startIso = startOfDayIso(from);
  const endIso = startOfDayIso(addDaysKey(to, 1));

  const [ordersRes, returnsCreatedRes, refundsRes, exchangesRes] = await Promise.all([
    admin
      .from("orders")
      .select("id, order_number, customer_name, customer_whatsapp, created_at, total, shipping_cost, status, source, payment_method, payment_provider, payment_channel")
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .order("created_at", { ascending: false })
      .limit(2000),
    admin
      .from("returns")
      .select("*")
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .order("created_at", { ascending: false })
      .limit(1000),
    // Refund dihitung saat uangnya benar-benar keluar, bukan saat retur selesai.
    admin
      .from("returns")
      .select("*")
      .eq("type", "return")
      .gte("refund_settled_at", startIso)
      .lt("refund_settled_at", endIso)
      .limit(1000),
    admin
      .from("returns")
      .select("*")
      .eq("type", "tukar_size")
      .eq("price_difference_status", "settled")
      .gte("price_difference_settled_at", startIso)
      .lt("price_difference_settled_at", endIso)
      .limit(1000),
  ]);

  for (const res of [ordersRes, returnsCreatedRes, refundsRes, exchangesRes]) {
    if (res.error) throw new Error(res.error.message);
  }

  const orders = (ordersRes.data || []) as OrderRow[];
  const returnsCreated = (returnsCreatedRes.data || []) as ReturnRow[];
  const refunds = (refundsRes.data || []) as ReturnRow[];
  const exchanges = (exchangesRes.data || []) as ReturnRow[];
  const validOrders = orders.filter((o) => SALE_STATUSES.includes(String(o.status || "").toLowerCase()));

  // Item diambil untuk semua pesanan (termasuk pending/batal) supaya drawer detail tetap
  // bisa ditelusuri; HPP hanya dijumlahkan untuk pesanan sah (`validOrders`).
  const orderIds = orders.map((o) => String(o.id));
  let orderItems: any[] = [];
  if (orderIds.length > 0) {
    // `select("*")` — kolom `hpp` di order_items tidak selalu ada di skema live;
    // kalau ada dipakai, kalau tidak fallback ke products.hpp (sama seperti dashboard).
    const { data, error } = await admin.from("order_items").select("*").in("order_id", orderIds);
    if (error) throw new Error(error.message);
    orderItems = (data || []) as any[];
  }

  const productIds = [...new Set(orderItems.map((item) => String(item.product_id || "")).filter(Boolean))];
  const productHpp = new Map<string, number>();
  if (productIds.length > 0) {
    const { data, error } = await admin.from("products").select("id, hpp").in("id", productIds);
    if (error) throw new Error(error.message);
    for (const product of data || []) productHpp.set(String(product.id), Number(product.hpp) || 0);
  }

  const hppByOrder = new Map<string, number>();
  const validIds = new Set(validOrders.map((order) => String(order.id)));
  const missingHppOrders = new Set<string>();
  let totalQty = 0;
  let knownQty = 0;
  for (const item of orderItems) {
    const qty = Number(item.quantity ?? item.qty) || 0;
    const lineHpp = Number(item.hpp);
    const unitHpp = Number.isFinite(lineHpp) && lineHpp > 0 ? lineHpp : productHpp.get(String(item.product_id)) || 0;
    const orderId = String(item.order_id || "");
    hppByOrder.set(orderId, (hppByOrder.get(orderId) || 0) + unitHpp * qty);

    // Coverage hanya dihitung untuk pesanan yang masuk laporan (SALE_STATUSES).
    if (!validIds.has(orderId)) continue;
    totalQty += qty;
    if (unitHpp > 0) knownQty += qty;
    else missingHppOrders.add(orderId);
  }
  const missingQty = Math.max(0, totalQty - knownQty);
  const hppStatus: "complete" | "partial" | "missing" =
    totalQty === 0
      ? validOrders.length === 0
        ? "complete"
        : "missing"
      : missingQty === 0
        ? "complete"
        : knownQty > 0
          ? "partial"
          : "missing";

  // Item untuk drawer detail (hanya periode aktif).
  let itemsByOrder: Record<string, any[]> = {};
  if (includeDetails && orderItems.length > 0) {
    for (const item of orderItems) {
      const key = String(item.order_id || "");
      (itemsByOrder[key] ||= []).push(item);
    }
  }

  // Gabungkan retur yang dibuat di periode + yang settle di periode (biar bisa ditelusuri).
  const returnMap = new Map<string, ReturnRow>();
  for (const row of [...returnsCreated, ...refunds, ...exchanges]) returnMap.set(String(row.id), row);
  let returnRows = [...returnMap.values()].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));

  if (includeDetails && returnRows.length > 0) {
    const ids = returnRows.map((row) => String(row.id));
    const { data, error } = await admin.from("return_items").select("*").in("return_id", ids);
    if (error) throw new Error(error.message);
    const grouped: Record<string, any[]> = {};
    for (const item of data || []) (grouped[String(item.return_id)] ||= []).push(item);
    returnRows = returnRows.map((row) => ({ ...row, items: grouped[String(row.id)] || [] }));
  }

  const settledRefunds = refunds.filter(
    (row) => !["dibatalkan", "ditolak"].includes(String(row.status || "")),
  );
  const settledExchanges = exchanges.filter(
    (row) => !["dibatalkan", "ditolak"].includes(String(row.status || "")),
  );

  const gross = sumBy(validOrders, orderRevenue);
  const hpp = validOrders.reduce((sum, order) => sum + (hppByOrder.get(String(order.id)) || 0), 0);
  const refundTotal = sumBy(settledRefunds, (row) => Number(row.refund_amount) || 0);
  const exchangeTotal = sumBy(settledExchanges, (row) => Number(row.price_difference_total) || 0);
  const net = gross - refundTotal + exchangeTotal;
  const biaya = 0;
  const biayaAvailable = EXPENSES_AVAILABLE;

  /**
   * Laba hanya boleh disebut final kalau modal DAN biaya lengkap.
   * - hpp missing/partial  → laba tidak dapat dihitung (jangan pakai net sebagai laba).
   * - hpp complete, biaya belum ada → laba "sebagian": net − hpp (belum termasuk biaya).
   */
  const profitStatus: "valid" | "partial" | "unavailable" =
    hppStatus !== "complete" ? "unavailable" : biayaAvailable ? "valid" : "partial";
  const profit =
    profitStatus === "unavailable" ? null : net - hpp - (biayaAvailable ? biaya : 0);
  const margin = profitStatus === "valid" && profit !== null && net > 0 ? Math.round((profit / net) * 100) : null;

  const hppNote =
    hppStatus === "complete"
      ? ""
      : hppStatus === "partial"
        ? `${missingQty} unit belum punya data modal; angka modal belum lengkap.`
        : "Data modal barang terjual belum tersedia.";
  const profitNote =
    profitStatus === "valid"
      ? ""
      : profitStatus === "unavailable"
        ? `${hppNote} Estimasi laba belum dapat dihitung.`
        : "Data biaya operasional belum tersedia; estimasi laba belum final.";

  const pendingReturns = returnsCreated.filter(
    (row) =>
      row.type === "return" &&
      Number(row.refund_amount) > 0 &&
      !row.refund_settled_at &&
      !["dibatalkan", "ditolak"].includes(String(row.status || "")),
  );
  const pendingExchanges = returnsCreated.filter(
    (row) =>
      row.type === "tukar_size" &&
      Number(row.price_difference_total) !== 0 &&
      row.price_difference_status !== "settled" &&
      !["dibatalkan", "ditolak"].includes(String(row.status || "")),
  );

  return {
    from,
    to,
    startIso,
    endIso,
    orders,
    validOrders,
    orderItems,
    itemsByOrder,
    orderHpp: hppByOrder,
    returnsCreated,
    refunds: settledRefunds,
    exchanges: settledExchanges,
    returnRows,
    gross,
    hpp,
    refundsTotal: refundTotal,
    exchangeTotal,
    net,
    biaya,
    biayaAvailable,
    hppStatus,
    hppNote,
    hppCoverage: {
      totalQty,
      knownQty,
      missingQty,
      missingOrders: missingHppOrders.size,
    },
    profit,
    profitStatus,
    profitNote,
    transactions: validOrders.length,
    aov: validOrders.length > 0 ? Math.round(gross / validOrders.length) : 0,
    margin,
    pendingReturns,
    pendingExchanges,
    pendingRefundTotal: sumBy(pendingReturns, (row) => Number(row.refund_amount) || 0),
    pendingExchangeTotal: sumBy(pendingExchanges, (row) => Number(row.price_difference_total) || 0),
  };
}

function buildTrend(
  from: string,
  to: string,
  validOrders: OrderRow[],
  orderHpp: Map<string, number>,
  refunds: ReturnRow[],
  exchanges: ReturnRow[],
  hppComplete: boolean,
) {
  const days = daysBetween(from, to);
  const type: "day" | "week" | "month" = days <= 31 ? "day" : days <= 120 ? "week" : "month";
  const buckets: { key: string; start: string; end: string; label: string }[] = [];

  if (type === "day") {
    for (let i = 0; i < days; i += 1) {
      const key = addDaysKey(from, i);
      buckets.push({ key, start: key, end: key, label: fmtDay(key).replace(/ \d{4}$/, "") });
    }
  } else if (type === "week") {
    for (let i = 0; i < days; i += 7) {
      const start = addDaysKey(from, i);
      const end = addDaysKey(from, Math.min(days - 1, i + 6));
      buckets.push({
        key: start,
        start,
        end,
        label: `${fmtDay(start).replace(/ \d{4}$/, "")}–${fmtDay(end).replace(/ \d{4}$/, "")}`,
      });
    }
  } else {
    let cursor = from;
    while (cursor <= to) {
      const month = cursor.slice(0, 7);
      const start = cursor;
      const lastDay = new Date(
        Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
      ).getUTCDate();
      const end = `${month}-${String(lastDay).padStart(2, "0")}`;
      const bucketEnd = end > to ? to : end;
      buckets.push({ key: month, start, end: bucketEnd, label: monthLabel(month) });
      cursor = addDaysKey(bucketEnd, 1);
    }
  }

  const bucketForDate = (dateKey: string) => {
    if (!dateKey) return null;
    if (type === "month") return buckets.find((b) => dateKey.startsWith(b.key)) || null;
    return buckets.find((b) => dateKey >= b.start && dateKey <= b.end) || null;
  };

  const map = new Map<string, { gross: number; hpp: number; refunds: number; exchange: number }>();
  for (const bucket of buckets) map.set(bucket.key, { gross: 0, hpp: 0, refunds: 0, exchange: 0 });

  for (const order of validOrders) {
    const bucket = bucketForDate(wibKeyOf(order.created_at));
    if (!bucket) continue;
    const row = map.get(bucket.key)!;
    row.gross += orderRevenue(order);
    row.hpp += orderHpp.get(String(order.id)) || 0;
  }
  for (const refund of refunds) {
    const bucket = bucketForDate(wibKeyOf(refund.refund_settled_at));
    if (!bucket) continue;
    map.get(bucket.key)!.refunds += Number(refund.refund_amount) || 0;
  }
  for (const exchange of exchanges) {
    const bucket = bucketForDate(wibKeyOf(exchange.price_difference_settled_at));
    if (!bucket) continue;
    map.get(bucket.key)!.exchange += Number(exchange.price_difference_total) || 0;
  }

  return {
    type,
    points: buckets.map((bucket) => {
      const row = map.get(bucket.key)!;
      const net = row.gross - row.refunds + row.exchange;
      return {
        key: bucket.key,
        label: bucket.label,
        gross: row.gross,
        net,
        // Laba per titik hanya diisi kalau modal lengkap; kalau tidak, garis laba
        // disembunyikan di UI supaya tidak menampilkan laba semu.
        profit: hppComplete ? net - row.hpp : null,
      };
    }),
  };
}

export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  const admin = getSupabaseAdmin();

  try {
    const sp = new URL(req.url).searchParams;
    const today = todayWibKey();
    const rawMonth = String(sp.get("month") || "").trim();
    const monthMode = /^\d{4}-(0[1-9]|1[0-2])$/.test(rawMonth);

    // Mode bulan: laporan selalu per bulan. Bulan berjalan dipotong sampai hari ini
    // (WIB); bulan yang sudah lewat memakai bulan penuh.
    let from: string;
    let to: string;
    if (monthMode) {
      const [year, month] = rawMonth.split("-").map(Number);
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const monthEnd = `${rawMonth}-${String(lastDay).padStart(2, "0")}`;
      from = `${rawMonth}-01`;
      to = rawMonth === today.slice(0, 7) ? today : monthEnd;
    } else {
      to = validDateKey(sp.get("to")) || today;
      from = validDateKey(sp.get("from")) || addDaysKey(to, -29);
    }
    if (from > to) return NextResponse.json({ error: "Tanggal awal harus sebelum tanggal akhir" }, { status: 400 });
    const days = daysBetween(from, to);
    if (days > 366) return NextResponse.json({ error: "Rentang maksimal 366 hari" }, { status: 400 });

    // Pembanding: apple-to-apple. Mode bulan → tanggal yang sama di bulan sebelumnya
    // (1–23 Okt vs 1–23 Sep), dipotong akhir bulan bila bulan sebelumnya lebih pendek.
    let prevTo: string;
    let prevFrom: string;
    if (monthMode) {
      const [year, month] = rawMonth.split("-").map(Number);
      const prev = new Date(Date.UTC(year, month - 2, 1));
      const prevMonth = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;
      const prevLastDay = new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + 1, 0)).getUTCDate();
      const prevEnd = `${prevMonth}-${String(prevLastDay).padStart(2, "0")}`;
      prevFrom = `${prevMonth}-01`;
      prevTo = addDaysKey(prevFrom, days - 1);
      if (prevTo > prevEnd) prevTo = prevEnd;
    } else {
      prevTo = addDaysKey(from, -1);
      prevFrom = addDaysKey(prevTo, -(days - 1));
    }

    const [current, previous] = await Promise.all([
      loadPeriod(admin, from, to, true),
      loadPeriod(admin, prevFrom, prevTo, false),
    ]);

    // Label metode pembayaran (id → nama). Gagal membaca daftar ini tidak boleh menggagalkan
    // laporan — metode yang tidak dikenal jatuh ke label cadangan.
    const { data: methodRows } = await admin
      .from("payment_methods")
      .select("id, label, bank_name, method_type");
    const methodById = new Map<string, string>();
    const bankMethodIds = new Set<string>();
    const mayarMethodIds = new Set<string>();
    for (const pm of methodRows || []) {
      const type = String(pm.method_type || "");
      if (type === "bank" && pm.id) bankMethodIds.add(String(pm.id));
      if (type === "mayar" && pm.id) mayarMethodIds.add(String(pm.id));
      const fallback =
        type === "mayar"
          ? "Pembayaran Online"
          : type === "cod"
            ? "Bayar di Tempat (COD)"
            : type === "qris"
              ? "QRIS"
              : type === "ewallet"
                ? "E-Wallet"
                : "Transfer Bank";
      const label =
        String(pm.label || "").trim() ||
        (pm.bank_name ? `Transfer Bank (${pm.bank_name})` : "") ||
        fallback;
      if (pm.id) methodById.set(String(pm.id), label);
    }
    const payments = buildPaymentBreakdown(current.validOrders, methodById, bankMethodIds, mayarMethodIds);

    const trend = buildTrend(
      from,
      to,
      current.validOrders,
      current.orderHpp,
      current.refunds,
      current.exchanges,
      current.hppStatus === "complete",
    );

    const salesRows = current.orders.map((order) => ({
      ...order,
      items: current.itemsByOrder[String(order.id)] || [],
      hpp: current.orderHpp.get(String(order.id)) || 0,
    }));
    const returnTable = current.returnRows
      .filter((row) => row.type === "return")
      .map((row) => ({ ...row, items: row.items || [] }));
    const exchangeTable = current.returnRows
      .filter((row) => row.type === "tukar_size")
      .map((row) => ({ ...row, items: row.items || [] }));

    return NextResponse.json({
      period: {
        from,
        to,
        days,
        label: rangeLabel(from, to),
        previous: { from: prevFrom, to: prevTo, label: rangeLabel(prevFrom, prevTo) },
      },
      summary: {
        gross: current.gross,
        refunds: current.refundsTotal,
        refundsPending: current.pendingRefundTotal,
        refundsPendingCount: current.pendingReturns.length,
        exchange: current.exchangeTotal,
        exchangePending: current.pendingExchangeTotal,
        exchangePendingCount: current.pendingExchanges.length,
        net: current.net,
        hpp: current.hpp,
        biaya: current.biaya,
        profit: current.profit,
        margin: current.margin,
        hppStatus: current.hppStatus,
        hppNote: current.hppNote,
        hppCoverage: current.hppCoverage,
        biayaAvailable: current.biayaAvailable,
        profitStatus: current.profitStatus,
        profitNote: current.profitNote,
        transactions: current.transactions,
        aov: current.aov,
        hppReversal: false,
        biayaNote: "Modul Pengeluaran belum tersedia",
      },
      previous: {
        gross: previous.gross,
        refunds: previous.refundsTotal,
        exchange: previous.exchangeTotal,
        net: previous.net,
        hpp: previous.hpp,
        profit: previous.profit,
      },
      deltas: {
        gross: pctChange(current.gross, previous.gross),
        net: pctChange(current.net, previous.net),
        profit:
          current.profit !== null && previous.profit !== null
            ? pctChange(current.profit, previous.profit)
            : null,
      },
      trend,
      payments,
      tables: {
        sales: salesRows,
        returns: returnTable,
        exchanges: exchangeTable,
      },
    });
  } catch (error) {
    console.error("[OPS] laporan GET:", error);
    return NextResponse.json({ error: "Gagal memuat laporan keuangan" }, { status: 500 });
  }
}
