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
 * Varian katalog yang dipakai saat add-on dipilih. Dulu hanya satu ("Set Hanger + Cover");
 * sejak cover dipecah jadi produk berkomponen, customer memilih antara Cover Thobe dan
 * Cover Koko. Varian lama tetap dikenali untuk pesanan lama, tetapi sudah tidak dijual.
 */
export const OPEN_ORDER_ADDON_VARIANT = {
  color: "Set Hanger + Cover",
  size: "ALL SIZE",
};

/** Pilihan cover yang bisa dipilih customer (berkomponen: 1 cover + 1 hanger). */
export interface AddonCoverOption {
  /** Nilai di kolom `color` varian `cover-hanger` — juga nama paket di UI. */
  color: string;
  /** Label singkat untuk segmented control. */
  label: string;
  /** Kategori pesanan yang membuat pilihan ini jadi default. */
  forCategories: string[];
  /** Urutan tampil. */
  order: number;
}

/**
 * Daftar pilihan cover, urut tampil. `forCategories` dicocokkan ke kategori item pesanan
 * (huruf kecil, dicari sebagai bagian nama kategori) untuk menentukan pilihan awal.
 */
export const ADDON_COVER_OPTIONS: AddonCoverOption[] = [
  {
    color: "Cover Thobe + Hanger",
    label: "Cover Thobe + Hanger",
    forCategories: ["thobe", "kandora"],
    order: 1,
  },
  {
    color: "Cover Koko + Hanger",
    label: "Cover Koko + Hanger",
    forCategories: ["koko"],
    order: 2,
  },
];

/** Pilihan cover bawaan kalau isi pesanan tidak bisa ditentukan (mis. campuran). */
export const ADDON_COVER_DEFAULT = "Cover Thobe + Hanger";

/** Semua nama varian add-on yang dikenali — lama DAN baru. */
export const ADDON_COVER_COLORS = ["Set Hanger + Cover", ...ADDON_COVER_OPTIONS.map((o) => o.color)];

/** True kalau `color` adalah salah satu varian cover yang boleh dipilih customer. */
export function isSelectableCoverColor(color: unknown): boolean {
  const c = String(color ?? "").trim();
  return ADDON_COVER_OPTIONS.some((option) => option.color === c);
}

/** Ambil pilihan cover yang valid; selain itu null (server menolak). */
export function resolveSelectableCover(color: unknown): AddonCoverOption | null {
  const c = String(color ?? "").trim();
  return ADDON_COVER_OPTIONS.find((option) => option.color === c) ?? null;
}

/** True kalau `color` varian `cover-hanger` adalah varian add-on (lama atau baru). */
export function isAddonCoverColor(color: unknown): boolean {
  const c = String(color ?? "").trim();
  return ADDON_COVER_COLORS.includes(c);
}

/**
 * Pilihan awal dari isi pesanan: Thobe/Kandora → Cover Thobe, Koko → Cover Koko,
 * campuran atau tidak diketahui → Cover Thobe. Tidak ada yang hardcode per nomor pesanan.
 */
export function defaultCoverForCategories(categories: (string | null | undefined)[]): string {
  const found = new Set<string>();
  for (const raw of categories) {
    const category = String(raw ?? "").toLowerCase().trim();
    if (!category) continue;
    for (const option of ADDON_COVER_OPTIONS) {
      if (option.forCategories.some((keyword) => category.includes(keyword))) found.add(option.color);
    }
  }
  // Campuran (lebih dari satu jenis) → pilihan default.
  if (found.size === 1) return Array.from(found)[0];
  return ADDON_COVER_DEFAULT;
}

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

/** Baris `order_items` minimal untuk mengenali baris add-on. */
export interface AddonLineLike {
  product_id?: string | null;
  product_name?: string | null;
  color?: string | null;
  size?: string | null;
}

/**
 * True kalau baris `order_items` ini baris ADD-ON Open Order. Dua format yang dikenali:
 *
 *  - **format lama**: `product_id = "addon-cover-hanger"` (id bayangan).
 *  - **format baru**: `product_id = "cover-hanger"` dengan salah satu penanda add-on —
 *    nama baris = nama add-on, ATAU baris tanpa nama/warna sama sekali (input form yang hanya
 *    membawa id produk).
 *
 * Produk "Cover Hanger" yang dibeli sebagai produk BIASA punya nama katalog ("Cover Hanger"),
 * sehingga tetap dianggap baris produk biasa — termasuk pada input form yang membawa
 * `product_name: "Cover Hanger"`.
 */
export function isOpenOrderAddonLine(line?: AddonLineLike | null): boolean {
  const id = String(line?.product_id ?? "").trim();
  const name = String(line?.product_name ?? "").trim();
  const color = String(line?.color ?? "").trim();
  const size = String(line?.size ?? "").trim().toUpperCase();

  if (id === OPEN_ORDER_ADDON.id) return true;
  if (id !== OPEN_ORDER_ADDON_TARGET_ID) return false;

  // Produk "Cover Hanger" yang dibeli sebagai produk biasa → baris produk biasa. Nama katalog
  // selalu terisi untuk baris semacam itu, jadi diperiksa lebih dulu.
  if (name && name !== OPEN_ORDER_ADDON.name) return false;

  if (name === OPEN_ORDER_ADDON.name) return true;
  // Varian add-on (lama "Set Hanger + Cover" maupun baru "Cover Thobe/Koko + Hanger"),
  // yaitu baris DB hasil checkout Open Order / promo.
  if (isAddonCoverColor(color) && size === OPEN_ORDER_ADDON_VARIANT.size.toUpperCase()) {
    return true;
  }
  // Tanpa nama maupun warna = pemanggil hanya membawa id (mis. input form baris add-on).
  return !name && !color;
}

/**
 * True kalau baris add-on ini memegang stok varian katalog (format baru). Hanya baris inilah
 * yang ikut aturan stok (potong saat dibuat, kembali saat batal/edit). Format lama memakai id
 * bayangan yang tidak punya baris varian, jadi stoknya tidak boleh disentuh.
 */
export function isStockedAddonLine(line?: AddonLineLike | null): boolean {
  const id = String(line?.product_id ?? "").trim();
  return id === OPEN_ORDER_ADDON_TARGET_ID && isOpenOrderAddonLine(line);
}

/** Ukuran yang bisa dipilih customer — tersimpan di kolom `size` (order_items). */
export const OPEN_ORDER_SIZES = ["S", "M", "L", "XL", "XXL"];
