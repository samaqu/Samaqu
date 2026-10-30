/**
 * Katalog reseller — produk yang boleh dijual reseller beserta varian,
 * stok efektif (WAJIB lewat resolveStock / aturan produk basis), harga
 * katalog, harga beli, dan batas harga jual. Semua harga dihitung server.
 *
 * Syarat tampil HANYA `reseller_enabled = true` — apa pun tempat tampil
 * produknya (katalog website, Open Order, tersembunyi, add-on). Stok 0 tetap
 * tampil (UI menandai "Stok habis"). Foto memakai rantai bersama
 * `loadOrderPhotoLookup` (product_images → products.images → products.image,
 * video dilewati).
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { loadOrderPhotoLookup } from "@/lib/order-photo-data";
import { catalogGroupKey } from "@/lib/catalog-group";
import { effectiveDiscountPercent, resellerBuyPrice } from "./pricing";
import { getResellerSettings } from "./settings";

export interface ResellerVariant {
  color: string;
  hex: string | null;
  size: string;
  /** Stok efektif (varian series menumpang stok produk basisnya). */
  stock: number;
}

export interface ResellerCatalogProduct {
  id: string;
  name: string;
  category: string;
  series: string | null;
  image: string | null;
  price: number;
  /** Diskon efektif (khusus series atau default) untuk tampilan. */
  discount_percent: number;
  buy_price: number;
  variants: ResellerVariant[];
}

type ProductBaseRow = {
  id: string;
  name: string;
  category: string;
  series: string | null;
  price: number;
  reseller_enabled: boolean;
  reseller_discount_percent: number | string | null;
};

type VariantRow = {
  product_id: string;
  color: string | null;
  size: string | null;
  stock: number | null;
  base_product_id: string | null;
  hex: string | null;
};

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Warna dari nama produk: "Thobe Black" → "black", "Thobe Superblack" → "superblack". */
function colorToken(name: string, category: string, series: string | null): string {
  let value = normalizeToken(name);
  const cat = normalizeToken(category);
  if (cat && value.startsWith(cat)) value = value.slice(cat.length).trim();
  const seriesToken = normalizeToken(series || "");
  if (seriesToken) {
    const escaped = seriesToken.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    value = value.replace(new RegExp(`\\b${escaped}\\b`, "g"), " ").replace(/\s+/g, " ").trim();
  }
  return value;
}

/** "black" cocok dengan "superblack"; "broken white" cocok dengan "broken white". */
function colorsMatch(candidate: string, target: string): boolean {
  if (!candidate || !target) return false;
  return candidate === target || candidate.includes(target) || target.includes(candidate);
}

