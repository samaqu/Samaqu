/**
 * Sumber & status untuk menu Transaksi (dashboard internal /ops).
 *
 * Satu tempat untuk kunci `orders.source` + label yang dibaca admin, dipakai bersama
 * oleh halaman Transaksi, form Tambah/Edit, dan API `/api/ops/transaksi` supaya layar
 * dan server tidak pernah beda istilah.
 *
 * Catatan: pesanan dari website TIDAK menulis kolom ini (default database sudah
 * `website`), jadi checkout dan Open Order tidak perlu diubah.
 */

/** Kunci yang disimpan di `orders.source`. */
export const SOURCE_KEYS: string[] = ["website", "whatsapp", "instagram", "shopee", "tiktok", "offline"];

/** Label yang dibaca admin (badge di tabel & filter). */
export const SOURCE_LABEL: Record<string, string> = {
  website: "Website",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  shopee: "Shopee",
  tiktok: "TikTok Shop",
  offline: "Offline",
};

/** Sumber yang boleh dipilih dari form — Website otomatis dari checkout website. */
export const MANUAL_SOURCE_KEYS: string[] = SOURCE_KEYS.filter((key) => key !== "website");

/** Normalisasi nilai sumber apa pun ke kunci yang dikenal (default: `website`). */
export function sourceKey(value: unknown): string {
  const key = String(value ?? "").trim().toLowerCase();
  return SOURCE_KEYS.includes(key) ? key : "website";
}

export function sourceLabel(value: unknown): string {
  return SOURCE_LABEL[sourceKey(value)] || "Website";
}

/**
 * Sumber pesanan yang dipakai SEMUA halaman (Order Management, Admin Operasional,
 * dan dashboard Ops). Aturannya satu:
 *
 * - awalan `CYO-` -> Open Order, apa pun isi kolom `source` (data lama menyimpan "website");
 * - awalan `SMQ-` -> Website (checkout website tidak menulis kolom `source`);
 * - selain itu -> nilai `source` yang dikenal (whatsapp, instagram, dst);
 * - kalau kosong/tidak dikenal -> "Tidak diketahui", BUKAN diam-diam "Website".
 */
export const OPEN_ORDER_SOURCE_KEY = "open_order";
export const UNKNOWN_SOURCE_KEY = "unknown";

export const ORDER_SOURCE_LABEL: Record<string, string> = {
  ...SOURCE_LABEL,
  [OPEN_ORDER_SOURCE_KEY]: "Open Order",
  [UNKNOWN_SOURCE_KEY]: "Tidak diketahui",
};

export function orderSourceKey(order?: { order_number?: string | null; source?: unknown } | null): string {
  const number = String(order?.order_number ?? "").trim().toUpperCase();
  if (number.startsWith("CYO-")) return OPEN_ORDER_SOURCE_KEY;

  const raw = String(order?.source ?? "").trim().toLowerCase();
  if (SOURCE_KEYS.includes(raw)) return raw;

  if (number.startsWith("SMQ-")) return "website";
  return UNKNOWN_SOURCE_KEY;
}

export function orderSourceLabel(order?: { order_number?: string | null; source?: unknown } | null): string {
  return ORDER_SOURCE_LABEL[orderSourceKey(order)] || ORDER_SOURCE_LABEL[UNKNOWN_SOURCE_KEY];
}

/** Status pesanan → istilah yang dibaca admin di menu Transaksi. */
export const STATUS_LABEL: Record<string, string> = {
  pending: "Belum Bayar",
  diproses: "Lunas",
  dikirim: "Dikirim",
  selesai: "Selesai",
  dibatalkan: "Dibatalkan",
};

export function statusLabel(status: unknown): string {
  return STATUS_LABEL[String(status ?? "")] || String(status ?? "-");
}

/**
 * Status yang dihitung sebagai penjualan sah (omset & pcs terjual).
 * Pesanan batal dan yang belum dibayar tidak ikut dihitung.
 */
export const SALE_STATUSES: string[] = ["diproses", "dikirim", "selesai"];

/**
 * Jumlah TRANSAKSI (pesanan sah) dari sekumpulan pesanan — satu aturan bersama `SALE_STATUSES`.
 *
 * Angkanya sama persis dengan kartu "Total Transaksi" di dashboard ops dan "N transaksi" di
 * Laporan Keuangan, dan sejak 2026-10-24 juga jadi NILAI kartu "Pesanan Masuk" di dashboard admin
 * (permintaan pemilik: "belum bayar juga jangan dihitung") — pesanan yang belum dibayar/batal
 * memang bukan pesanan masuk. Kartu "Pesanan masuk" di beranda panel admin ikut aturan yang sama
 * (permintaan pemilik 2026-10-24: "ikut Admin persis"): nilainya angka ini, keterangannya
 * `SALE_BASIS_NOTE` ("Di luar batal & belum bayar") — kalimat yang sama di keempat layar.
 */
