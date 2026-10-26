/**
 * Penawaran Open Order (/open-order) diturunkan dari katalog (tabel `products`), bukan daftar
 * hardcode.
 *
 * Aturannya: **semua baris katalog yang ikut Open Order** (`open_order_enabled`, kolom
 * `products.open_order_enabled`, default true) tampil di halaman /open-order — **lintas
 * kategori** (Thobe, Kandora, Koko, Vest, Kabak, Cover & Hanger), bukan cuma Thobe.
 *
 * Baris dikelompokkan per **produk utama** (kategori + nama) — sama seperti kartu di halaman
 * Katalog — jadi produk Thobe dengan beberapa series tetap jadi satu kartu. Tiap grup menyimpan
 * peta `variants` ke **baris `products` asli**: itu dipakai server untuk memotong stok
 * (`samaqu_decrement_stock` per produk + warna + ukuran) dan mengisi `order_items.product_id`
 * dengan id baris katalog yang sebenarnya.
 */

/** Satu pilihan series + harga minimumnya. Kosong untuk produk tanpa series. */
export interface OpenOrderSeriesOption {
  name: string;
  price: number;
}

/** Satu item media varian — gambar atau video (dari tabel `product_images`). */
export interface OpenOrderMedia {
  src: string;
  type: "image" | "video";
}

/** Kombinasi warna (+ series) → baris `products` asli, untuk foto, stok, dan order_items. */
export interface OpenOrderVariant {
  /** Warna seperti tersimpan di varian (`product_variants.color`) — nilai yang dipakai stok. */
  color: string;
  /** Nama warna untuk ditampilkan. */
  label: string;
  series: string | null;
  /** id baris `products` asli. */
  productId: string;
  /** Ukuran yang benar-benar punya varian di baris ini (dari `product_variants`). */
  sizes: string[];
  /** Total stok semua ukuran di baris + warna ini (0 kalau variannya tidak dikelola). */
  stock: number;
  /** Media baris ini (gambar + video) — sumber galeri di langkah detail. */
  media: OpenOrderMedia[];
}

export interface OpenOrderProduct {
  /** id baris katalog acuan grup — dipakai sebagai kunci produk di keranjang & pesanan. */
  id: string;
  name: string;
  category: string;
  kain: string;
  colors: string[];
  series: OpenOrderSeriesOption[];
  /** Harga yang tampil (termurah dari grup). */
  price: number;
  /** Batas bawah Create Your Price. */
  minimumPrice: number;
  cypEnabled: boolean;
  weight: number;
  image: string;
  /** Deskripsi produk (dari baris katalog; UI punya teks cadangan per kategori). */
  description: string;
  /** Total stok seluruh varian grup — untuk microcopy "Ready stock / Menipis" di kartu. */
  totalStock: number;
  variants: OpenOrderVariant[];
}

/**
 * Baris katalog yang dipakai menurunkan penawaran — subset struktural dari `Product`
 * supaya modul ini bisa dipakai di client (`getProducts`) maupun di server (`/api/open-order`)
 * tanpa ikut membawa tipe/klien Supabase.
 */
export interface OpenOrderCatalogRow {
  id: string;
  name: string;
  category?: string | null;
  description?: string | null;
  kain?: string | null;
  series?: string | null;
  weight?: number | null;
  price?: number | null;
  minimum_price?: number | null;
  create_your_price_enabled?: boolean | null;
  colors?: string[] | null;
  image?: string | null;
  images?: string[] | null;
  media?: { src: string; type?: string }[] | null;
  /** Kolom `products.open_order_enabled` — false = disembunyikan dari /open-order. */
  open_order_enabled?: boolean | null;
  /**
   * Harga khusus Open Order (semua nullable). Bila `open_order_price` terisi, seluruh set
   * `open_order_*` menang atas harga katalog — dipakai kampanye Open Order tanpa mengubah
   * `products.price` (menu Produk).
   */
  open_order_price?: number | null;
  open_order_minimum_price?: number | null;
  open_order_recommended_price?: number | null;
  open_order_cyp_enabled?: boolean | null;
  open_order_cyp_microcopy?: string | null;
  jenis_kain?: { name?: string | null } | null;
}

/** Baris `product_variants` — sumber daftar ukuran per warna (dan sisa stok). */
export interface OpenOrderStockRow {
  product_id: string;
  color: string;
  size: string;
  stock?: number | null;
  /** Berat per ukuran (gram) dari `product_variants.weight` — kosong = pakai berat produk. */
  weight?: number | null;
}

/** Berat kirim default kalau baris katalog tidak punya `weight` (gram). */
export const DEFAULT_OPEN_ORDER_WEIGHT = 1200;

