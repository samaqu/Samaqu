/**
 * Query daftar produk untuk tab admin "Produk & Harga" (reseller).
 *
 * Menampilkan SEMUA baris `products` — termasuk yang disembunyikan dari katalog
 * website, khusus Open Order, add-on, dan series turunan. Tidak ada filter
 * visibilitas di sini: penyaringan hanya dilakukan UI lewat kolom
 * `is_published` / `open_order_enabled`. Aturan tampil katalog website &
 * Open Order TIDAK diubah.
 *
 * Thumbnail memakai rantai yang sama dengan katalog/order: `product_images`
 * (display_order menaik, lewati video) → `products.images` → `products.image`
 * (lewati video), lewat helper foto yang sudah ada.
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { loadOrderPhotoLookup } from "@/lib/order-photo-data";
import { isVideoUrl } from "@/lib/product-thumbnail";
import { getResellerSettings } from "./settings";
import { resellerBuyPrice, resellerMinSellPrice, type ResellerPriceable } from "./pricing";

export interface AdminCatalogRow {
  id: string;
  name: string;
  category: string;
  series: string | null;
  thumbnail: string | null;
  kain: string | null;
  price: number;
  is_published: boolean;
  open_order_enabled: boolean;
  created_at: string | null;
  reseller_enabled: boolean;
  reseller_discount_percent: number | null;
  reseller_min_sell_price: number | null;
  buy_price: number;
  min_sell_price: number;
}

function pickThumbnail(
  productId: string,
  images: unknown,
  image: unknown,
  lookupMain: Record<string, string>
): string | null {
  const fromImages = lookupMain[productId];
  if (fromImages) return fromImages;

  if (Array.isArray(images)) {
    const found = images.map((url) => String(url || "").trim()).find((url) => url && !isVideoUrl(url));
    if (found) return found;
  }

  const single = String(image || "").trim();
  return single && !isVideoUrl(single) ? single : null;
}

export async function listAdminCatalog(): Promise<{
  rows: AdminCatalogRow[];
  defaultDiscount: number;
}> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("products")
    .select(
      "id, name, category, series, image, images, price, is_published, open_order_enabled, created_at, reseller_enabled, reseller_discount_percent, reseller_min_sell_price, jenis_kain(name)"
    )
    .order("category", { ascending: true })
    .order("name", { ascending: true })
    .order("series", { ascending: true });

  if (error) {
    console.error("[RESELLER-ADMIN-CATALOG] Gagal membaca produk:", error.message);
    throw new Error("Gagal memuat produk");
  }

  const rawRows = data ?? [];
  // Foto utama per produk — satu query batch lewat helper bersama.
  const photoLookup = await loadOrderPhotoLookup(rawRows.map((row) => String(row.id)));

  const settings = await getResellerSettings();
  const defaultDiscount = settings.defaultDiscountPercent;

  const rows: AdminCatalogRow[] = rawRows.map((row) => {
    const priceable: ResellerPriceable = {
      price: Number(row.price) || 0,
      reseller_discount_percent: row.reseller_discount_percent as number | string | null,
      reseller_min_sell_price: row.reseller_min_sell_price as number | null,
    };
    return {
      id: String(row.id),
      name: String(row.name || ""),
      category: String(row.category || ""),
      series: row.series == null ? null : String(row.series),
      thumbnail: pickThumbnail(String(row.id), row.images, row.image, photoLookup.main ?? {}),
      kain: (row as { jenis_kain?: { name?: string | null } | null }).jenis_kain?.name ?? null,
      price: Math.round(Number(row.price) || 0),
      is_published: row.is_published === true,
      open_order_enabled: row.open_order_enabled === true,
      created_at: (row.created_at as string | null) ?? null,
      reseller_enabled: row.reseller_enabled === true,
      reseller_discount_percent:
        row.reseller_discount_percent == null ? null : Number(row.reseller_discount_percent),
      reseller_min_sell_price:
        row.reseller_min_sell_price == null ? null : Math.round(Number(row.reseller_min_sell_price)),
      buy_price: resellerBuyPrice(priceable, defaultDiscount),
      min_sell_price: resellerMinSellPrice(priceable, defaultDiscount),
    };
  });

  return { rows, defaultDiscount };
}
