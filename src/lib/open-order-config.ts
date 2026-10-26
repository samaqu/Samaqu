/**
 * Pengaturan Open Order Samaqu yang TIDAK berasal dari katalog.
 *
 * Daftar produk — kain, warna, series, dan harga — tidak lagi ditulis di sini: semuanya
 * diturunkan dari tabel `products` lewat `buildOpenOrderProducts()` di
 * `src/lib/open-order-offering.ts`, supaya perubahan harga/warna di katalog langsung
 * terpakai di wizard.
 *
 * Yang tetap statis di file ini hanya hal yang memang bukan data katalog: periode Open
 * Order, add-on Cover & Hanger, dan daftar ukuran.
 */

/** Periode Open Order yang sedang dibuka — ditampilkan di bawah judul /open-order. */
export const OPEN_ORDER_PERIOD = "8-15 Agustus 2026";

/** Tambahan Extra Cover & Hanger Samaqu (opsional, per pesanan). */
export const OPEN_ORDER_ADDON = {
  id: "addon-cover-hanger",
  name: "Extra Cover & Hanger Samaqu",
  price: 35000,
};

/**
 * Baris katalog yang secara fisik SAMA dengan add-on di atas.
 * Dipakai laporan/ranking supaya "Extra Cover & Hanger" tidak tampil sebagai baris terpisah
 * dari produk "Cover Hanger" — unitnya digabung, jumlah add-on-nya tetap dicatat.
 */
export const OPEN_ORDER_ADDON_TARGET_ID = "cover-hanger";

/**
 * Berat kirim add-on Cover & Hanger (gram) BILA admin belum mengaturnya di menu
 * "Open Order". Nilai resmi disimpan di `store_settings.open_order_addon_weight`
 * (`supabase/open-order-addon-weight.sql`) dan dibaca lewat `resolveAddonWeight`.
 */
export const DEFAULT_OPEN_ORDER_ADDON_WEIGHT = 300;

/** Berat add-on (gram) dari setting tersimpan; jatuh ke default kalau kosong/tidak valid. */
export function resolveAddonWeight(saved: unknown): number {
  const grams = Math.round(Number(saved));
  return Number.isFinite(grams) && grams > 0 ? grams : DEFAULT_OPEN_ORDER_ADDON_WEIGHT;
}

/** Ukuran yang bisa dipilih customer — tersimpan di kolom `size` (order_items). */
export const OPEN_ORDER_SIZES = ["S", "M", "L", "XL", "XXL"];
