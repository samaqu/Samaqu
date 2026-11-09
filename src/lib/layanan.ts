/**
 * Baris layanan (bukan barang) di pesanan.
 *
 * "Jasa Potong Panjang" dijual sebagai produk katalog tersembunyi supaya bisa masuk
 * `order_items` dan ikut total pesanan. Barangnya tidak punya stok, jadi stok TIDAK
 * boleh dipotong/dikembalikan dan tidak ikut laporan stok/produk terlaris.
 */
export const POTONG_PANJANG_ID = "jasa-potong-panjang";
export const POTONG_PANJANG_NAME = "Jasa Potong Panjang";
export const POTONG_PANJANG_PRICE = 35_000;
export const LAYANAN_CATEGORY = "Jasa";

export function isLayananCategory(category?: string | null) {
  return String(category || "").trim().toLowerCase() === LAYANAN_CATEGORY.toLowerCase();
}

/** Baris layanan dikenali dari id, atau dari nama kalau data lama menyimpannya lain. */
export function isLayananLine(item?: { product_id?: unknown; product_name?: unknown; category?: unknown } | null) {
  if (!item) return false;
  if (isLayananCategory(item.category as string | null | undefined)) return true;
  const id = String(item.product_id || "").trim().toLowerCase();
  if (id === POTONG_PANJANG_ID) return true;
  return String(item.product_name || "").trim().toLowerCase() === POTONG_PANJANG_NAME.toLowerCase();
}

export function isPotongPanjangLine(item?: { product_id?: unknown; product_name?: unknown } | null) {
  if (!item) return false;
  const id = String(item.product_id || "").trim().toLowerCase();
  if (id === POTONG_PANJANG_ID) return true;
  return String(item.product_name || "").trim().toLowerCase() === POTONG_PANJANG_NAME.toLowerCase();
}
