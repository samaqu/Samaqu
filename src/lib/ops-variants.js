/**
 * Helper varian & stok — sama persis dengan app Base44 (src/lib/variants.js),
 * supaya aturan stok di dashboard internal identik: 0 = habis, <=5 = menipis.
 */
export const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

export const emptyStock = () => Object.fromEntries(SIZES.map((s) => [s, 0]));

export function normalizeStock(stock) {
  const base = emptyStock();
  if (!stock || typeof stock !== "object") return base;
  for (const s of SIZES) {
    const val = Number(stock[s]);
    base[s] = Number.isFinite(val) ? Math.max(0, Math.round(val)) : 0;
  }
  return base;
}

export function sumStock(stock) {
  return Object.values(normalizeStock(stock)).reduce((a, b) => a + b, 0);
}

export function stockStatus(total) {
  if (total === 0) return "habis";
  if (total <= 5) return "menipis";
  return "aman";
}

export function totalStockOfVariants(variants, productId) {
  return (variants || [])
    .filter((v) => v.product_id === productId)
    .reduce((sum, v) => sum + sumStock(v.stock), 0);
}

/**
 * Varian yang sudah tidak dijual (`is_sellable = false`).
 *
 * Sumber utama: penanda `is_sellable` yang dikirim `/api/ops/product-variants` per baris.
 * Cadangan untuk respons lama: `__blocked_sizes` (semua ukuran diblokir = varian pensiun).
 */
export function varianPensiun(v) {
  if (v?.is_sellable === false) return true;
  if (v?.is_sellable === true) return false;
  const blocked = v?.__blocked_sizes || {};
  const sizes = Object.keys(v?.stock || {});
  if (sizes.length === 0) return Object.keys(blocked).length > 0;
  return sizes.every((size) => blocked[size] === true);
}

/**
 * Varian yang stoknya berasal dari KOMPONEN (`track_stock = false`).
 * Stoknya sah untuk ditampilkan, tetapi tidak boleh dijumlahkan ke total gudang —
 * komponennya sudah dihitung sebagai produk sendiri (hindari hitung ganda).
 */
export function varianKomponen(v) {
  if (v?.track_stock === false) return true;
  return Boolean(v?.component_tracked) || Object.keys(v?.component_sizes || {}).length > 0;
}
