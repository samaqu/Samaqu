import { supabase } from "./supabase";
import type { Product, JenisKain } from "./katalog-data";
import { pickRelatedProducts } from "./related-products";

export interface DbProduct {
  id: string;
  name: string;
  category: string;
  description: string | null;
  kain: string | null;
  series: string | null;
  colors: string[];
  price: number;
  tag: string | null;
  badge_type: string | null;
  note: string | null;
  image: string;
  images: string[];
  created_at: string;
  // Jenis Kain
  jenis_kain_id: string | null;
  catatan_harga: string | null;
  // Create Your Price
  minimum_price: number | null;
  recommended_price: number | null;
  create_your_price_enabled: boolean;
  cyp_microcopy_override: string | null;
  // Open Order
  open_order_enabled?: boolean | null;
  /** Sakelar katalog promo "Free Cover Hanger" — terpisah dari `open_order_enabled`. */
  promo_fch_enabled?: boolean | null;
  // Tampil di website (katalog). Kolom `products.is_published`.
  is_published?: boolean | null;
  // Harga khusus Open Order (kampanye) — null = pakai harga katalog biasa.
  open_order_price?: number | null;
  open_order_minimum_price?: number | null;
  open_order_recommended_price?: number | null;
  open_order_cyp_enabled?: boolean | null;
  open_order_cyp_microcopy?: string | null;
  // Weight
  weight: number | null;
  // Joined relation (optional, only when fetched with join)
  jenis_kain?: JenisKain | null;
}

export interface DbTestimonial {
  id: string;
  customer_name: string;
  type: string;
  category: string;
  rating: number;
  verified: boolean;
  content: string;
  image_url: string | null;
  video_url: string | null;
  caption: string | null;
  product_id: string | null;
  series_name: string | null;
  created_at: string;
}

function dbProductToProduct(db: DbProduct): Product {
  const images = Array.isArray(db.images) ? db.images : [];
  return {
    id: db.id,
    name: db.name,
    category: db.category as Product["category"],
    description: db.description || undefined,
    kain: db.kain || undefined,
    series: db.series || undefined,
    colors: Array.isArray(db.colors) ? db.colors : [],
    price: db.price,
    minimum_price: db.minimum_price,
    recommended_price: db.recommended_price,
    create_your_price_enabled: db.create_your_price_enabled ?? false,
    cyp_microcopy_override: db.cyp_microcopy_override || null,
    // Baris lama sebelum kolomnya ada → dianggap ikut Open Order (default kolomnya true).
    open_order_enabled: db.open_order_enabled !== false,
    // Kolom belum dibuat (migrasi belum jalan) → dianggap ikut promo.
    promo_fch_enabled: db.promo_fch_enabled !== false,
    // Harga khusus Open Order — diteruskan apa adanya (null = pakai harga katalog).
    open_order_price: db.open_order_price ?? null,
    open_order_minimum_price: db.open_order_minimum_price ?? null,
    open_order_recommended_price: db.open_order_recommended_price ?? null,
    open_order_cyp_enabled: db.open_order_cyp_enabled ?? null,
    open_order_cyp_microcopy: db.open_order_cyp_microcopy ?? null,
    tag: (db.tag as Product["tag"]) || undefined,
    badge_type: db.badge_type || null,
    note: db.note || undefined,
    image: db.image || "",
    images,
    media: images.map((src) => ({
      src,
      type: src.match(/\.(mp4|webm|ogg)$/i) ? "video" as const : "image" as const,
    })),
    jenis_kain_id: db.jenis_kain_id || null,
    jenis_kain: db.jenis_kain || null,
    catatan_harga: db.catatan_harga || null,
    weight: db.weight || undefined,
  };
}

export async function getProducts(category?: string): Promise<Product[]> {
  try {
    let query = supabase
      .from("products")
      .select("*, jenis_kain(*)")
      .order("created_at", { ascending: true });

    if (category && category !== "Semua") {
      query = query.eq("category", category);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[getProducts] Supabase error:", error.message, error);
      return [];
    }

    if (!data) {
      console.warn("[getProducts] No data returned");
      return [];
    }

    console.log(`[getProducts] Fetched ${data.length} products`);
    return (data as DbProduct[]).map(dbProductToProduct);
  } catch (err) {
    console.error("[getProducts] Unexpected error:", err);
    return [];
  }
}

