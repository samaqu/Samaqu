/**
 * Katalog layanan J&T yang didukung SAMAQU — SATU sumber supaya harga yang ditagih ke pembeli
 * dan layanan resinya tidak pernah berbeda.
 *
 * Dua API J&T memakai penamaan berbeda:
 *  - **Tariff Check** memakai `productType` sebagai kode permintaan.
 *  - **Create Order** memakai `expresstype` = `productCode` dari respons Tariff Check
 *    (mis. "EZ"/"ECO"). Jangan memakai nomor legacy "1".
 *  - Layanan baru cukup ditambahkan lewat env `JNT_PRODUCT_TYPES` (dipisah koma);
 *    label & kode diambil dari respons J&T, jadi tidak perlu ubah kode.
 */

import { isCustomCourier } from "../custom-courier";

export type JntLayanan = {
  /** Kode layanan untuk Tariff Check (`productType`) dan label di UI. */
  code: string;
  label: string;
  note: string;
  /** Estimasi standar layanan J&T. Tariff Check API tidak mengirim ETA per rute. */
  estimate: string;
  /**
   * Layanan manual: TIDAK pernah dicek ke Tariff Check dan TIDAK dibuatkan resi otomatis —
   * pesanannya dibuat admin langsung di J&T VIP, lalu nomor resinya diinput di dashboard.
   */
  manual?: boolean;
};

/**
 * Seed layanan yang diminta ke Tariff Check. `productCode` dari respons J&T
 * yang dipakai saat Create Order. Kalau J&T menambah layanan baru, tambahkan
 * kodenya lewat env `JNT_PRODUCT_TYPES` (dipisah koma) tanpa mengubah kode.
 */
export const JNT_LAYANAN: JntLayanan[] = [
  { code: "EZ", label: "J&T EZ (Reguler)", note: "Cepat, 2-4 hari", estimate: "2-4 hari" },
  { code: "ECO", label: "J&T ECO (Hemat)", note: "Lebih murah, 3-7 hari", estimate: "3-7 hari" },
  {
    code: "HBO",
    label: "J&T HBO",
    note: "Dibuat manual di J&T VIP",
    estimate: "-",
    manual: true,
  },
];

/** Layanan yang bisa dibuatkan resi otomatis lewat API J&T (EZ/ECO). */
export const JNT_LAYANAN_API = JNT_LAYANAN.filter((layanan) => !layanan.manual);

/** True kalau layanan ini manual (HBO) — resi diinput admin, bukan lewat API. */
export function isManualService(code?: string | null): boolean {
  return layananByCode(code)?.manual === true;
}

export function layananByCode(code?: string | null): JntLayanan | null {
  const cari = String(code ?? "").trim().toUpperCase();
  return JNT_LAYANAN.find((layanan) => layanan.code === cari) || null;
}

export function labelLayanan(code?: string | null): string {
  const layanan = layananByCode(code);
  return layanan ? layanan.label : String(code ?? "").trim();
}

/**
 * Nilai `expresstype` yang dikirim ke J&T saat membuat resi.
 * J&T sekarang memakai productCode (mis. "EZ"/"ECO"), bukan nomor legacy "1".
 */
export function expressTypeUntuk(code?: string | null): string {
  return String(code ?? "").trim();
}

/**
 * Kode layanan J&T (EZ/ECO) dari teks yang tersimpan di `orders.shipping_method`.
 * Nilai lama bisa berupa "reguler", "J&T - EZ", atau "J&T - J&T ECO (Hemat)".
 */
export function jntServiceCodeFromShippingMethod(value?: string | null): string | null {
  // Kurir lain (nama bebas, bisa memuat "EZ"/"ECO"/"HBO") bukan layanan J&T sama sekali.
  if (isCustomCourier(value)) return null;
  const text = String(value ?? "").toUpperCase();
  // HBO dicek lebih dulu: teksnya "J&T HBO", tidak mengandung EZ/ECO.
  if (text.includes("HBO")) return "HBO";
  if (text.includes("ECO")) return "ECO";
  if (text.includes("EZ")) return "EZ";
  return null;
}

/** Tag pendek untuk detail pesanan & label: "Service EZ" / "Service ECO". */
export function jntServiceTag(value?: string | null, fallback = "EZ"): string {
  return `Service ${jntServiceCodeFromShippingMethod(value) || fallback}`;
}
