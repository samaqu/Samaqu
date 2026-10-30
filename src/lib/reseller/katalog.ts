/**
 * Katalog reseller — produk yang boleh dijual reseller beserta varian,
 * stok efektif (WAJIB lewat resolveStock / aturan produk basis), harga
 * katalog, harga beli, dan batas harga jual. Semua harga dihitung server.
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { resellerBuyPrice, resellerMinSellPrice } from "./pricing";

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
  minimum_price: number | null;
  discount_percent: number;
  buy_price: number;
  min_sell_price: number;
  variants: ResellerVariant[];
}

type ProductBaseRow = {
  id: string;
  name: string;
  category: string;
  series: string | null;
  image: string | null;
  price: number;
  minimum_price: number | null;
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

export async function getResellerCatalog(): Promise<ResellerCatalogProduct[]> {
  const supabase = getSupabaseAdmin();

  const { data: rawProducts, error: productError } = await supabase
    .from("products")
    .select("id, name, category, series, image, price, minimum_price, reseller_discount_percent")
    // Produk dengan diskon NULL tidak dijual ke reseller (aturan bisnis).
    .not("reseller_discount_percent", "is", null)
    .eq("is_published", true)
    .order("created_at", { ascending: true });

  if (productError) {
    console.error("[RESELLER-KATALOG] Gagal membaca produk:", productError.message);
    throw new Error("Gagal memuat katalog reseller");
  }

  const products = (rawProducts ?? []) as unknown as ProductBaseRow[];
  if (products.length === 0) return [];

  const ids = products.map((p) => String(p.id));

  const { data: rawVariants, error: variantError } = await supabase
    .from("product_variants")
    .select("product_id, color, size, stock, base_product_id, hex")
    .in("product_id", ids)
    .order("display_order");

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

  return products.map((product) => {
    const own = variants.filter((v) => v.product_id === product.id);
    return {
      id: product.id,
      name: product.name,
      category: product.category,
      series: product.series ?? null,
      image: product.image ?? null,
      price: Math.round(Number(product.price) || 0),
      minimum_price: product.minimum_price == null ? null : Math.round(Number(product.minimum_price) || 0),
      discount_percent: Number(product.reseller_discount_percent) || 0,
      buy_price: resellerBuyPrice(product),
      min_sell_price: resellerMinSellPrice(product),
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