export async function getProductById(id: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from("products")
    .select("*, jenis_kain(*)")
    .eq("id", id)
    .single();

  if (error || !data) {
    return null;
  }

  // Fetch media from product_images table (includes video detection via is_video flag)
  const { data: images } = await supabase
    .from("product_images")
    .select("url, is_video, color, display_order")
    .eq("product_id", id)
    .order("display_order");

  const product = dbProductToProduct(data as DbProduct);

  // If product_images has data, use it for media (more accurate video detection)
  if (images && images.length > 0) {
    product.media = images.map((img: { url: string; is_video: boolean }) => ({
      src: img.url,
      type: (img.is_video ? "video" : "image") as "video" | "image",
    }));
    product.images = images.map((img: { url: string }) => img.url);
  }

  return product;
}

/**
 * Katalog publik — HANYA produk yang penanda "tampil di website" aktif
 * (`products.is_published`). Dipakai daftar katalog & Open Order.
 *
 * Sengaja fungsi terpisah dari `getProducts()`: `getProducts()` tetap tanpa filter
 * karena dipakai riwayat pesanan (akun/pesanan) yang tidak boleh rusak kalau produk
 * disembunyikan di kemudian hari.
 */
export async function getCatalogProducts(category?: string): Promise<Product[]> {
  try {
    let query = supabase
      .from("products")
      .select("*, jenis_kain(*)")
      .eq("is_published", true)
      .order("created_at", { ascending: true });

    if (category && category !== "Semua") {
      query = query.eq("category", category);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[getCatalogProducts] Supabase error:", error.message, error);
      return [];
    }

    const products = (data as DbProduct[]).map(dbProductToProduct);

    // Media asli dari `product_images` (punya flag `is_video`) supaya video ikut tampil di
    // galeri Open Order. Query terpisah — sama polanya dengan halaman detail katalog — jadi
    // tidak bergantung pada resolusi relasi embed PostgREST.
    const ids = products.map((p) => p.id);
    if (ids.length > 0) {
      const { data: imageRows, error: imageError } = await supabase
        .from("product_images")
        .select("product_id, url, is_video, display_order")
        .in("product_id", ids)
        .order("display_order");

      if (imageError) {
        console.error("[getCatalogProducts] Gagal ambil product_images:", imageError.message);
      } else if (imageRows && imageRows.length > 0) {
        const mediaByProduct = new Map<string, { src: string; type: "image" | "video" }[]>();
        for (const row of imageRows as { product_id: string; url: string; is_video: boolean | null }[]) {
          if (!row.url) continue;
          const list = mediaByProduct.get(row.product_id) ?? [];
          list.push({ src: row.url, type: row.is_video ? "video" : "image" });
          mediaByProduct.set(row.product_id, list);
        }
        for (const product of products) {
          const media = mediaByProduct.get(product.id);
          if (media && media.length > 0) product.media = media;
        }
      }
    }

    return products;
  } catch (err) {
    console.error("[getCatalogProducts] Unexpected error:", err);
    return [];
  }
}

/**
 * Detail produk katalog — null kalau produk belum "tampil" (dipakai untuk 404).
 * Terpisah dari `getProductById()` yang tetap tanpa filter (dipakai checkout/keranjang).
 */
export async function getCatalogProductById(id: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from("products")
    .select("*, jenis_kain(*)")
    .eq("id", id)
    .eq("is_published", true)
    .maybeSingle();

  if (error || !data) return null;

  const { data: images } = await supabase
    .from("product_images")
    .select("url, is_video, color, display_order")
    .eq("product_id", id)
    .order("display_order");

  const product = dbProductToProduct(data as DbProduct);

  if (images && images.length > 0) {
    product.media = images.map((img: { url: string; is_video: boolean }) => ({
      src: img.url,
      type: (img.is_video ? "video" : "image") as "video" | "image",
    }));
    product.images = images.map((img: { url: string }) => img.url);
  }

  return product;
}

