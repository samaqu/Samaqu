/**
 * State & konfigurasi alur pemesanan promo "Free Cover Hanger".
 *
 * Alurnya mengikuti Open Order (katalog → detail produk → keranjang → data → review),
 * tetapi harga TIDAK bisa dipilih sendiri (Create Your Price tidak dipakai) dan
 * bonus Cover Hanger ditambahkan otomatis.
 *
 * File ini sengaja terpisah dari `open-order/types.ts` supaya perubahan promo tidak
 * menyentuh wizard Open Order yang sudah jalan.
 */

import type { CustomerData } from "@/components/open-order/types";

/** Satu item yang dipilih di katalog promo. Harga selalu dari katalog (bukan input customer). */
export interface PromoDraft {
  productId: string;
  name: string;
  color: string;
  size: string;
  series: string;
  quantity: number;
  /** Harga satuan dari katalog saat item ditambahkan. */
  price: number;
  image: string;
}

export interface PromoCartLine extends PromoDraft {
  key: number;
}

export type PromoStep = "katalog" | "detail" | "keranjang" | "data" | "review";

/** Ringkasan hasil pengecekan "pelanggan baru" — dilakukan di server. */
export interface PromoEligibility {
  /** true = belum pernah beli → berhak bonus. */
  eligible: boolean;
  /** Dikirim hanya setelah nomor WhatsApp diisi dan dicek. */
  checked: boolean;
  error?: string;
}

/**
 * Re-export tipe data pemesan dari Open Order supaya langkah "data" bisa memakai
 * `LocationPicker` & aturan ongkir yang sama. Promo tidak memakai Instagram.
 */
export type PromoCustomer = CustomerData;

export const EMPTY_PROMO_CUSTOMER: PromoCustomer = {
  name: "",
  whatsapp: "",
  address: "",
  provinceId: "",
  cityId: "",
  districtId: "",
  district: "",
  city: "",
  postalCode: "",
  notes: "",
};

/** Pesan bawaan saat bonus tidak bisa diberikan (pelanggan lama). */
export const BONUS_INELIGIBLE_MESSAGE =
  "Nomor WhatsApp ini sudah pernah berbelanja di SAMAQU. Bonus Cover Hanger hanya untuk pembelian pertama — pesananmu tetap bisa dilanjutkan tanpa bonus.";

/** Pesan saat stok bonus habis. Pesanan tetap bisa lanjut tanpa bonus. */
export const BONUS_OUT_OF_STOCK_MESSAGE =
  "Stok bonus Cover Hanger sedang habis. Kamu tetap bisa menyelesaikan pesanan tanpa bonus.";

export function promoSavings(price: number, quantity: number): number {
  return Math.round(price) * Math.max(1, quantity);
}

export function promoSubtotal(lines: PromoCartLine[]): number {
  return lines.reduce((sum, line) => sum + promoSavings(line.price, line.quantity), 0);
}
