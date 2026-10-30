/**
 * Harga-harga reseller — semua dihitung SERVER, tidak pernah dari browser.
 *
 * - Harga beli  = harga katalog × (1 − diskon/100), dibulatkan ke rupiah.
 * - Batas jual  = nilai tertinggi antara `products.minimum_price` dan harga beli.
 * - Produk dengan `reseller_discount_percent` NULL tidak dijual ke reseller.
 */

export interface ResellerPriceable {
  price: number;
  minimum_price?: number | null;
  reseller_discount_percent?: number | string | null;
}

/** Diskon reseller dalam persen (0–100); null/NaN dianggap 0. */
export function discountPercent(value?: number | string | null): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}

/** Harga beli reseller = harga katalog dipotong diskon, dibulatkan ke rupiah. */
export function resellerBuyPrice(product: ResellerPriceable): number {
  const base = Math.round(Number(product.price) || 0);
  return Math.round(base * (1 - discountPercent(product.reseller_discount_percent) / 100));
}

/**
 * Batas bawah harga jual reseller ke pelanggannya = max(harga minimum produk,
 * harga beli reseller). Harga jual belum termasuk ongkir.
 */
export function resellerMinSellPrice(product: ResellerPriceable): number {
  const minimum = Math.round(Number(product.minimum_price) || 0);
  return Math.max(minimum, resellerBuyPrice(product));
}
