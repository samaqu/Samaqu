import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ownerProductionGuard } from "@/lib/ops-auth";
import { CATEGORY_ORDER, SERIES_ORDER } from "@/lib/ops-order";
import { COST_GROUP_EXAMPLES } from "@/lib/produksi-resep";

/**
 * Pilihan untuk form resep. Semua daftar diambil dari data yang SUDAH ada:
 * kategori & series memakai aturan tampilan ops, jenis kain dari `jenis_kain`,
 * ukuran & warna dari varian produk.
 */
export async function GET(req: NextRequest) {
  const access = await ownerProductionGuard(req);
  if (!access.ok) return access.response;

  const admin = getSupabaseAdmin();
  const [{ data: fabrics }, { data: products }, { data: variants }] = await Promise.all([
    admin.from("jenis_kain").select("id, name").order("name", { ascending: true }),
    admin.from("products").select("category, series, colors"),
    admin.from("product_variants").select("size, color"),
  ]);

  const categories = [...CATEGORY_ORDER];
  const seriesSet = new Set(SERIES_ORDER);
  const sizeSet = new Set(["XS", "S", "M", "L", "XL", "XXL", "ALL SIZE"]);
  const colorSet = new Set<string>();

  for (const product of products || []) {
    if (product.series) seriesSet.add(String(product.series));
    for (const color of Array.isArray(product.colors) ? product.colors : []) {
      const value = String(color || "").trim();
      if (value) colorSet.add(value);
    }
  }
  for (const variant of variants || []) {
    if (variant.size) sizeSet.add(String(variant.size).toUpperCase());
    const color = String(variant.color || "").trim();
    if (color && color.toLowerCase() !== "default") colorSet.add(color);
  }

  return NextResponse.json({
    categories,
    series: Array.from(seriesSet),
    sizes: Array.from(sizeSet),
    colors: Array.from(colorSet).sort((a, b) => a.localeCompare(b, "id")),
    fabrics: fabrics || [],
    cost_groups: COST_GROUP_EXAMPLES,
  });
}
