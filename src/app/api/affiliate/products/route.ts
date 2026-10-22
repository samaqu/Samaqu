import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { affiliateSession, affiliateUnauthorized } from "@/lib/affiliate/auth";
import { getAffiliateSettings, rateForProduct } from "@/lib/affiliate/settings";

/**
 * Katalog produk untuk portal affiliate.
 * Data produk diambil dari katalog sungguhan (`products` + `product_images` +
 * `product_variants`), harga & stok apa adanya. Persentase komisi dihitung dari
 * konfigurasi admin (aturan per produk mengalahkan aturan global).
 */
export async function GET(req: NextRequest) {
  const session = await affiliateSession(req);
  if (!session) return affiliateUnauthorized();

  const supabase = getSupabaseAdmin();
  const settings = await getAffiliateSettings(supabase);

  const { data: productRows } = await supabase
    .from("products")
    .select("id, name, category, series, price, description, image, colors, kain, jenis_kain(name), minimum_price, create_your_price_enabled, created_at")
    .eq("is_published", true)
    .order("created_at", { ascending: true });

  const products = (productRows || []) as {
    id: string;
    name: string;
    category: string;
    series: string | null;
    price: number;
    description: string | null;
    image: string | null;
    colors: string[] | null;
    kain: string | null;
    jenis_kain: { name: string | null } | { name: string | null }[] | null;
    minimum_price: number | null;
    create_your_price_enabled: boolean;
    created_at: string;
  }[];

  if (products.length === 0) {
    return NextResponse.json({ products: [] });
  }

  const ids = products.map((p) => p.id);

  const { data: imageRows } = await supabase
    .from("product_images")
    .select("product_id, url, is_video, display_order")
    .in("product_id", ids)
    .order("display_order");

  const { data: variantRows } = await supabase
    .from("product_variants")
    .select("product_id, color, size, stock")
    .in("product_id", ids);

  const { data: promotedRows } = await supabase
    .from("affiliate_products")
    .select("product_id, is_promoted")
    .eq("affiliate_id", session.affiliate.id);

  const mediaMap = new Map<string, { src: string; type: "image" | "video" }[]>();
  for (const row of (imageRows || []) as { product_id: string; url: string; is_video: boolean | null }[]) {
    if (!row.url) continue;
    const list = mediaMap.get(row.product_id) || [];
    list.push({ src: row.url, type: row.is_video ? "video" : "image" });
    mediaMap.set(row.product_id, list);
  }

  const stockMap = new Map<string, number>();
  const sizeMap = new Map<string, string[]>();
  const colorMap = new Map<string, string[]>();
  for (const row of (variantRows || []) as { product_id: string; color: string | null; size: string | null; stock: number | null }[]) {
    if (!row.product_id) continue;
    stockMap.set(row.product_id, (stockMap.get(row.product_id) || 0) + Number(row.stock || 0));
    if (row.size) {
      const sizes = sizeMap.get(row.product_id) || [];
      if (!sizes.includes(row.size)) sizes.push(row.size);
      sizeMap.set(row.product_id, sizes);
    }
    if (row.color && row.color !== "default") {
      const colors = colorMap.get(row.product_id) || [];
      if (!colors.includes(row.color)) colors.push(row.color);
      colorMap.set(row.product_id, colors);
    }
  }

  const promotedMap = new Map<string, boolean>();
  for (const row of (promotedRows || []) as { product_id: string; is_promoted: boolean }[]) {
    promotedMap.set(row.product_id, row.is_promoted);
  }

  const result = products.map((p) => {
    const media = mediaMap.get(p.id) || [];
    const rate = rateForProduct(settings, p.id);
    const fabric = Array.isArray(p.jenis_kain) ? p.jenis_kain[0]?.name : p.jenis_kain?.name;
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      series: p.series,
      kain: fabric || p.kain || null,
      price: p.price,
      description: p.description,
      image: media.find((m) => m.type === "image")?.src || p.image || "",
      media,
      stock: stockMap.get(p.id) || 0,
      sizes: sizeMap.get(p.id) || [],
      colors: colorMap.get(p.id) || p.colors || [],
      rate,
      estimatedCommission: Math.round((p.price * rate) / 100),
      promoted: promotedMap.get(p.id) ?? false,
      createYourPrice: p.create_your_price_enabled === true,
      minimumPrice: p.minimum_price,
    };
  });

  return NextResponse.json({ products: result });
}