function kainOf(row: OpenOrderCatalogRow): string {
  return (row.jenis_kain?.name ?? row.kain ?? "").trim();
}

/** Media baris katalog (gambar + video) — `media` → `images` → `image`. */
function mediaOf(row: OpenOrderCatalogRow): OpenOrderMedia[] {
  const fromMedia = (row.media ?? [])
    .filter((item) => !!item?.src)
    .map((item) => ({
      src: item.src,
      type: item.type === "video" ? ("video" as const) : ("image" as const),
    }));
  if (fromMedia.length > 0) return fromMedia;
  const fromImages = (row.images ?? []).filter(Boolean).map((src) => ({ src, type: "image" as const }));
  if (fromImages.length > 0) return fromImages;
  return row.image ? [{ src: row.image, type: "image" as const }] : [];
}

/**
 * Nama warna untuk ditampilkan. Produk Thobe menyimpan warnanya di **nama** produk
 * ("Thobe Navy" → warna "Navy") sementara variannya berwarna `default`; produk lain memakai
 * nama warna aslinya. Yang dipakai stok tetap warna asli varian (`product_variants.color`).
 */
function colorLabelOf(row: OpenOrderCatalogRow, color: string): string {
  const isPlaceholder = !color || color.trim().toLowerCase() === "default";
  if (!isPlaceholder) return color;
  const name = (row.name ?? "").trim();
  const prefix = `${(row.category ?? "").trim()} `;
  if (prefix.trim() && name.toLowerCase().startsWith(prefix.toLowerCase())) {
    const rest = name.slice(prefix.length).trim();
    if (rest) return rest;
  }
  return color || "";
}

/** Kolom harga yang dibutuhkan jalur Open Order (subset dari baris `products`). */
export type OpenOrderPriceRow = Pick<
  OpenOrderCatalogRow,
  | "price"
  | "minimum_price"
  | "create_your_price_enabled"
  | "open_order_price"
  | "open_order_minimum_price"
  | "open_order_cyp_enabled"
>;

/** True kalau baris ini punya harga khusus Open Order (menang atas harga katalog). */
function hasOpenOrderPrice(row: OpenOrderPriceRow): boolean {
  return row.open_order_price != null;
}

/** Create Your Price untuk Open Order: pakai flag khusus bila ada, kalau tidak flag katalog. */
function rowCypEnabled(row: OpenOrderPriceRow): boolean {
  return hasOpenOrderPrice(row) ? !!row.open_order_cyp_enabled : !!row.create_your_price_enabled;
}

/**
 * Harga efektif SATU baris pada JALUR OPEN ORDER. Harga khusus Open Order (`open_order_*`) menang
 * atas harga katalog; saat Create Your Price aktif → harga minimum, kalau tidak → harga biasa.
 *
 * Dipakai wizard Open Order, `/api/open-order`, dan form Ubah Transaksi — supaya pesanan CYO
 * selalu dihargai dengan harga Open Order, bukan harga katalog (dua jalur ini memang beda angka).
 */
export function openOrderEffectivePrice(row: OpenOrderPriceRow): number {
  const price = (hasOpenOrderPrice(row) ? row.open_order_price : row.price) ?? 0;
  const minimum = hasOpenOrderPrice(row) ? row.open_order_minimum_price : row.minimum_price;
  if (rowCypEnabled(row) && minimum) return minimum;
  return price;
}

/**
 * Susun penawaran Open Order dari baris katalog: satu produk utama per (kategori + nama), berisi
 * daftar warna, series (kalau ada), harga, dan peta ke baris katalog aslinya.
 *
 * `stockRows` (baris `product_variants`) dipakai mengisi daftar ukuran tiap kombinasi
 * warna/series; tanpa itu ukurannya kosong (UI memakai daftar ukuran cadangan).
 */
