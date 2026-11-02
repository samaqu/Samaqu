import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  buildOpenOrderProducts,
  openOrderEffectivePrice,
  type OpenOrderCatalogRow,
  type OpenOrderProduct,
  type OpenOrderStockRow,
} from "@/lib/open-order-offering";
import { openOrderProductImage } from "@/lib/open-order-catalog";
import {
  CYP_ASSETS,
  CYP_MAX_PRODUCTS,
  HERO_FROM_PRICE,
  HERO_PRICE_STEPS,
  HERO_PRODUCT,
} from "@/lib/campaign/create-your-price-content";

/** Satu kartu di section "Produk pilihan periode ini". */
export interface CampaignProduct {
  /** id baris katalog acuan — dipakai untuk link ke halaman detail produk. */
  id: string;
  name: string;
  /** Keterangan "kain · series" di bawah nama (kosong kalau tidak ada datanya). */
  sub: string;
  image: string;
  /** Harga minimum yang tampil setelah kata "Mulai". */
  minimumPrice: number;
  /** Total stok semua varian grup — sama dengan `OpenOrderProduct.totalStock`. */
  totalStock: number;
  /**
   * true = ada stok, jadi bisa dipesan sekarang.
   * false = stok habis (tampil badge "Sold Out", sama seperti kartu Open Order).
   */
  available: boolean;
}

/** URL media yang benar-benar gambar (bukan video) — `<img>` tidak bisa merender video. */
function isImageUrl(url: string): boolean {
  if (!url) return false;
  return !/\.(mp4|m4v|webm|mov)(\?|$)/i.test(url.trim());
}

/**
 * Format harga ringkas ala mockup: 309000 → "Rp309rb", 1050000 → "Rp1jt".
 * Sama gambarannya dengan angka statis lama ("Rp300rb"/"Rp320rb"/"Rp350rb").
 */
export function shortPrice(value: number): string {
  const amount = Math.max(0, Math.round(Number(value) || 0));
  if (amount >= 1_000_000) {
    const millions = amount / 1_000_000;
    const text = Number.isInteger(millions) ? String(millions) : millions.toFixed(1).replace(/\.0$/, "");
    return `Rp${text.replace(".", ",")}jt`;
  }
  const thousands = amount / 1000;
  const text = Number.isInteger(thousands) ? String(thousands) : thousands.toFixed(1).replace(/\.0$/, "");
  return `Rp${text.replace(".", ",")}rb`;
}

/** "309000" → "Rp309.000" (pemisah ribuan gaya Indonesia). */
export function fullPrice(value: number): string {
  return `Rp${Math.max(0, Math.round(Number(value) || 0)).toLocaleString("id-ID")}`;
}

/** Host media utama katalog (R2). Dipakai sebagai cadangan kalau URL utama gagal dimuat. */
const PRIMARY_MEDIA_HOST = "samaqu-media.samaqu.workers.dev";

/**
 * Cek satu URL gambar benar-benar bisa dibuka (HEAD). Dipakai hanya untuk KANDIDAT CADANGAN,
 * jadi jumlah request-nya kecil (maksimal beberapa per halaman).
 */
