import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";
import { BIZ_OFFSET_MS } from "@/lib/ops-followup";
import { SALE_STATUSES, ORDER_SOURCE_LABEL, orderRevenue, orderSourceKey } from "@/lib/transaksi";
import { paymentChannelLabel } from "@/lib/payment-channel";
import { loadMayarFees } from "@/lib/mayar-fees";
import { seriesFromName } from "@/lib/best-sellers";

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
 * Biaya operasional & packing dibaca dari tabel `expenses` (menu Keuangan > Pengeluaran).
 * Kalau migration belum dijalankan tabelnya belum ada, dan biaya TIDAK boleh dianggap Rp0:
 * laporan menandainya "belum tersedia" supaya laba tidak terlihat lebih besar dari kenyataan.
 */
const EXPENSES_MISSING_CODES = ["42P01", "PGRST205"];

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

/** Harga normal Cover & Hanger (satu paket) di katalog — dasar nilai promo. */
const COVER_HANGER_VALUE = 35_000;

/**
 * Nilai promo cover hanger pada SATU pesanan.
 *
 * Ada dua cara promo ini tercatat:
 *  - **Tambah Transaksi (WA):** baris `cover-hanger` masuk harga penuh (Rp35.000), lalu admin
 *    menempel diskon Rp35.000 di level pesanan → uang masuk tetap harga produk.
 *  - **Promo website (Free Cover Hanger):** baris `cover-hanger` berharga Rp0.
 *
 * Nilainya TIDAK mengurangi omzet lagi (omzet sudah memakai `total` setelah diskon); ini hanya
 * rekap "berapa nilai yang digratiskan". Cover berharga Rp0 dihitung penuh (itulah bonus promo
 * website), sedangkan diskon pesanan dibatasi nilai kotor baris cover yang dibayar supaya diskon
 * untuk hal lain tidak ikut terhitung sebagai promo cover.
 */
function promoValueOf(order: any, items: any[]): { value: number; covers: number } {
  const coverLines = (items || []).filter((item) => {
    const id = String(item?.product_id || "");
    return id === "cover-hanger" || id === "addon-cover-hanger";
  });
  if (!coverLines.length) return { value: 0, covers: 0 };

  const covers = coverLines.reduce((sum, item) => sum + (Number(item?.quantity) || 0), 0);
  const gross = coverLines.reduce(
    (sum, item) => sum + (Number(item?.price) || 0) * (Number(item?.quantity) || 0),
    0,
  );
  const freeFromPrice = coverLines.reduce(
    (sum, item) =>
      sum + Math.max(0, COVER_HANGER_VALUE - (Number(item?.price) || 0)) * (Number(item?.quantity) || 0),
    0,
  );
  const appliedDiscount = Math.min(Math.max(0, Number(order?.discount) || 0), gross);
  // Cover berharga Rp0 (promo website) tidak punya nilai kotor, jadi TIDAK boleh dibatasi
  // `gross` — kalau dibatasi, bonus promo website selalu terbaca Rp0 dan tidak ikut terekap.
  return { value: freeFromPrice + appliedDiscount, covers };
}

function paymentLabelFor(raw: string, methodById: Map<string, string>): string {
  const key = String(raw || "").trim();
  if (!key) return UNKNOWN_PAYMENT_LABEL;
  // Pesanan Reseller Center menyimpan nilai SUMBER (`'reseller'`) di kolom metode bayar.
  // Kategori sendiri di laporan — bukan "Metode Pembayaran" generik.
  if (key.toLowerCase() === "reseller") return RESELLER_PAYMENT_LABEL;
  const known = methodById.get(key);
  if (known) return known;
  return LEGACY_PAYMENT_LABELS[key.toLowerCase()] || "Metode Pembayaran";
}

/** Kategori metode bayar untuk pesanan reseller (saldo reseller dipotong di SAMAQU). */
export const RESELLER_PAYMENT_LABEL = "Saldo Reseller";