export function buildOpenOrderProducts(
  catalog: OpenOrderCatalogRow[],
  stockRows: OpenOrderStockRow[] = []
): OpenOrderProduct[] {
  const sizesByRow = new Map<string, Map<string, string[]>>();
  const stockByRow = new Map<string, Map<string, number>>();
  for (const row of stockRows) {
    if (!row.product_id || !row.color || !row.size) continue;
    const byColor = sizesByRow.get(row.product_id) ?? new Map<string, string[]>();
    sizesByRow.set(row.product_id, byColor);
    const sizes = byColor.get(row.color) ?? [];
    if (!sizes.includes(row.size)) sizes.push(row.size);
    byColor.set(row.color, sizes);

    const stockByColor = stockByRow.get(row.product_id) ?? new Map<string, number>();
    stockByRow.set(row.product_id, stockByColor);
    stockByColor.set(row.color, (stockByColor.get(row.color) ?? 0) + (row.stock ?? 0));
  }

  interface Group {
    id: string;
    name: string;
    category: string;
    kain: string;
    colors: Set<string>;
    series: Map<string, number>;
    price: number;
    minimumPrice: number;
    cypEnabled: boolean;
    weight: number;
    image: string;
    description: string;
    totalStock: number;
    variants: OpenOrderVariant[];
  }

  const groups = new Map<string, Group>();

  for (const row of catalog) {
    // Baris yang dimatikan admin tidak ikut Open Order.
    if (row.open_order_enabled === false) continue;

    const name = (row.name ?? "").trim();
    const category = (row.category ?? "").trim();
    if (!name || !category) continue;

    const series = (row.series ?? "").trim();
    const price = openOrderEffectivePrice(row);
    if (!price) continue;

    const key = `${category}::${name}`;
    const group = groups.get(key) ?? {
      id: row.id,
      name,
      category,
      kain: kainOf(row),
      colors: new Set<string>(),
      series: new Map<string, number>(),
      price,
      minimumPrice: price,
      cypEnabled: false,
      weight: 0,
      image: "",
      description: "",
      totalStock: 0,
      variants: [],
    };
    groups.set(key, group);

    group.price = Math.min(group.price, price);
    group.minimumPrice = Math.min(group.minimumPrice, price);
    if (rowCypEnabled(row)) group.cypEnabled = true;
    if (!group.image) group.image = mediaOf(row)[0]?.src ?? "";
    if (!group.description && row.description) group.description = row.description.trim();
    if (row.weight) group.weight = Math.max(group.weight, row.weight);
    if (series) {
      const current = group.series.get(series);
      group.series.set(series, current === undefined ? price : Math.min(current, price));
    }

    // Satu entri varian per warna di baris ini → peta ke baris `products` asli.
    const media = mediaOf(row);
    const colors = (row.colors ?? []).length > 0 ? row.colors! : [""];
    for (const color of colors) {
      const stock = stockByRow.get(row.id)?.get(color) ?? 0;
      group.colors.add(color);
      group.totalStock += stock;
      group.variants.push({
        color,
        label: colorLabelOf(row, color),
        series: series || null,
        productId: row.id,
        sizes: sizesByRow.get(row.id)?.get(color) ?? [],
        stock,
        media,
      });
    }
  }

  return [...groups.values()]
    .map((group) => ({
      id: group.id,
      name: group.name,
      category: group.category,
      kain: group.kain,
      colors: [...group.colors].filter(Boolean),
      // Urutan series HARUS sama dengan halaman detail katalog: urutan baris `products`
      // (`created_at` naik) seperti yang dipakai `getAvailableSeries()`. Sengaja tidak
      // diurutkan ulang berdasarkan harga.
      series: [...group.series].map(([name, price]) => ({ name, price })),
      price: group.price,
      minimumPrice: group.minimumPrice,
      cypEnabled: group.cypEnabled,
      weight: group.weight || DEFAULT_OPEN_ORDER_WEIGHT,
      image: group.image,
      description: group.description,
      totalStock: group.totalStock,
      variants: group.variants,
    }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

/** Cari produk penawaran berdasarkan id (id baris acuan grup). */
export function findOpenOrderProduct(products: OpenOrderProduct[], id: string): OpenOrderProduct | undefined {
  return products.find((product) => product.id === id);
}

/** Harga tampil produk: termurah dari series-nya, atau harganya sendiri kalau tanpa series. */
export function openOrderProductPrice(product: OpenOrderProduct): number {
  if (product.series.length === 0) return product.price;
  return Math.min(...product.series.map((series) => series.price));
}

/** Harga minimum terendah dari seluruh penawaran — untuk catatan harga di langkah 1. */
export function lowestOpenOrderPrice(products: OpenOrderProduct[]): number | null {
  const prices = products.map(openOrderProductPrice);
  return prices.length ? Math.min(...prices) : null;
}

/**
 * Baris katalog asli untuk kombinasi warna + series (atau warna saja kalau produknya tanpa
 * series). Dipakai UI untuk galeri foto dan server untuk memotong stok.
 */
export function openOrderVariantFor(
  product: OpenOrderProduct,
  color: string,
  series?: string | null
): OpenOrderVariant | undefined {
  const wantSeries = (series ?? "").trim();
  const byColor = product.variants.filter((variant) => variant.color === color);
  if (wantSeries) {
    const exact = byColor.find((variant) => (variant.series ?? "") === wantSeries);
    if (exact) return exact;
  }
  return byColor[0];
}

/** Nama warna untuk ditampilkan (Thobe: dari nama produk, mis. "Navy"; lainnya: warna varian). */
export function openOrderColorLabel(product: OpenOrderProduct, color: string): string {
  return openOrderVariantFor(product, color)?.label || color;
}
