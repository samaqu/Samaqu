/**
 * Format & warna badge yang dipakai menu Transaksi (halaman, form, dan drawer detail).
 *
 * Dikumpulkan di satu tempat supaya tabel, filter, dan detail menampilkan istilah serta
 * warna yang sama persis — polanya mengikuti badge Sumber di halaman Leads.
 */

import { BadgeCheck, Ban, Camera, CheckCircle2, Clock, Globe, MessageCircle, Music2, ShoppingBag, Store, Truck } from "lucide-react";
import { isPaketItem, variantName } from "@/lib/item-label";

/**
 * Badge warna + ikon per sumber transaksi.
 * Ikonnya pakai lambang yang gampang dikenali (globe = website, balon chat = WhatsApp, dst)
 * supaya sumbernya kebaca sekilas tanpa harus membaca tulisannya.
 */
export const SOURCE_STYLES = {
  website: { label: "Website", icon: Globe, badge: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300" },
  whatsapp: { label: "WhatsApp", icon: MessageCircle, badge: "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300" },
  instagram: { label: "Instagram", icon: Camera, badge: "bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300" },
  shopee: { label: "Shopee", icon: ShoppingBag, badge: "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300" },
  tiktok: { label: "TikTok Shop", icon: Music2, badge: "bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300" },
  offline: { label: "Offline", icon: Store, badge: "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300" },
  open_order: { label: "Open Order", icon: ShoppingBag, badge: "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300" },
  unknown: { label: "Tidak diketahui", icon: Clock, badge: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300" },
};

/** Badge + ikon per status pesanan (`orders.status`). */
export const STATUS_STYLES = {
  pending: { badge: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300", icon: Clock },
  diproses: { badge: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300", icon: BadgeCheck },
  dikirim: { badge: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300", icon: Truck },
  selesai: { badge: "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300", icon: CheckCircle2 },
  dibatalkan: { badge: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300", icon: Ban },
};

export const WEEKDAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

export const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** Bulan versi pendek — dipakai kolom tabel supaya tanggalnya tidak kepotong. */
export const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export const pad = (n) => String(n).padStart(2, "0");

export const formatRupiah = (value) => (value || 0).toLocaleString("id-ID");

/** "2026-10-01" → "Kamis, 1 Oktober 2026". */
export function formatTanggalID(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return iso || "-";
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${WEEKDAYS[date.getUTCDay()]}, ${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/**
 * Label ringkasan satu item (dipakai di langkah Produk & langkah Pembayaran):
 * nama produk LENGKAP · jenis kain · series · (warna) · ukuran
 * → "Thobe Charcoal Grey · Kain B-01 · Jiharkah · S".
 *
 * Sumbernya sama dengan yang dipakai server & Detail Transaksi — nama produk apa adanya
 * (`products.name`), jenis kain (`jenis_kain.name`), series, warna ASLI (hanya kalau produk
 * itu punya lebih dari satu warna, mis. Kandora), dan ukuran. Jenis kain selalu ikut tampil
 * karena warna yang sama bisa ada di beberapa jenis kain.
 */
export function itemSummaryParts({ product, kain, series, color, size }) {
  return [product, kain ? `Kain ${kain}` : "", series, color, size]
    .map((part) => String(part || "").trim())
    .filter(Boolean);
}

export function itemSummaryLabel(parts) {
  return itemSummaryParts(parts).join(" · ");
}

/**
 * Rincian varian satu item untuk tabel, mengikuti istilah & urutan di Detail Transaksi:
 * jenis kain → series → ukuran. Contoh: "Kain B-01 · Nahawand · XL".
 * Qty ditempel terpisah oleh pemanggil supaya bisa diberi bobot visual lebih ringan.
 */
export function itemVariantText(item) {
  if (!item) return "";
  // Cover & Hanger (paket): cukup nama paketnya — tanpa "ALL SIZE"/ukuran yang tidak berlaku.
  if (isPaketItem(item)) {
    return [item.kain ? `Kain ${item.kain}` : null, variantName(item.color) || variantName(item.series) || null].filter(Boolean).join(" · ");
  }
  return [item.kain ? `Kain ${item.kain}` : null, item.series || null, item.size || null].filter(Boolean).join(" · ");
}

/** "2026-10-01" → "1 Okt 2026" — versi pendek untuk kolom tabel (tanggal & jam lengkap ada di detail). */
export function formatTanggalSingkatID(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return iso || "-";
  return `${Number(m[3])} ${MONTHS_SHORT[Number(m[2]) - 1]} ${m[1]}`;
}

/** timestamptz → "Kamis, 1 Oktober 2026 · 14.30 WIB" (waktu WIB, bukan waktu server). */
export function formatTanggalJamID(iso) {
  if (!iso) return "-";
  const parts = isoToWibInput(iso);
  if (!parts.date) return "-";
  return `${formatTanggalID(parts.date)} · ${parts.time.replace(":", ".")} WIB`;
}

/** Waktu sekarang menurut WIB, untuk nilai awal form. */
export function wibNow() {
  const w = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return {
    date: `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}`,
    time: `${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}`,
  };
}

/** Tanggal + jam WIB → ISO untuk dikirim ke server. */
export function wibToIso(date, time) {
  const parsed = new Date(`${date}T${(time || "00:00")}:00+07:00`);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

/** timestamptz → { date: "YYYY-MM-DD", time: "HH:MM" } dalam WIB (untuk mengisi form ubah). */
export function isoToWibInput(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  const w = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return {
    date: `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}`,
    time: `${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}`,
  };
}
