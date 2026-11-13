/**
 * Pengolah tampilan stok portal reseller (murni tampilan, tidak mengubah data).
 *
 * Satu "produk" di katalog = gabungan semua series dengan kategori + nama yang sama. Series yang
 * menumpang stok series lain (stok bersama, `base_product_id`) punya `stock_pool` yang sama, artinya
 * SATU stok fisik. Jumlah stok produk = jumlah per KOLAM, bukan per series, supaya tidak terhitung dobel.
 */

import type { KatalogProduct } from "./client";

export interface ProductGroup {
  key: string;
  name: string;
  category: string;
  /** Foto kartu = foto series pertama yang punya gambar (sama seperti pemilih produk Buat Pesanan). */
  image: string | null;
  rows: KatalogProduct[];
}

export interface StockPool {
  key: string;
  /** Nama series yang memakai kolam stok ini (urut seperti di katalog). */
  series: string[];
  rows: KatalogProduct[];
  /** Stok fisik kolam (satu salinan, bukan jumlah semua series). */
  total: number;
}

const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL", "4XL", "5XL"];

export const stockOf = (product: KatalogProduct): number =>
  product.variants.reduce((sum, variant) => sum + variant.stock, 0);

export function groupProducts(products: KatalogProduct[]): ProductGroup[] {
  const map = new Map<string, ProductGroup>();
  for (const product of products) {
    const key = `${product.category}|${product.name}`;
    const group = map.get(key) || { key, name: product.name, category: product.category, image: null, rows: [] };
    group.rows.push(product);
    if (!group.image && product.image) group.image = product.image;
    map.set(key, group);
  }
  return [...map.values()];
}

/** Saring series berdasarkan nama produk / nama series. Foto grup tetap dari grup penuh. */
export function filterGroups(groups: ProductGroup[], query: string): ProductGroup[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return groups;
  return groups
    .map((group) => ({
      ...group,
      rows: group.rows.filter(
        (row) => row.name.toLowerCase().includes(needle) || String(row.series || "").toLowerCase().includes(needle)
      ),
    }))
    .filter((group) => group.rows.length > 0);
}

export function poolsOf(group: ProductGroup): StockPool[] {
  const map = new Map<string, StockPool>();
  for (const row of group.rows) {
    const key = row.stock_pool || row.id;
    const pool = map.get(key) || { key, series: [], rows: [], total: 0 };
    pool.series.push(row.series || "Standar");
    pool.rows.push(row);
    map.set(key, pool);
  }
  const pools = [...map.values()];
  // Semua series satu kolam membaca stok efektif yang sama; cukup satu salinan.
  for (const pool of pools) pool.total = stockOf(pool.rows[0]);
  return pools;
}

/**
 * Satu baris per SERIES, tanpa menggabungkan series yang berbagi stok. Dipakai tabel menu Stok:
 * tiap series tampil sendiri dengan angka stok yang bisa dipesan lewat series itu.
 */
export function seriesPools(group: ProductGroup): StockPool[] {
  return group.rows.map((row) => ({
    key: row.id,
    series: [row.series || "Standar"],
    rows: [row],
    total: stockOf(row),
  }));
}

/** Stok fisik produk = jumlah stok tiap kolam (bukan jumlah tiap series). */
export const groupStock = (group: ProductGroup): number =>
  poolsOf(group).reduce((sum, pool) => sum + pool.total, 0);

/** Kolam stok milik satu series. */
export function poolOfRow(group: ProductGroup, row: KatalogProduct): StockPool {
  const key = row.stock_pool || row.id;
  return poolsOf(group).find((pool) => pool.key === key) ?? poolsOf({ ...group, rows: [row] })[0];
}

/** Kolom ukuran (gabungan semua kolam, urut XS → XXL; ukuran lain menyusul). */
export function sizeColumns(pools: StockPool[]): string[] {
  const sizes = new Set<string>();
  for (const pool of pools) for (const variant of pool.rows[0].variants) sizes.add(variant.size);
  const rank = (size: string) => {
    const index = SIZE_ORDER.indexOf(size.toUpperCase());
    return index === -1 ? SIZE_ORDER.length : index;
  };
  return [...sizes].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

const isDefaultColor = (color: string) => {
  const value = color.trim().toLowerCase();
  return value === "" || value === "default";
};

/**
 * Baris warna sebuah kolam. Thobe hanya punya warna "default" (nama warna ada di nama produk), jadi
 * satu baris tanpa label; kalau ada warna sungguhan, tiap warna jadi satu baris berlabel.
 */
export function colorRows(pool: StockPool): { color: string; label: string | null }[] {
  const colors = [...new Set(pool.rows[0].variants.map((variant) => variant.color))];
  if (colors.length === 0) return [{ color: "default", label: null }];
  const real = colors.some((color) => !isDefaultColor(color));
  return colors.map((color) => ({ color, label: real ? (isDefaultColor(color) ? "Standar" : color) : null }));
}

/** Stok satu sel (warna × ukuran) di sebuah kolam; null = varian itu tidak ada. */
export function stockCell(pool: StockPool, color: string, size: string): number | null {
  const variant = pool.rows[0].variants.find((item) => item.color === color && item.size === size);
  return variant ? variant.stock : null;
}

/** Kelas tampilan angka stok: habis / menipis / normal. */
export function stockTone(stock: number | null): "na" | "z" | "lo" | "ok" {
  if (stock === null) return "na";
  if (stock < 1) return "z";
  return stock <= 5 ? "lo" : "ok";
}
