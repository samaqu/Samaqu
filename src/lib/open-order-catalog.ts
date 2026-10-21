/**
 * Helper tampilan alur Open Order (/open-order): format harga, rentang harga, kartu produk, dan
 * galeri foto.
 *
 * Semua data (termasuk foto) datang dari penawaran `open-order-offering.ts` — tiap varian sudah
 * membawa media baris katalognya, jadi tidak ada lagi pencocokan nama/kain ke katalog dan
 * helper ini jalan untuk semua kategori.
 */

import { openOrderVariantFor, type OpenOrderMedia, type OpenOrderProduct } from "@/lib/open-order-offering";

/** Format harga seragam untuk seluruh alur: "Rp329.000". */
export const money = (value: number) => `Rp${value.toLocaleString("id-ID")}`;

/** Rentang harga produk, mis. "Rp329.000 - Rp344.000". Produk tanpa series → satu harga. */
export function priceRange(product: OpenOrderProduct): string {
  if (product.series.length === 0) return money(product.price);
  const prices = product.series.map((series) => series.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? money(min) : `${money(min)} - ${money(max)}`;
}

/** Foto utama (gambar) untuk kombinasi warna (+ series); fallback foto produk. */
export function openOrderImage(product: OpenOrderProduct, color: string, series?: string | null): string {
  const media = openOrderVariantFor(product, color, series)?.media ?? [];
  return media.find((item) => item.type === "image")?.src ?? media[0]?.src ?? product.image ?? "";
}

/**
 * Galeri (gambar + video) untuk kombinasi warna + series — sumbernya baris katalog yang sama
 * dengan halaman detail katalog, jadi medianya sama persis (termasuk video).
 */
export function openOrderGallery(product: OpenOrderProduct, color: string, series?: string | null): OpenOrderMedia[] {
  const media = openOrderVariantFor(product, color, series)?.media ?? [];
  if (media.length > 0) return media;
  return product.image ? [{ src: product.image, type: "image" }] : [];
}

/**
 * Foto utama KARTU produk (bukan halaman detail).
 *
 * `product.image` bisa saja berupa video (media pertama sebuah baris katalog), dan `<img>` tidak
 * bisa merendernya — dulu kartu Open Order jadi kosong untuk produk seperti Thobe Superblack.
 * Jadi utamakan media bertipe `image` (dari varian warna terpilih, lalu varian lain), baru
 * jatuh ke `product.image` kalau memang bukan video.
 */
export function openOrderProductImage(product: OpenOrderProduct, color?: string | null): string {
  const wanted = String(color ?? "").trim();
  const ordered = wanted
    ? [...product.variants.filter((variant) => variant.color === wanted), ...product.variants]
    : product.variants;

  for (const variant of ordered) {
    const image = variant.media.find((item) => item.type === "image");
    if (image?.src) return image.src;
  }

  const fallback = product.image || "";
  if (fallback && !/\.(mp4|m4v|webm)(\?|$)/i.test(fallback)) return fallback;
  return "";
}

