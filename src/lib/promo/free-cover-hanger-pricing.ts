/**
 * Aturan harga jalur PROMO Free Cover Hanger.
 *
 * Promo FCH menjual dengan **harga katalog** (`products.price`) — tidak memakai harga khusus
 * Open Order (`open_order_price` / `open_order_minimum_price` / `open_order_cyp_enabled`) dan
 * tidak memakai Create Your Price milik katalog.
 *
 * Jalur Open Order (`/open-order`, `/api/open-order`) TIDAK memakai file ini dan tetap
 * memakai `openOrderEffectivePrice()` di `lib/open-order-offering.ts` apa adanya.
 */

/** Kolom harga Open Order yang harus diabaikan di jalur promo. */
const OPEN_ORDER_PRICE_COLUMNS = [
  "open_order_price",
  "open_order_minimum_price",
  "open_order_recommended_price",
  "open_order_cyp_enabled",
  "open_order_cyp_microcopy",
] as const;

/**
 * Kosongkan blok harga Open Order pada satu baris katalog promo.
 *
 * `buildOpenOrderProducts()` memakai `open_order_*` begitu kolomnya terisi (lewat
 * `openOrderEffectivePrice`), sehingga harga kampanye Open Order bocor ke promo. Dengan
 * kolomnya dikosongkan, helper bersama itu otomatis memakai `price` katalog — tanpa perlu
 * mengubah logika Open Order sendiri.
 */
export function withFchPrice<T extends Record<string, unknown>>(row: T): T {
  const cleaned: Record<string, unknown> = { ...row };
  for (const column of OPEN_ORDER_PRICE_COLUMNS) cleaned[column] = null;
  return cleaned as T;
}

/** Harga jual satu baris produk pada jalur promo = `products.price` (harga katalog). */
export function fchCatalogPrice(row: { price?: number | null }): number {
  return Number(row.price) || 0;
}