/**
 * Rekomendasi "Produk lain dari kain ini" untuk halaman detail produk customer.
 * Hanya produk `is_published = true`; pemilihan warna/jenis kain dilakukan oleh
 * `pickRelatedProducts` (satu sumber aturan, dipakai semua halaman produk).
 *
 * Sengaja fungsi terpisah dari `getProducts()` / `getProductById()` yang tidak
 * boleh disentuh (dipakai riwayat pesanan & checkout).
 */
export async function getRelatedProducts(current: Product, limit = 4): Promise<Product[]> {
  if (!current) return [];
  try {
    const { data, error } = await supabase
      .from("products")
      .select("*, jenis_kain(*)")
      .eq("is_published", true)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[getRelatedProducts] Supabase error:", error.message, error);
      return [];
    }
    if (!data) return [];

    const pool = (data as DbProduct[]).map(dbProductToProduct);
    const picked = pickRelatedProducts(current, pool, limit);
    if (picked.length === 0) return [];

    // Foto kartu = foto utama produk terpilih (`product_images`, display_order menaik).
    const ids = picked.map((p) => p.id);
    const { data: imageRows, error: imageError } = await supabase
      .from("product_images")
      .select("product_id, url, is_video, display_order")
      .in("product_id", ids)
      .order("display_order");

    if (imageError) {
      console.error("[getRelatedProducts] Gagal ambil product_images:", imageError.message);
    } else if (imageRows && imageRows.length > 0) {
      const mediaByProduct = new Map<string, { src: string; type: "image" | "video" }[]>();
      for (const row of imageRows as { product_id: string; url: string; is_video: boolean | null }[]) {
        if (!row.url) continue;
        const list = mediaByProduct.get(row.product_id) ?? [];
        list.push({ src: row.url, type: row.is_video ? "video" : "image" });
        mediaByProduct.set(row.product_id, list);
      }
      for (const product of picked) {
        const media = mediaByProduct.get(product.id);
        if (media && media.length > 0) {
          product.media = media;
          product.images = media.map((m) => m.src);
          product.image = media.find((m) => m.type === "image")?.src || media[0].src;
        }
      }
    }

    return picked;
  } catch (err) {
    console.error("[getRelatedProducts] Unexpected error:", err);
    return [];
  }
}

export async function getTestimonials(category?: string, type?: string) {
  let query = supabase
    .from("testimonials")
    .select("*")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (category && category !== "all") {
    query = query.eq("category", category);
  }

  if (type && type !== "all") {
    query = query.eq("type", type);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching testimonials:", error);
    return [];
  }

  return data as DbTestimonial[];
}

export interface SeriesOption {
  id: string;
  name: string;
  series: string;
  price: number;
  minimum_price: number | null;
  create_your_price_enabled: boolean;
}

export async function getAvailableSeries(jenisKainId: string | null | undefined, color: string, category?: string, seriesName?: string, productName?: string): Promise<SeriesOption[]> {
  if (!jenisKainId && !seriesName) return [];

  let query = supabase
    .from("products")
    .select("id, name, series, price, minimum_price, create_your_price_enabled");

  if (jenisKainId) {
    query = query.eq("jenis_kain_id", jenisKainId);
  } else if (seriesName) {
    query = query.eq("series", seriesName);
  }

  // Thobe: filter by product name (warna) supaya series dari warna lain tidak muncul
  if (category === "Thobe" && productName) {
    query = query.eq("name", productName);
  } else if (category !== "Thobe") {
    query = query.contains("colors", [color]);
  }

  const { data, error } = await query.order("created_at");

  if (error || !data) return [];

  // Deduplicate: jika ada 2+ produk dengan series name yang sama, ambil yang pertama
  const seen = new Set<string>();
  return data
    .filter((p: { series: string | null }) => p.series)
    .filter((p: { series: string }) => {
      if (seen.has(p.series)) return false;
      seen.add(p.series);
      return true;
    })
    .map((p: { id: string; name: string; series: string; price: number; minimum_price: number | null; create_your_price_enabled: boolean }) => ({
      id: p.id,
      name: p.name,
      series: p.series!,
      price: p.price,
      minimum_price: p.minimum_price,
      create_your_price_enabled: p.create_your_price_enabled ?? false,
    }));
}
