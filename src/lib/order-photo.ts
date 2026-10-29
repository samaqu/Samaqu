/**
 * Foto asli katalog untuk baris pesanan — SATU sumber untuk admin & customer.
 *
 * Kenapa perlu: `order_items.product_image` sering kosong (mis. seluruh item Open Order sebelum
 * snapshot dipasang, atau baris lama yang fotonya ikut terhapus waktu pembersihan aset Cloudinary).
 * Dulu yang tampil waktu kolomnya kosong adalah satu foto produk cadangan yang sama untuk semua
 * item — akibatnya foto tiap item terlihat identik. Sekarang: snapshot dulu → foto katalog
 * (per warna kalau ada) → pencocokan katalog lama → placeholder netral.
 */

import type { Product } from "@/lib/katalog-data";
import { getProductThumbnail, isVideoUrl } from "@/lib/product-thumbnail";

export interface OrderItemPhotoKey {
  product_id?: string | null;
  product_name?: string | null;
  kain?: string | null;
  series?: string | null;
  color?: string | null;
  product_image?: string | null;
}

/** Sumber foto yang sudah disiapkan pemanggil (lihat `loadOrderPhotoLookup`). */
export interface OrderPhotoLookup {
  /** Foto utama katalog per `product_id`. */
  main?: Record<string, string>;
  /** Foto per `product_id` + warna, `"<product_id>|<warna>"` — hanya kalau produk punya foto per warna. */
  byColor?: Record<string, string>;
  /** Katalog penuh (untuk pesanan lama yang `product_id`-nya tidak bisa dicocokkan). */
  catalog?: Product[];
}

const norm = (value?: string | null) => (value || "").trim().toLowerCase();

/**
 * Placeholder netral kalau foto benar-benar tidak ada — BUKAN foto produk lain, supaya tidak ada
 * item yang "meminjam" foto produk berbeda.
 */
export const NEUTRAL_ITEM_PHOTO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">' +
      '<rect width="120" height="120" fill="#F1F1EF"/>' +
      '<g fill="none" stroke="#B9B9B2" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="32" y="38" width="56" height="44" rx="6"/><circle cx="48" cy="54" r="4"/>' +
      '<path d="M36 78l16-18 11 13 7-8 14 13"/>' +
      "</g></svg>"
  );

/** Foto cadangan dalam katalog untuk pesanan lama (tanpa `product_id` yang bisa dipakai). */
const kainCode = (product: Product) => norm(product.jenis_kain?.name ?? product.kain);

function catalogPhotoForLegacyItem(item: OrderItemPhotoKey, catalog: Product[]): string {
  if (catalog.length === 0) return "";

  const kain = norm(item.kain);
  const series = norm(item.series);
  const color = norm(item.color);
  const name = norm(item.product_name);

  const byKain = kain ? catalog.filter((product) => kainCode(product) === kain) : [];
  const byName = name
    ? catalog.filter((product) => {
        const productName = norm(product.name);
        return productName.length > 0 && (name.includes(productName) || productName.includes(name));
      })
    : [];
  const pool = byKain.length > 0 ? byKain : byName;
  if (pool.length === 0) return "";

  const bySeries = series ? pool.filter((product) => norm(product.series) === series) : [];
  const candidates = bySeries.length > 0 ? bySeries : pool;

  const exact = color ? candidates.find((product) => norm(product.name).endsWith(color)) : undefined;
  return getProductThumbnail(exact ?? candidates[0]) || "";
}

/**
 * Foto untuk satu baris pesanan. Prioritas:
 * 1. snapshot yang tersimpan di baris pesanan (kecuali berupa video — `<img>` tidak bisa memutarnya);
 * 2. foto katalog per `product_id` + warna;
 * 3. foto utama katalog per `product_id`;
 * 4. pencocokan katalog lama (kain + series + warna / nama produk).
 *
 * Mengembalikan "" kalau memang tidak ada foto — pemanggil memakai `NEUTRAL_ITEM_PHOTO`.
 */
export function orderItemPhoto(item: OrderItemPhotoKey, lookup?: OrderPhotoLookup | null): string {
  const snapshot = (item.product_image || "").trim();
  if (snapshot && !isVideoUrl(snapshot)) return snapshot;

  const id = (item.product_id || "").trim();
  const color = norm(item.color);
  if (id && color) {
    const byColor = lookup?.byColor?.[`${id}|${color}`];
    if (byColor) return byColor;
  }
  const main = id ? lookup?.main?.[id] : "";
  if (main) return main;

  return catalogPhotoForLegacyItem(item, lookup?.catalog ?? []);
}

/**
 * Daftar foto yang bisa dicoba, URUT sesuai prioritas `orderItemPhoto`:
 * snapshot → katalog per warna → katalog utama → pencocokan katalog lama.
 *
 * Dipakai `OrderItemThumb` supaya saat sebuah URL gagal dimuat (404) browser bisa pindah ke
 * kandidat berikutnya. `orderItemPhoto` tetap mengembalikan SATU hasil seperti sebelumnya.
 */
export function photoCandidates(item: OrderItemPhotoKey, lookup?: OrderPhotoLookup | null): string[] {
  const hasil: string[] = [];
  const push = (url?: string | null) => {
    const clean = (url || "").trim();
    if (clean && !isVideoUrl(clean) && !hasil.includes(clean)) hasil.push(clean);
  };

  // 1. Snapshot baris pesanan (dilewati kalau berupa video).
  push(item.product_image);

  // 2/3. Foto katalog per warna, lalu foto utama produk.
  const id = (item.product_id || "").trim();
  const color = norm(item.color);
  if (id && color) push(lookup?.byColor?.[`${id}|${color}`]);
  if (id) push(lookup?.main?.[id]);

  // 4. Pencocokan katalog lama (kain + series + warna / nama).
  push(catalogPhotoForLegacyItem(item, lookup?.catalog ?? []));

  return hasil;
}

/** Salin tiap item pesanan dengan `product_image` hasil `orderItemPhoto` (tanpa mengubah data lain). */
export function resolveItemPhotos<T extends OrderItemPhotoKey>(
  items: T[],
  lookup?: OrderPhotoLookup | null
): T[] {
  return items.map((item) => {
    const photo = orderItemPhoto(item, lookup);
    if (!photo || photo === item.product_image) return item;
    return { ...item, product_image: photo };
  });
}

/** Nama item yang tidak punya foto sama sekali — untuk laporan, bukan untuk tampilan. */
export function itemsWithoutPhoto<T extends OrderItemPhotoKey>(
  items: T[],
  lookup?: OrderPhotoLookup | null
): string[] {
  return items.filter((item) => !orderItemPhoto(item, lookup)).map((item) => item.product_name || "(tanpa nama)");
}