export function saleCount(orders: { status?: string | null }[] | null | undefined): number {
  return (orders || []).filter((o) => SALE_STATUSES.includes(String(o?.status || "").toLowerCase())).length;
}

/**
 * Kalimat basis "jumlah transaksi" — teks yang SAMA di dashboard admin, panel admin, ops, dan laporan.
 * Dipendekkan atas permintaan pemilik ("keterangan card jangan terlalu panjang"): status mana yang
 * dihitung tetap dijelaskan sekali di komentar `SALE_STATUSES` di atas, bukan di setiap kartu.
 */
export const SALE_COUNT_NOTE = "transaksi diakui";

/**
 * Keterangan kartu hitungan pesanan/transaksi — teks yang SAMA di dashboard admin, menu Transaksi
 * (ops & panel admin), dan beranda panel admin. Nilai besarnya selalu `saleCount()` (diproses /
 * dikirim / selesai), jadi keterangannya menyebut status yang TIDAK dihitung.
 *
 * 2026-10-24 (permintaan pemilik): kalimat "dari N pesanan masuk <periode>" diganti
 * "Di luar batal & belum bayar".
 */
export const SALE_BASIS_NOTE = "Di luar batal & belum bayar";

/**
 * Omset satu pesanan = HARGA PRODUK saja (total − ongkir).
 *
 * Ongkir yang dibayar customer bukan pendapatan toko: itu uang titipan untuk jasa kirim, dan
 * biaya J&T-nya sendiri sudah dibukukan sebagai pengurang di menu Ongkir J&T (lapisan "omzet
 * produk" di sana memakai rumus yang sama). Kalau ongkir ikut dihitung, omset terbaca lebih
 * besar dari penjualan sebenarnya.
 *
 * Rumusnya `total - ongkir` (bukan kolom `subtotal`) supaya diskon voucher tetap terpotong dan
 * nilainya persis sama dengan jumlah `order_items.price × quantity`.
 */
export function orderRevenue(order?: { total?: unknown; shipping_cost?: unknown } | null): number {
  return Math.max(0, (Number(order?.total) || 0) - (Number(order?.shipping_cost) || 0));
}

/** Ringkasan produk satu baris daftar, mis. `Jiharkah B-01 x2 +1 lainnya`. */
export function itemSummary(
  items: { series?: string | null; kain?: string | null; product_name?: string | null; quantity?: number | null }[],
): string {
  if (!items || items.length === 0) return "-";
  const first = items[0];
  const name = String(first.series || first.product_name || "Item").trim();
  const kain = String(first.kain || "").trim();
  const qty = Number(first.quantity) || 0;
  const head = `${name}${kain ? ` ${kain}` : ""} x${qty}`;
  const rest = items.length - 1;
  return rest > 0 ? `${head} +${rest} lainnya` : head;
}

/* ── Harga manual (admin boleh mengetik harga satuan sendiri) ── */

/**
 * Batas harga manual di form Tambah/Ubah Transaksi. Dipakai bersama oleh form (penanda
 * error di baris) dan `/api/ops/transaksi` (validasi server) supaya aturannya satu.
 * Batas atas hanya penjaga salah ketik; bawah tidak boleh 0 karena baris pesanan
 * menyimpan harga satuan yang benar-benar dibayar.
 */
export const MANUAL_PRICE_MIN = 1;
export const MANUAL_PRICE_MAX = 99_999_999;

/** Harga manual benar-benar dikirim/diisi? (dipakai untuk membedakan "kosong" dari "salah isi"). */
export function hasManualPrice(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

/**
 * Normalisasi harga manual → bilangan bulat dalam batas, atau `null` kalau tidak sah
 * (bukan angka, 0, negatif, atau di luar batas). Pemanggil yang memutuskan:
 * server menolak permintaan, form menandai barisnya salah.
 */
export function manualPrice(value: unknown): number | null {
  if (!hasManualPrice(value)) return null;
  const n = Math.round(Number(String(value).trim()));
  if (!Number.isFinite(n) || n < MANUAL_PRICE_MIN || n > MANUAL_PRICE_MAX) return null;
  return n;
}
