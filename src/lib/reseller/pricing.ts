/**
 * Harga reseller — SATU sumber aturan (dipakai katalog portal, pembuatan
 * pesanan, validasi harga jual, dan tab admin "Produk & Harga").
 *
 * - Produk/series hanya dijual kalau `products.reseller_enabled = true`
 *   (penyaringan baris dilakukan query, bukan di sini).
 * - Diskon efektif = diskon KHUSUS per series (`reseller_discount_percent`)
 *   kalau diisi, selain itu diskon DEFAULT pengaturan reseller.
 * - Harga beli = harga katalog × (1 − diskon efektif/100), dibulatkan ke rupiah.
 * - Batas harga jual = nilai tertinggi antara `reseller_min_sell_price`
 *   (kolom KHUSUS reseller, terpisah dari `products.minimum_price` milik CYP)
 *   dan harga beli reseller.
 */

export interface ResellerPriceable {
  price: number;
  /** Diskon khusus series (persen). NULL/kosong = pakai diskon default. */
  reseller_discount_percent?: number | string | null;
  /** Batas minimum harga jual khusus reseller. */
  reseller_min_sell_price?: number | null;
}

/** Diskon dipotong ke rentang wajar 0–100. */
export function clampDiscount(value: number): number {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}

/** Persen diskon khusus (0–100); null/NaN dianggap 0. */
export function discountPercent(value?: number | string | null): number {
  return clampDiscount(Number(value));
}

/** Diskon yang benar-benar dipakai: khusus series kalau ada, selain itu default. */
export function effectiveDiscountPercent(product: ResellerPriceable, defaultPercent: number): number {
  const raw = product?.reseller_discount_percent;
  if (raw === null || raw === undefined || String(raw).trim() === "") {
    return clampDiscount(Number(defaultPercent));
  }
  return clampDiscount(Number(raw));
}

/** Harga beli reseller = harga katalog dipotong diskon efektif, dibulatkan. */
export function resellerBuyPrice(product: ResellerPriceable, defaultPercent: number): number {
  const base = Math.round(Number(product.price) || 0);
  return Math.round(base * (1 - effectiveDiscountPercent(product, defaultPercent) / 100));
}

/**
 * Batas bawah harga jual reseller = max(`reseller_min_sell_price`, harga beli).
 * TIDAK memakai `products.minimum_price` (itu milik Create Your Price).
 */
export function resellerMinSellPrice(product: ResellerPriceable, defaultPercent: number): number {
  const minimum = Math.round(Number(product.reseller_min_sell_price) || 0);
  return Math.max(minimum, resellerBuyPrice(product, defaultPercent));
}
