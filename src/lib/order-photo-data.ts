/**
 * Pengumpul sumber foto item pesanan — dipakai `resolveItemPhotos()` di `src/lib/order-photo.ts`.
 *
 * Aturannya SAMA dengan thumbnail katalog website: foto pertama yang BUKAN video menurut
 * `display_order` di tabel `product_images`; kalau produk belum punya baris di sana, pakai
 * `products.images` / `products.image` yang bukan video. Foto per warna ikut dikumpulkan kalau
 * produknya memang punya (kolom `product_images.color`).
 */

import { supabase } from "./supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isVideoUrl } from "./product-thumbnail";
import type { OrderPhotoLookup } from "./order-photo";
import type { Product } from "./katalog-data";

interface ImageRow {
  product_id?: string | null;
  url?: string | null;
  color?: string | null;
  is_video?: boolean | null;
}

const norm = (value?: string | null) => String(value ?? "").trim().toLowerCase();

export async function loadOrderPhotoLookup(
  productIds: (string | null | undefined)[],
  catalog: Product[] = [],
  /** Default: client publik (perilaku lama). Pemanggil server boleh mengirim
   *  client admin/service-role untuk produk yang tidak terbaca anon. */
  client: SupabaseClient = supabase
): Promise<OrderPhotoLookup> {
  const ids = Array.from(
    new Set((productIds || []).map((id) => String(id ?? "").trim()).filter(Boolean))
  );
  const main: Record<string, string> = {};
  const byColor: Record<string, string> = {};
  if (ids.length === 0) return { main, byColor, catalog };

  try {
    const { data, error } = await client
      .from("product_images")
      .select("product_id, url, color, is_video, display_order")
      .in("product_id", ids)
      .order("display_order");
    if (error) console.error("[ORDER-PHOTO] Gagal ambil product_images:", error.message);

    for (const row of (data ?? []) as ImageRow[]) {
      const url = String(row.url ?? "").trim();
      if (!url || row.is_video || isVideoUrl(url)) continue;

      const productId = String(row.product_id ?? "").trim();
      if (!productId) continue;

      const color = norm(row.color);
      // Foto per warna hanya kalau produknya benar-benar punya warna khusus.
      if (color && color !== "default" && !byColor[`${productId}|${color}`]) {
        byColor[`${productId}|${color}`] = url;
      }
      // `display_order` menaik → yang pertama tersimpan adalah foto utama.
      if (!main[productId]) main[productId] = url;
    }
  } catch (e) {
    console.error("[ORDER-PHOTO] Error product_images:", e);
  }

  // Produk yang belum punya baris di `product_images` → pakai kolom di tabel `products`.
  const missing = ids.filter((id) => !main[id]);
  if (missing.length > 0) {
    try {
      const { data, error } = await client.from("products").select("id, image, images").in("id", missing);
      if (error) console.error("[ORDER-PHOTO] Gagal ambil products:", error.message);

      for (const row of (data ?? []) as { id?: string; image?: string | null; images?: unknown }[]) {
        const id = String(row.id ?? "").trim();
        if (!id) continue;
        const list = Array.isArray(row.images) ? row.images : [];
        const fromList = list.find((url) => typeof url === "string" && url && !isVideoUrl(url));
        const single = typeof row.image === "string" && row.image && !isVideoUrl(row.image) ? row.image : "";
        const photo = fromList || single;
        if (photo) main[id] = photo;
      }
    } catch (e) {
      console.error("[ORDER-PHOTO] Error products:", e);
    }
  }

  return { main, byColor, catalog };
}

/** Kumpulan `product_id` dari daftar item pesanan (siap dikirim ke `loadOrderPhotoLookup`). */
export function itemProductIds(items: { product_id?: string | null }[]): string[] {
  return (items || []).map((item) => String(item?.product_id ?? "").trim()).filter(Boolean);
}
