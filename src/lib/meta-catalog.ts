/**
 * ID item katalog Meta — SATU sumber aturan untuk feed `/feed/meta.csv` DAN event Pixel/CAPI.
 *
 * Aturan feed (jangan diubah tanpa mengubah feed juga):
 *  - Produk ber-`series` (Thobe): SATU item per baris produk → `id` = `products.id`.
 *  - Produk tanpa `series` (Kandora, Koko, Kabak, Cover & Hanger): SATU item per ukuran →
 *    `id` = `${products.id}-${slug(ukuran)}` (mis. `kandora-broken-white-s`).
 *
 * Semua event (ViewContent, AddToCart, Purchase) memakai helper ini supaya ID yang dikirim
 * Pixel selalu sama dengan ID item yang sudah ada di katalog Meta.
 */

export interface MetaCatalogProductRef {
  id: string;
  /** `products.series` — string kosong/null berarti produk dipecah per ukuran di feed. */
  series?: string | null;
}

/** `S` → `s`, `ALL SIZE` → `all-size` — sama persis dengan pembentuk ID di feed. */
export function metaCatalogSizeSlug(size?: string | null): string {
  return String(size ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
}

/** ID item katalog untuk satu produk + ukuran. */
export function metaCatalogItemId(product: MetaCatalogProductRef, size?: string | null): string {
  if (String(product.series ?? "").trim()) return product.id;
  const slug = metaCatalogSizeSlug(size);
  return slug ? `${product.id}-${slug}` : product.id;
}

/** Semua ID item katalog untuk daftar ukuran (tanpa duplikat). */
export function metaCatalogItemIds(
  product: MetaCatalogProductRef,
  sizes: Array<string | null | undefined>
): string[] {
  return Array.from(new Set(sizes.map((size) => metaCatalogItemId(product, size))));
}

export interface MetaCatalogLine {
  id: string;
  series?: string | null;
  size?: string | null;
  quantity?: number | null;
  itemPrice?: number | null;
}

export interface MetaCatalogContent {
  id: string;
  quantity: number;
  item_price?: number;
}

/**
 * Baris `contents` Meta dari item pesanan. Baris dengan ID katalog yang sama digabung
 * (jumlah diakumulasi) supaya `content_ids` dan `contents[].id` konsisten.
 */
export function metaCatalogContents(lines: MetaCatalogLine[]): MetaCatalogContent[] {
  const merged = new Map<string, MetaCatalogContent>();

  for (const line of lines) {
    const id = metaCatalogItemId({ id: line.id, series: line.series }, line.size);
    const quantity = Math.max(1, Math.floor(Number(line.quantity) || 1));
    const existing = merged.get(id);
    if (existing) {
      existing.quantity += quantity;
      continue;
    }
    const price = Number(line.itemPrice);
    merged.set(id, {
      id,
      quantity,
      ...(Number.isFinite(price) ? { item_price: price } : {}),
    });
  }

  return Array.from(merged.values());
}

export function metaCatalogContentIds(contents: MetaCatalogContent[]): string[] {
  return Array.from(new Set(contents.map((item) => item.id)));
}