/**
 * Sebaran omzet per SUMBER pesanan (Website, Reseller, Open Order, …).
 *
 * Pesanan reseller dihitung dari `orderRevenue(order)` = `total − ongkir`, yaitu uang yang
 * dibayar reseller ke SAMAQU (harga beli + ongkir dikurangi ongkir), BUKAN harga jual
 * reseller ke pelanggannya. Hanya pesanan sah (SALE_STATUSES) yang ikut, sama seperti
 * omzet di atas — jadi pesanan batal/kedaluwarsa tidak pernah masuk.
 *
 * Top up & penarikan saldo reseller TIDAK ada di sini: keduanya mutasi `reseller_ledger`,
 * bukan penjualan, jadi tidak boleh menambah omzet maupun pengeluaran.
 */
function buildSourceBreakdown(orders: OrderRow[]) {
  const groups = new Map<string, { key: string; label: string; count: number; amount: number }>();
  for (const order of orders) {
    const key = orderSourceKey(order as never);
    const entry = groups.get(key) || { key, label: ORDER_SOURCE_LABEL[key] || key, count: 0, amount: 0 };
    entry.count += 1;
    entry.amount += orderRevenue(order);
    groups.set(key, entry);
  }
  const total = [...groups.values()].reduce((sum, row) => sum + row.amount, 0);
  return [...groups.values()]
    .map((row) => ({ ...row, share: total > 0 ? Math.round((row.amount / total) * 1000) / 10 : 0 }))
    .sort((a, b) => b.amount - a.amount);
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

  const [ordersRes, returnsCreatedRes, refundsRes, exchangesRes, expensesRes] = await Promise.all([
    admin
      .from("orders")
      .select("id, order_number, customer_name, customer_whatsapp, created_at, total, discount, subtotal, shipping_cost, shipping_address, shipping_city, shipping_kecamatan, shipping_province, shipping_postal_code, shipping_method, awb_no, weight, status, shipping_status, tracking_status_text, tracking_city, tracking_updated_at, source, payment_method, payment_provider, payment_channel, payment_ref, paid_at")
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
    // Biaya operasional & packing (menu Pengeluaran) — basis kolom `tanggal` (date), inklusif.
    admin
      .from("expenses")
      .select("tipe, jumlah, kategori, nama_barang, qty")
      .gte("tanggal", from)
      .lte("tanggal", to)
      .limit(5000),
  ]);

  for (const res of [ordersRes, returnsCreatedRes, refundsRes, exchangesRes]) {
    if (res.error) throw new Error(res.error.message);
  }

  // Tabel `expenses` belum ada (migration belum dijalankan) → biaya tidak boleh dianggap Rp0.
  const expensesErrorCode = String((expensesRes.error as { code?: string } | null)?.code || "");
  const expensesErrorMessage = String((expensesRes.error as { message?: string } | null)?.message || "");
  const expensesAvailable =
    !expensesRes.error ||
    !(
      EXPENSES_MISSING_CODES.includes(expensesErrorCode) ||
      /could not find the table|relation .* does not exist/i.test(expensesErrorMessage)
    );
  if (expensesRes.error && expensesAvailable) throw new Error(expensesErrorMessage);
  /**
   * `kategori`/`nama_barang`/`qty` hanya dipakai rincian "Breakdown Pengeluaran"
   * (detail per pengeluaran), bukan perhitungan total.
   */
  const expenseRows = (expensesRes.data || []) as Array<{
    tipe?: string | null;
    jumlah?: number | null;
    kategori?: string | null;
    nama_barang?: string | null;
    qty?: number | null;
  }>;

  const orders = (ordersRes.data || []) as OrderRow[];
  const returnsCreated = (returnsCreatedRes.data || []) as ReturnRow[];
  const refunds = (refundsRes.data || []) as ReturnRow[];
  const exchanges = (exchangesRes.data || []) as ReturnRow[];
  const validOrders = orders.filter((o) => SALE_STATUSES.includes(String(o.status || "").toLowerCase()));

  // `orders.payment_method` menyimpan ID metode (UUID). Ambil labelnya sekaligus supaya
  // drawer detail tidak menampilkan id mentah.
  const methodIds = [
    ...new Set(
      orders
        .map((order) => String(order.payment_method || ""))
        .filter((id) => /^[0-9a-f-]{36}$/i.test(id)),
    ),
  ];
  const methodLabels = new Map<string, string>();
  if (methodIds.length > 0) {
    const { data } = await admin
      .from("payment_methods")
      .select("id, label, bank_name, method_type")
      .in("id", methodIds);
    for (const method of data || []) {
      methodLabels.set(
        String((method as any).id),
        String((method as any).label || (method as any).bank_name || (method as any).method_type || ""),
      );
    }
  }
  // Tempel label ke pesanan supaya ikut terkirim ke drawer detail.
  for (const order of orders) {
    (order as any).payment_method_label = methodLabels.get(String(order.payment_method || "")) || null;
  }

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
  /** SKU katalog — dipakai rincian free gift supaya barisnya bisa dikenali pemilik. */
  const productSku = new Map<string, string>();
  if (productIds.length > 0) {
    const { data, error } = await admin.from("products").select("id, hpp, sku").in("id", productIds);
    if (error) throw new Error(error.message);
    for (const product of data || []) {
      productHpp.set(String(product.id), Number(product.hpp) || 0);
      const sku = String((product as { sku?: string | null }).sku || "").trim();
      if (sku) productSku.set(String(product.id), sku);
    }

    // Foto item untuk drawer detail (sama seperti detail transaksi panel admin).
    const { data: imageRows } = await admin
      .from("product_images")
      .select("product_id, url, is_video, display_order")
      .in("product_id", productIds)
      .order("display_order", { ascending: true });
    const photoByProduct = new Map<string, string>();
    for (const row of imageRows || []) {
      const url = String((row as any).url || "");
      if ((row as any).is_video || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)) continue;
      if (!photoByProduct.has(String((row as any).product_id))) {
        photoByProduct.set(String((row as any).product_id), url);
      }
    }
    for (const item of orderItems) {
      item.image = photoByProduct.get(String(item.product_id || "")) || "";
    }
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
  /*
   * ── Biaya Mayar masuk sebagai PENGELUARAN ──
   * Fee transaksi Mayar memang uang yang tidak diterima, jadi harus mengurangi laba.
   * Dihitung dari pesanan sah di periode ini (penjualan valid), bukan dari seluruh
   * transaksi Mayar — supaya konsisten dengan angka Penjualan di atas.
   *
   * PENTING (kejujuran angka): `fee` baru ada setelah transaksi `settled`. Kalau masih ada
   * transaksi yang belum cair, biaya sebenarnya LEBIH BESAR dari yang terhitung. Karena itu
   * status laba tidak boleh disebut "valid" selama masih ada yang tertunda.
   */
  const mayarFeesPeriod = await loadMayarFees();
  let mayarFee = 0;
  let mayarPendingCount = 0;
  for (const order of validOrders) {
    const provider = String((order as { payment_provider?: string | null }).payment_provider || "").toLowerCase();
    if (provider !== "mayar") continue;
    const ref = String((order as { payment_ref?: string | null }).payment_ref || "").trim();
    const detail = ref ? mayarFeesPeriod.get(ref) : undefined;
    if (detail && detail.status === "settled" && Number.isFinite(detail.fee)) {
      mayarFee += detail.fee;
    } else {
      // Dibayar tapi belum cair, atau belum tercatat di Mayar → biaya belum diketahui.
      mayarPendingCount += 1;
    }
  }

  /*
   * ── Biaya operasional & packing dari menu Pengeluaran ──
   * Basis `expenses.tanggal` (tanggal pengeluaran), sama dengan halaman Pengeluaran.
   * Mayar tetap dipisah sebagai biaya transaksi; Total Biaya = packing + operasional + Mayar.
   */
  const biayaPacking = expenseRows
    .filter((row) => row.tipe === "packing")
    .reduce((sum, row) => sum + (Number(row.jumlah) || 0), 0);
  const biayaOperasional = expenseRows
    .filter((row) => row.tipe === "operasional")
    .reduce((sum, row) => sum + (Number(row.jumlah) || 0), 0);
  const biaya = biayaPacking + biayaOperasional + mayarFee;
  /**
   * Biaya dianggap lengkap hanya bila tabel pengeluaran terbaca DAN seluruh transaksi Mayar
   * periode ini sudah cair. Kalau tidak, laba masih bisa turun setelah biaya menyusul.
   */
  const biayaAvailable = expensesAvailable && mayarPendingCount === 0;

  /*
   * ── Rincian "Breakdown Pengeluaran" ──
   * Hanya untuk tampilan detail (per produk / per kanal / per pengeluaran).
   * Totalnya tetap angka di atas (hpp, mayarFee, biayaPacking/Operasional),
   * jadi agregasi ini tidak boleh mengubah perhitungan mana pun.
   */
  /**
   * Varian baris pesanan (`Kain … · warna · ukuran`). Dipakai bersama rincian HPP dan free gift
   * supaya baris produk yang sama tapi variannya beda (mis. Cover Thobe vs Set Hanger) tidak
   * digabung jadi satu baris.
   */
  const variantOf = (item: any) =>
    [
      item.kain ? `Kain ${item.kain}` : "",
      item.color && item.color !== "default" ? String(item.color) : "",
      item.size ? String(item.size) : "",
    ]
      .filter(Boolean)
      .join(" · ");

  const cogsGroups = new Map<
    string,
    { id: string; name: string; series: string; variant: string; qty: number; hpp: number; unknownQty: number }
  >();
  for (const item of orderItems) {
    if (!validIds.has(String(item.order_id || ""))) continue;
    const qty = Number(item.quantity ?? item.qty) || 0;
    if (qty <= 0) continue;
    const lineHpp = Number(item.hpp);
    const unitHpp = Number.isFinite(lineHpp) && lineHpp > 0 ? lineHpp : productHpp.get(String(item.product_id)) || 0;
    const name = String(item.product_name || "Tanpa nama");
    // Series disimpan di baris pesanan (`order_items.series`); `products.series` kosong di
    // database ini, jadi jangan dibaca dari katalog. Nama item lama bisa memuat series
    // ("Thobe Imron Series …" / "Thobe Superblack — Jiharkah") → ambil dari situ.
    const series = String(item.series || "").trim() || seriesFromName(name);
    const variant = variantOf(item);
    const key = `${item.product_id || name}|${series}|${variant}`;
    const row = cogsGroups.get(key) || { id: key, name, series, variant, qty: 0, hpp: 0, unknownQty: 0 };
    row.qty += qty;
    row.hpp += unitHpp * qty;
    if (unitHpp <= 0) row.unknownQty += qty;
    cogsGroups.set(key, row);
  }
  const cogsDetail = [...cogsGroups.values()].sort((a, b) => b.hpp - a.hpp || b.qty - a.qty);

  /*
   * ── Rincian biaya free gift ──
   * Barang yang dibagikan gratis pada periode ini: baris pesanan berharga Rp0 (bonus promo
   * website) dan baris cover hanger yang nilainya tertutup diskon pesanan (form Tambah
   * Transaksi memberi diskon Rp35.000 per cover). Biayanya memakai HPP per unit yang sama
   * dengan modal barang terjual, jadi rincian ini TIDAK menambah atau mengurangi total HPP.
   */
  const freeGiftGroups = new Map<
    string,
    {
      id: string;
      sku: string;
      name: string;
      series: string;
      variant: string;
      qty: number;
      unitHpp: number;
      cost: number;
      unknownQty: number;
    }
  >();
  const itemsOfOrder = new Map<string, any[]>();
  for (const item of orderItems) {
    const key = String(item.order_id || "");
    const list = itemsOfOrder.get(key);
    if (list) list.push(item);
    else itemsOfOrder.set(key, [item]);
  }
  const addFreeGift = (item: any, freeQty: number) => {
    if (freeQty <= 0) return;
    const productId = String(item.product_id || "");
    const lineHpp = Number(item.hpp);
    const unitHpp = Number.isFinite(lineHpp) && lineHpp > 0 ? lineHpp : productHpp.get(productId) || 0;
    const name = String(item.product_name || "Tanpa nama");
    const series = String(item.series || "").trim() || seriesFromName(name);
    // Varian ikut jadi bagian baris: satu produk bisa punya beberapa varian (Cover Thobe /
    // Cover Koko / Set Hanger) dan masing-masing harus tampil sendiri.
    const variant = variantOf(item);
    const key = `${productId || name}|${series}|${variant}`;
    const row =
      freeGiftGroups.get(key) ||
      {
        id: key,
        sku: productSku.get(productId) || "",
        name,
        series,
        variant,
        qty: 0,
        unitHpp,
        cost: 0,
        unknownQty: 0,
      };
    row.qty += freeQty;
    row.cost += unitHpp * freeQty;
    if (unitHpp <= 0) row.unknownQty += freeQty;
    freeGiftGroups.set(key, row);
  };
  for (const order of validOrders) {
    const items = itemsOfOrder.get(String(order.id)) || [];
    const discount = Number((order as { discount?: number | null }).discount) || 0;
    // Cover hanger gratis: cover Rp0 (promo website) + cover yang tertutup diskon pesanan.
    // Aturannya sama dengan `promoValueOf()` supaya jumlah cover di baris Promosi tidak beda.
    const coverItems = items.filter(
      (item) => item.product_id === "cover-hanger" || item.product_id === "addon-cover-hanger",
    );
    if (coverItems.length > 0) {
      const qtyOf = (item: any) => Number(item.quantity ?? item.qty) || 0;
      const priceOf = (item: any) => Number(item.price) || 0;
      const coverQty = coverItems.reduce((sum, item) => sum + qtyOf(item), 0);
      const coverGross = coverItems.reduce((sum, item) => sum + priceOf(item) * qtyOf(item), 0);
      const freeFromPriceQty = coverItems
        .filter((item) => priceOf(item) <= 0)
        .reduce((sum, item) => sum + qtyOf(item), 0);
      const coveredByDiscount = Math.min(
        Math.max(0, coverQty - freeFromPriceQty),
        Math.floor(Math.min(discount, coverGross) / COVER_HANGER_VALUE),
      );
      // Sisa cover yang tertutup diskon dibagikan ke baris berbayar sesuai urutan barisnya,
      // supaya tiap varian hanya menerima unitnya sendiri (bukan semuanya ke baris pertama).
      let discountLeft = coveredByDiscount;
      for (const item of coverItems) {
        const qty = qtyOf(item);
        const freeByPrice = priceOf(item) <= 0 ? qty : 0;
        const freeByDiscount = priceOf(item) > 0 ? Math.min(discountLeft, qty) : 0;
        discountLeft -= freeByDiscount;
        addFreeGift(item, freeByPrice + freeByDiscount);
      }
    }
    // Barang lain yang dibagikan tanpa harga.
    for (const item of items) {
      if (item.product_id === "cover-hanger" || item.product_id === "addon-cover-hanger") continue;
      if ((Number(item.price) || 0) > 0) continue;
      addFreeGift(item, Number(item.quantity ?? item.qty) || 0);
    }
  }
  const freeGiftItems = [...freeGiftGroups.values()].sort((a, b) => b.cost - a.cost || b.qty - a.qty);
  const freeGift = {
    items: freeGiftItems,
    total: freeGiftItems.reduce((sum, row) => sum + row.cost, 0),
    qty: freeGiftItems.reduce((sum, row) => sum + row.qty, 0),
    unknownQty: freeGiftItems.reduce((sum, row) => sum + row.unknownQty, 0),
  };

  const feeGroups = new Map<string, { channel: string; count: number; fee: number }>();
  for (const order of validOrders) {
    const provider = String((order as { payment_provider?: string | null }).payment_provider || "").toLowerCase();
    if (provider !== "mayar") continue;
    const ref = String((order as { payment_ref?: string | null }).payment_ref || "").trim();
    const detail = ref ? mayarFeesPeriod.get(ref) : undefined;
    if (!detail || detail.status !== "settled" || !Number.isFinite(detail.fee)) continue;
    const channel = paymentChannelLabel(detail.channel) || "Mayar";
    const row = feeGroups.get(channel) || { channel, count: 0, fee: 0 };
    row.count += 1;
    row.fee += detail.fee;
    feeGroups.set(channel, row);
  }
  const feeDetail = [...feeGroups.values()].sort((a, b) => b.fee - a.fee);

  const packingDetail = expenseRows
    .filter((row) => row.tipe === "packing")
    .map((row) => ({
      nama: String(row.nama_barang || row.kategori || "Packing"),
      qty: Number(row.qty) || 0,
      jumlah: Number(row.jumlah) || 0,
    }))
    .sort((a, b) => b.jumlah - a.jumlah);
  const operasionalDetail = expenseRows
    .filter((row) => row.tipe === "operasional")
    .map((row) => ({
      nama: String(row.kategori || row.nama_barang || "Operasional"),
      qty: Number(row.qty) || 0,
      jumlah: Number(row.jumlah) || 0,
    }))
    .sort((a, b) => b.jumlah - a.jumlah);
  const breakdown = { cogs: cogsDetail, fees: feeDetail, packing: packingDetail, operasional: operasionalDetail };

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
        : mayarPendingCount > 0
          ? `${mayarPendingCount} transaksi Mayar belum cair — biayanya belum dipotong, jadi laba masih bisa turun setelah dana masuk.`
          : "Tabel pengeluaran belum tersedia; biaya operasional & packing belum ikut dihitung, jadi laba belum final.";

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
    /** Rincian biaya: packing/operasional/Mayar dipisah supaya sumbernya jelas. */
    mayarFee,
    mayarPendingCount,
    biayaPacking,
    biayaOperasional,
    expensesAvailable,
    biayaAvailable,
    breakdown,
    /** Rincian HPP barang yang dibagikan gratis (free gift/promosi) — informasi, bukan pengurang. */
    freeGift,
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
    // Pemisahan sumber (Website / Reseller / Open Order / …) — pesanan reseller bisa
    // dilihat & dipisahkan dari penjualan lain tanpa mengubah angka omzet total.
    const sources = buildSourceBreakdown(current.validOrders);

    /*
     * ── Rekap promosi cover hanger ──
     * Pesanan WA dari form "Tambah Transaksi" sering menambahkan baris Cover Thobe + Hanger
     * lalu memberi diskon Rp35.000, jadi uang masuk tetap harga produk. Diskon itu tidak
     * dikirim ke mana pun sebelumnya; di sini dijumlah per periode supaya nilai promosi
     * terlihat terpisah dari omzet (omzet sudah memakai `total` setelah diskon).
     */
    const promo = current.validOrders.reduce(
      (acc, order) => {
        const { value, covers } = promoValueOf(order, current.itemsByOrder[String(order.id)] || []);
        acc.total += value;
        if (value > 0) {
          acc.orders += 1;
          acc.covers += covers;
        }
        return acc;
      },
      { total: 0, orders: 0, covers: 0 },
    );

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

    /*
     * ── Biaya transaksi Mayar ──
     * Hanya pesanan online (Mayar) yang punya biaya. Dicocokkan lewat `payment_ref`
     * (id invoice Mayar) ke daftar transaksi, karena `orders` tidak menyimpan id transaksi.
     *
     * Dua daftar dipisah supaya jelas mana yang angkanya SUDAH final:
     *  - `mayarSettled`  → dana cair, `fee` & `net` dari Mayar (angka pasti)
     *  - `mayarPending`  → sudah dibayar tapi belum cair; biaya BELUM ada, tidak ditebak
     */
    const mayarFees = await loadMayarFees();
    const mayarOrders = salesRows.filter((row) => {
      const provider = String((row as { payment_provider?: string | null }).payment_provider || "").toLowerCase();
      return provider === "mayar";
    });

    const mayarSettled: Array<Record<string, unknown>> = [];
    const mayarPending: Array<Record<string, unknown>> = [];

    for (const row of mayarOrders) {
      const ref = String((row as { payment_ref?: string | null }).payment_ref || "").trim();
      const detail = ref ? mayarFees.get(ref) : undefined;
      const settled = detail?.status === "settled" && Number.isFinite(detail?.fee);

      /*
       * Baris tabel biaya Mayar dibuka di drawer detail pesanan, jadi WAJIB membawa
       * seluruh data pesanan (items, subtotal, ongkir, diskon, alamat, resi, …).
       * Dulu hanya 5 field yang disalin → drawer menampilkan "Tidak ada produk tercatat"
       * dengan Subtotal/Ongkir Rp 0 padahal totalnya ratusan ribu.
       */
      const base = {
        ...row,
        channel: detail?.channel ?? null,
      };

      if (settled) {
        mayarSettled.push({ ...base, fee: detail!.fee, net: detail!.net });
      } else if (detail?.status === "paid") {
        /*
         * Hanya transaksi yang SUDAH DIBAYAR tapi belum cair. Pesanan yang belum dibayar
         * sama sekali (tidak ada transaksi / masih `unpaid`) sengaja TIDAK dimasukkan —
         * laporan ini soal uang yang sudah masuk, bukan tagihan menggantung. Pesanan seperti
         * itu tetap terlihat di menu Transaksi / Pesanan.
         */
        mayarPending.push({ ...base, mayar_status: detail.status });
      }
    }
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
        /* Rincian biaya — WAJIB ikut dikirim; tanpa ini kartu "Biaya Mayar" selalu Rp 0. */
        mayarFee: current.mayarFee,
        mayarPendingCount: current.mayarPendingCount,
        biayaPacking: current.biayaPacking,
        biayaOperasional: current.biayaOperasional,
        expensesAvailable: current.expensesAvailable,
        profitStatus: current.profitStatus,
        profitNote: current.profitNote,
        transactions: current.transactions,
        aov: current.aov,
        /* Rekap promosi cover hanger (nilai yang digratiskan, bukan pengurang omzet). */
        promoTotal: promo.total,
        promoOrders: promo.orders,
        promoCoverQty: promo.covers,
        /* Rincian biaya free gift (HPP barang yang dibagikan gratis). */
        freeGift: current.freeGift,
        hppReversal: false,
        biayaNote: current.expensesAvailable ? "" : "Tabel pengeluaran belum tersedia",
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
      sources,
      /* Rincian per produk / per kanal / per pengeluaran (kartu Breakdown Pengeluaran). */
      breakdown: current.breakdown,
      tables: {
        sales: salesRows,
        mayarSettled,
        mayarPending,
        returns: returnTable,
        exchanges: exchangeTable,
      },
    });
  } catch (error) {
    console.error("[OPS] laporan GET:", error);
    return NextResponse.json({ error: "Gagal memuat laporan keuangan" }, { status: 500 });
  }
}
