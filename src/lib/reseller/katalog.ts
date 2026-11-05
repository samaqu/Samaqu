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
import { isWebsiteCatalog } from "./visibility";
import { effectiveDiscountPercent, resellerBuyPrice, resellerMinSellInfo } from "./pricing";
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
  /** Batas bawah harga jual + sumber teksnya (satu helper pricing.ts). */
  min_sell_price: number;
  min_sell_source: "catalog" | "configured" | "buy";
  min_sell_reason: string;
  variants: ResellerVariant[];
}

type ProductBaseRow = {
  id: string;
  name: string;
  category: string;
  series: string | null;
  price: number;
  is_published: boolean | null;
  open_order_enabled: boolean | null;
  reseller_enabled: boolean;
  reseller_discount_percent: number | string | null;
  reseller_min_sell_price: number | null;
};

type VariantRow = {
  product_id: string;
  color: string | null;
  size: string | null;
  /** Dari VIEW `product_variant_stock` — sudah stok efektif (sharing & komponen). */
  effective_stock: number | null;
  is_sellable: boolean | null;
  hex: string | null;
};

export async function getResellerCatalog(): Promise<ResellerCatalogProduct[]> {
  const supabase = getSupabaseAdmin();

  const settings = await getResellerSettings();
  const defaultDiscount = settings.defaultDiscountPercent;

  const { data: rawProducts, error: productError } = await supabase
    .from("products")
    .select(
      "id, name, category, series, price, is_published, open_order_enabled, reseller_enabled, reseller_discount_percent, reseller_min_sell_price"
    )
    // Reseller hanya menjual produk KATALOG WEBSITE (klasifikasi "Tampil di"
    // yang sama dengan tab admin) dan yang sudah diaktifkan admin.
    .eq("reseller_enabled", true)
    .order("created_at", { ascending: true });

  if (productError) {
    console.error("[RESELLER-KATALOG] Gagal membaca produk:", productError.message);
    throw new Error("Gagal memuat katalog reseller");
  }

  const products = ((rawProducts ?? []) as unknown as ProductBaseRow[]).filter(isWebsiteCatalog);
  if (products.length === 0) return [];

  const ids = products.map((p) => String(p.id));

  const [{ data: rawVariants, error: variantError }, photoLookup] = await Promise.all([
    // VIEW `product_variant_stock`: `stock` di sini SUDAH stok efektif (stok sendiri, induk
    // sharing, atau min stok komponen), jadi varian berkomponen tidak tampil habis.
    // Varian `is_sellable = false` dibuang — reseller tidak boleh menjual varian lama.
    supabase
      .from("product_variant_stock")
      .select("product_id, color, size, effective_stock, hex, is_sellable")
      .in("product_id", ids)
      .order("display_order"),
    loadOrderPhotoLookup(ids, [], supabase),
  ]);

  if (variantError) {
    console.error("[RESELLER-KATALOG] Gagal membaca varian:", variantError.message);
    throw new Error("Gagal memuat varian reseller");
  }

  const variants = (rawVariants ?? []) as unknown as VariantRow[];

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
        const groupLookup = await loadOrderPhotoLookup(candidates.map((row) => String(row.id)), [], supabase);
        for (const row of candidates) {
          const key = catalogGroupKey(row);
          const photo = groupLookup.main?.[String(row.id)];
          if (photo && !groupPhotoByKey.has(key)) groupPhotoByKey.set(key, photo);
        }
      }
    }
  }

  return products.map((product) => {
    const own = variants.filter((v) => v.product_id === product.id);
    const minSell = resellerMinSellInfo(product, defaultDiscount);
    return {
      id: product.id,
      name: product.name,
      category: product.category,
      series: product.series ?? null,
      image:
        photoLookup.main?.[String(product.id)] ||
        groupPhotoByKey.get(catalogGroupKey(product)) ||
        null,
      price: Math.round(Number(product.price) || 0),
      discount_percent: effectiveDiscountPercent(product, defaultDiscount),
      buy_price: resellerBuyPrice(product, defaultDiscount),
      min_sell_price: minSell.value,
      min_sell_source: minSell.source,
      min_sell_reason: minSell.reason,
      // Varian series turunan boleh dibeli, stoknya sudah efektif dari view.
      // Varian yang tidak dijual (is_sellable = false) tidak ditawarkan ke reseller.
      variants: own
        .filter((v) => v.color && v.size && v.is_sellable !== false)
        .map((v) => ({
          color: String(v.color),
          hex: v.hex ?? null,
          size: String(v.size),
          stock: Math.max(0, Number(v.effective_stock) || 0),
        })),
    };
  }).filter((product) => product.variants.length > 0);
}