export async function getResellerCatalog(): Promise<ResellerCatalogProduct[]> {
  const supabase = getSupabaseAdmin();

  const settings = await getResellerSettings();
  const defaultDiscount = settings.defaultDiscountPercent;

  const { data: rawProducts, error: productError } = await supabase
    .from("products")
    .select(
      "id, name, category, series, price, reseller_enabled, reseller_discount_percent"
    )
    // Hanya series yang DIAKTIFKAN admin di tab Produk & Harga yang dijual ke
    // reseller — tanpa filter is_published: Open Order & produk tersembunyi
    // tetap tampil selama diaktifkan.
    .eq("reseller_enabled", true)
    .order("created_at", { ascending: true });

  if (productError) {
    console.error("[RESELLER-KATALOG] Gagal membaca produk:", productError.message);
    throw new Error("Gagal memuat katalog reseller");
  }

  const products = (rawProducts ?? []) as unknown as ProductBaseRow[];
  if (products.length === 0) return [];

  const ids = products.map((p) => String(p.id));

  const [{ data: rawVariants, error: variantError }, photoLookup] = await Promise.all([
    supabase
      .from("product_variants")
      .select("product_id, color, size, stock, base_product_id, hex")
      .in("product_id", ids)
      .order("display_order"),
    loadOrderPhotoLookup(ids),
  ]);

  if (variantError) {
    console.error("[RESELLER-KATALOG] Gagal membaca varian:", variantError.message);
    throw new Error("Gagal memuat varian reseller");
  }

  const variants = (rawVariants ?? []) as VariantRow[];

  // Stok efektif: baris varian dengan base_product_id TIDAK memegang stok —
  // angkanya hidup di baris (product_id basis, color, size) yang sama.
  // Aturan ini = resolveStock (src/lib/ops-stock.ts) pada level varian.
  const stockByKey = new Map<string, number>();
  for (const v of variants) {
    if (!v.base_product_id) {
      stockByKey.set(`${v.product_id}|${v.color}|${v.size}`, Math.max(0, Number(v.stock) || 0));
    }
  }

  const effectiveStock = (v: VariantRow): number => {
    if (!v.base_product_id) return Math.max(0, Number(v.stock) || 0);
    return stockByKey.get(`${v.base_product_id}|${v.color}|${v.size}`) ?? 0;
  };

  // Foto cadangan tingkat grup — aturan yang sama dengan kartu katalog website
  // (`groupCatalogProducts`): satu grup = kategori + nama; foto grup diambil
  // dari anggota pertama yang punya gambar (urutan created_at).
  const groupPhotoByKey = new Map<string, string>();
  const missingPhoto = products.filter((product) => !photoLookup.main?.[String(product.id)]);
  if (missingPhoto.length > 0) {
    const names = [...new Set(missingPhoto.map((product) => product.name))];
    const categories = [...new Set(missingPhoto.map((product) => product.category))];
    const { data: groupRows, error: groupError } = await supabase
      .from("products")
      .select("id, name, category")
      .in("name", names)
      .in("category", categories)
      .order("created_at", { ascending: true });

    if (groupError) {
      console.error("[RESELLER-KATALOG] Gagal membaca foto grup:", groupError.message);
    } else {
      const wantedGroups = new Set(missingPhoto.map((product) => catalogGroupKey(product)));
      const candidates = (groupRows ?? []).filter((row) =>
        wantedGroups.has(catalogGroupKey(row))
      );
      if (candidates.length > 0) {
        const groupLookup = await loadOrderPhotoLookup(candidates.map((row) => String(row.id)));
        for (const row of candidates) {
          const key = catalogGroupKey(row);
          const photo = groupLookup.main?.[String(row.id)];
          if (photo && !groupPhotoByKey.has(key)) groupPhotoByKey.set(key, photo);
        }
      }
    }
  }

  // Cadangan terakhir sebelum placeholder: foto dari produk PUBLISHED dengan
  // kategori + series yang sama dan warna terdekat di nama (mis. "Thobe Black"
  // memakai foto "Thobe Superblack" — sumber yang sama dengan katalog publik).
  // Hanya tampilan; produk, harga, dan stok yang dijual tetap baris reseller.
  const publicPhotoByProduct = new Map<string, string>();
  const stillMissing = products.filter(
    (product) =>
      !photoLookup.main?.[String(product.id)] &&
      !groupPhotoByKey.get(catalogGroupKey(product))
  );
  const missingSeries = [
    ...new Set(stillMissing.map((product) => product.series).filter((series): series is string => Boolean(series))),
  ];
  if (stillMissing.length > 0 && missingSeries.length > 0) {
    const categories = [...new Set(stillMissing.map((product) => product.category))];
    const { data: publicRows, error: publicError } = await supabase
      .from("products")
      .select("id, name, category, series")
      .eq("is_published", true)
      .in("category", categories)
      .in("series", missingSeries)
      .order("created_at", { ascending: true });

    if (publicError) {
      console.error("[RESELLER-KATALOG] Gagal membaca foto katalog publik:", publicError.message);
    } else {
      const candidates = publicRows ?? [];
      if (candidates.length > 0) {
        const publicLookup = await loadOrderPhotoLookup(candidates.map((row) => String(row.id)));
        for (const product of stillMissing) {
          if (!product.series) continue;
          const targetColor = colorToken(product.name, product.category, product.series);
          const match = candidates.find((row) => {
            if (String(row.category) !== product.category || String(row.series) !== product.series) return false;
            if (!publicLookup.main?.[String(row.id)]) return false;
            return (
              targetColor.length > 0 &&
              colorsMatch(colorToken(String(row.name), String(row.category), String(row.series)), targetColor)
            );
          });
          if (match) publicPhotoByProduct.set(String(product.id), publicLookup.main![String(match.id)]);
        }
      }
    }
  }

  return products.map((product) => {
    const own = variants.filter((v) => v.product_id === product.id);
    return {
      id: product.id,
      name: product.name,
      category: product.category,
      series: product.series ?? null,
      image:
        photoLookup.main?.[String(product.id)] ||
        groupPhotoByKey.get(catalogGroupKey(product)) ||
        publicPhotoByProduct.get(String(product.id)) ||
        null,
      price: Math.round(Number(product.price) || 0),
      discount_percent: effectiveDiscountPercent(product, defaultDiscount),
      buy_price: resellerBuyPrice(product, defaultDiscount),
      // Varian series turunan boleh dibeli, stoknya mengikuti basis —
      // baris varian dikelompokkan per (color, size) tanpa duplikat.
      variants: own
        .filter((v) => v.color && v.size)
        .map((v) => ({
          color: String(v.color),
          hex: v.hex ?? null,
          size: String(v.size),
          stock: effectiveStock(v),
        })),
    };
  }).filter((product) => product.variants.length > 0);
}
