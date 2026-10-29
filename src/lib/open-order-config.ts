/**
 * Pengaturan Open Order Samaqu yang TIDAK berasal dari katalog.
 *
 * Daftar produk — kain, warna, series, dan harga — tidak lagi ditulis di sini: semuanya
 * diturunkan dari tabel `products` lewat `buildOpenOrderProducts()` di
 * `src/lib/open-order-offering.ts`, supaya perubahan harga/warna di katalog langsung
 * terpakai di wizard.
 *
 * Yang tetap statis di file ini hanya hal yang memang bukan data katalog: periode Open
 * Order, add-on Cover & Hanger, dan daftar ukuran.
 */

/** Periode Open Order yang sedang dibuka — ditampilkan di bawah judul /open-order. */
export const OPEN_ORDER_PERIOD = "8-15 Agustus 2026";

/** Tambahan Extra Cover & Hanger Samaqu (opsional, per pesanan). */
export const OPEN_ORDER_ADDON = {
  id: "addon-cover-hanger",
  name: "Extra Cover & Hanger Samaqu",
  price: 35000,
};

/**
 * Baris katalog yang secara fisik SAMA dengan add-on di atas.
 *
 * Sejak add-on disambungkan ke katalog, `product_id` baris `order_items` untuk pesanan BARU
 * adalah id produk ini (`cover-hanger`) — bukan lagi id bayangan `OPEN_ORDER_ADDON.id`.
 * Pesanan lama tetap memakai id bayangan itu dan tidak diubah.
 */
export const OPEN_ORDER_ADDON_TARGET_ID = "cover-hanger";

/**
 * Varian katalog yang dipakai saat add-on dipilih: satu-satunya varian produk Cover Hanger
 * (`Set Hanger + Cover`, SKU CVH-SHC, size "ALL SIZE"). Stok add-on adalah stok varian ini.
 */
export const OPEN_ORDER_ADDON_VARIANT = {
  color: "Set Hanger + Cover",
  size: "ALL SIZE",
};

/**
 * Berat kirim add-on Cover & Hanger (gram). Sumber utamanya berat varian katalog
 * (`product_variants.weight`, dibaca di server & wizard). Nilai di
 * `store_settings.open_order_addon_weight` hanya FALLBACK kalau variannya tidak ditemukan,
 * dan `DEFAULT_OPEN_ORDER_ADDON_WEIGHT` jadi fallback terakhir.
 */
export const DEFAULT_OPEN_ORDER_ADDON_WEIGHT = 300;

/** Berat add-on (gram) dari setting tersimpan; jatuh ke default kalau kosong/tidak valid. */
export function resolveAddonWeight(saved: unknown): number {
  const grams = Math.round(Number(saved));
  return Number.isFinite(grams) && grams > 0 ? grams : DEFAULT_OPEN_ORDER_ADDON_WEIGHT;
}

/**
 * Berat add-on (gram) untuk satu pilihan: berat varian katalog kalau ada (dan > 0),
 * kalau tidak → berat produk katalog, kalau tidak → setting admin (`resolveAddonWeight`).
 * Urutan ini SAMA dengan `sumWeightGramsBySize` supaya angka ongkir = angka resi.
 */
export function resolveAddonWeightFromCatalog(
  variantWeight: unknown,
  productWeight: unknown,
  saved: unknown
): number {
  const fromVariant = Math.round(Number(variantWeight));
  if (Number.isFinite(fromVariant) && fromVariant > 0) return fromVariant;
  const fromProduct = Math.round(Number(productWeight));
  if (Number.isFinite(fromProduct) && fromProduct > 0) return fromProduct;
  return resolveAddonWeight(saved);
}

/** Baris varian katalog minimal untuk menghitung berat & stok add-on. */
export interface AddonCatalogRows {
  /** Berat varian `cover-hanger` (color "Set Hanger + Cover", size "ALL SIZE"). */
  variantWeight?: number | null;
  /** Stok varian tersebut; null/kosong = varian tidak ditemukan. */
  variantStock?: number | null;
  /** Berat produk `cover-hanger` (cadangan pertama). */
  productWeight?: number | null;
}

/** Sisa stok add-on dari baris varian; null = varian tidak ditemukan (stok tidak dikelola). */
export function addonStockOf(rows: AddonCatalogRows): number | null {
  if (rows.variantStock === null || rows.variantStock === undefined) return null;
  const stock = Number(rows.variantStock);
  return Number.isFinite(stock) ? Math.max(0, Math.round(stock)) : null;
}

/** Add-on boleh dipilih hanya kalau variannya ada DAN stoknya > 0. */
export function isAddonAvailable(rows: AddonCatalogRows): boolean {
  const stock = addonStockOf(rows);
  return stock !== null && stock > 0;
}

/** Ukuran yang bisa dipilih customer — tersimpan di kolom `size` (order_items). */
export const OPEN_ORDER_SIZES = ["S", "M", "L", "XL", "XXL"];