async function isReachableImage(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Foto kartu untuk satu produk Open Order.
 *
 * `openOrderProductImage()` mengutamakan media varian, TAPI media baris katalog sering
 * dimulai dengan video (`00_semua_video.mp4`) sementara gambarnya ada di media berikutnya.
 * Jadi: ambil kandidat gambar pertama dari seluruh varian grup (urutan media katalog).
 *
 * Kandidat cadangan: beberapa baris katalog menyimpan `images[]` di bucket `media-backup`
 * yang sudah mati (HTTP 400), sementara salinan R2-nya masih hidup. Kalau kandidat utama
 * ternyata tidak bisa dibuka, pakai URL R2 dengan path yang sama. Ini murni mengatasi data
 * katalog yang rusak — tidak mengubah data apa pun di database.
 */
async function cardImageOf(product: OpenOrderProduct): Promise<string> {
  let candidate = "";

  for (const variant of product.variants) {
    const image = variant.media.find((item) => item.type === "image" && isImageUrl(item.src));
    if (image) {
      candidate = image.src;
      break;
    }
  }
  if (!candidate) {
    const fallback = openOrderProductImage(product);
    candidate = isImageUrl(fallback) ? fallback : "";
  }
  if (!candidate) return "";

  // URL utama hidup → langsung pakai (tanpa request tambahan).
  if (candidate.includes(PRIMARY_MEDIA_HOST)) return candidate;

  // Bukan host utama: jangan percaya blind, coba dulu.
  if (await isReachableImage(candidate)) return candidate;

  // Cadangan: path yang sama di R2.
  const pathStart = candidate.indexOf("/katalog/");
  if (pathStart >= 0) {
    const r2 = `https://${PRIMARY_MEDIA_HOST}${candidate.slice(pathStart)}`;
    if (await isReachableImage(r2)) return r2;
  }

  return "";
}

/**
 * Ambil maksimal 4 produk yang Create Your Price-nya AKTIF.
 *
 * Sumber kebenaran aturan CYP adalah `buildOpenOrderProducts()` — fungsi yang sama yang
 * dipakai halaman Open Order dan `/api/open-order` — jadi kartu di sini tidak mungkin
 * berbeda dari yang benar-benar bisa dipesan. Yang difilter tinggal `cypEnabled`.
 *
 * Filter "sedang aktif di Open Order" dilakukan dua lapis, sama seperti halaman Open Order:
 *  - `open_order_enabled !== false` → ditangani `buildOpenOrderProducts`
 *  - harga efektif `openOrderEffectivePrice()` ada (bukan 0/null)
 * Serta `is_published = true` supaya produk yang disembunyikan dari katalog tidak tampil.
 *
 * Mengembalikan `[]` bila tidak ada produk CYP aktif — pemanggil menyembunyikan section.
 */
export async function loadCampaignProducts(): Promise<CampaignProduct[]> {
  try {
    const supabase = getSupabaseAdmin();

    const { data: catalogRows, error } = await supabase
      .from("products")
      .select("*, jenis_kain(*)")
      .eq("is_published", true)
      .order("created_at", { ascending: true });

    if (error || !catalogRows?.length) return [];

    const { data: stockRows } = await supabase
      .from("product_variants")
      .select("product_id, color, size, stock, weight");

    const products = buildOpenOrderProducts(
      catalogRows as unknown as OpenOrderCatalogRow[],
      (stockRows ?? []) as OpenOrderStockRow[]
    );

    const active = products.filter((product) => {
      // Wajib CYP aktif dan harga efektifnya ada.
      if (!product.cypEnabled) return false;
      const row = (catalogRows as unknown as OpenOrderCatalogRow[]).find((item) => item.id === product.id);
      if (row && !openOrderEffectivePrice(row)) return false;
      return product.minimumPrice > 0;
    });

    const selected = active.slice(0, CYP_MAX_PRODUCTS);

    // Paralel: maksimal 4 produk, jadi paling banyak beberapa request HEAD (hanya untuk
    // kandidat cadangan — URL host utama tidak dicek).
    return Promise.all(
      selected.map(async (product) => ({
        id: product.id,
        name: product.name,
        sub: [product.kain, product.series.map((option) => option.name).filter(Boolean).join(", ")]
          .filter(Boolean)
          .join(" · "),
        // Foto kartu: gambar pertama dari media katalog (bukan video). Kosong = render tanpa foto.
        image: await cardImageOf(product),
        minimumPrice: product.minimumPrice,
        totalStock: product.totalStock,
        available: product.totalStock > 0,
      }))
    );
  } catch (error) {
    // Section ini hanya pelengkap: kalau query gagal, sembunyikan saja jangan sampai
    // halaman kampanye ikut error.
    console.error("[CYP-CAMPAIGN] Gagal memuat produk Create Your Price:", error);
    return [];
  }
}

/** Satu pilihan harga di kartu demo hero. */
export interface HeroPriceOption {
  label: string;
  /** Nominal penuh untuk baris "Kamu bayar", mis. "Rp309.000". */
  price: string;
  /** Format ringkas di tombol, mis. "Rp309rb". */
  short: string;
}

/** Isi kartu demo harga di hero + harga "MULAI DARI". */
export interface HeroData {
  name: string;
  photoAlt: string;
  image: string;
  /** Harga minimum produk (nominal penuh), untuk baris "Minimum Rp…". */
  minimumLabel: string;
  options: HeroPriceOption[];
  /** "MULAI DARI" — harga minimum TERENDAH dari semua produk aktif, format ringkas. */
  fromPrice: string;
}

/**
 * Kartu demo harga hero diturunkan dari PRODUK CYP AKTIF PERTAMA, dengan tiga pilihan:
 * minimum, minimum + Rp20.000, minimum + Rp50.000.
 *
 * Kalau tidak ada produk aktif → fallback ke data statis (`HERO_PRODUCT`), jadi hero
 * tidak pernah kosong.
 */
export function heroFromProducts(products: CampaignProduct[]): HeroData {
  const first = products[0];

  if (!first) {
    return {
      name: HERO_PRODUCT.name,
      photoAlt: HERO_PRODUCT.photoAlt,
      image: CYP_ASSETS.heroPhoto,
      minimumLabel: `Minimum ${fullPrice(HERO_PRODUCT.minimumPrice)}`,
      options: HERO_PRODUCT.options.map((option) => ({
        label: option.label,
        price: option.price,
        short: option.short,
      })),
      fromPrice: HERO_FROM_PRICE,
    };
  }

  const minimum = first.minimumPrice;
  const lowest = lowestMinimumPrice(products);

  return {
    name: first.name,
    photoAlt: first.name,
    image: first.image || CYP_ASSETS.heroPhoto,
    minimumLabel: `Minimum ${fullPrice(minimum)}`,
    options: HERO_PRICE_STEPS.map((step, index) => ({
      label: index === 0 ? "MINIMUM" : "PILIHAN",
      price: fullPrice(minimum + step),
      short: shortPrice(minimum + step),
    })),
    fromPrice: shortPrice(lowest),
  };
}

/**
 * Harga minimum TERENDAH di antara produk CYP aktif.
 *
 * `undefined` bila tidak ada produk aktif (supaya pemanggil memakai fallback statis).
 */
export function lowestMinimumPrice(products: CampaignProduct[]): number {
  if (products.length === 0) return 0;
  return Math.min(...products.map((product) => product.minimumPrice));
}

