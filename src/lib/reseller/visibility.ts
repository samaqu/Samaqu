/**
 * Klasifikasi "Tampil di" — SATU sumber untuk tab admin Produk & Harga dan
 * katalog portal reseller.
 *
 * - `katalog`    = `products.is_published` (tampil di katalog website)
 * - `open_order` = khusus Open Order (tidak tampil di katalog website)
 * - `tersembunyi`= tidak tampil di keduanya
 *
 * Reseller hanya menjual produk `katalog`; Open Order & tersembunyi tidak ikut.
 */

export type CatalogVisibility = "katalog" | "open_order" | "tersembunyi";

export function catalogVisibility(product: {
  is_published?: boolean | null;
  open_order_enabled?: boolean | null;
}): CatalogVisibility {
  if (product.is_published === true) return "katalog";
  if (product.open_order_enabled === true) return "open_order";
  return "tersembunyi";
}

export function isWebsiteCatalog(product: {
  is_published?: boolean | null;
  open_order_enabled?: boolean | null;
}): boolean {
  return catalogVisibility(product) === "katalog";
}

export function visibilityLabel(product: {
  is_published?: boolean | null;
  open_order_enabled?: boolean | null;
}): string {
  const visibility = catalogVisibility(product);
  if (visibility === "katalog") return "Katalog website";
  if (visibility === "open_order") return "Open Order";
  return "Tersembunyi";
}
