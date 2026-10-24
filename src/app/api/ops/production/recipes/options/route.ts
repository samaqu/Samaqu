import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ownerProductionGuard } from "@/lib/ops-auth";
import { CATEGORY_ORDER, SERIES_ORDER } from "@/lib/ops-order";
import { COST_GROUP_DEFAULTS } from "@/lib/produksi-resep";

/**
 * Pilihan untuk form resep. Semua daftar diambil dari data yang SUDAH ada:
 * kategori & series memakai aturan tampilan ops, jenis kain dari `jenis_kain`,
 * ukuran & warna dari varian produk.
 */
export async function GET(req: NextRequest) {
  const access = await ownerProductionGuard(req);
  if (!access.ok) return access.response;

  const admin = getSupabaseAdmin();
  const [
    { data: fabrics },
    { data: products },
    { data: variants },
    { data: savedGroups },
    { data: usedGroups },
    { data: activeRecipes },
    { data: kainLines },
  ] = await Promise.all([
    admin.from("jenis_kain").select("id, name").order("name", { ascending: true }),
    admin.from("products").select("category, series, colors, jenis_kain_id"),
    admin.from("product_variants").select("size, color"),
    admin.from("production_cost_groups").select("name").order("name", { ascending: true }),
    admin
      .from("production_recipe_lines")
      .select("group_label")
      .eq("line_type", "biaya")
      .not("group_label", "is", null),
    admin.from("production_recipes").select("id, product_category").eq("is_active", true),
    admin
      .from("production_recipe_lines")
      .select("recipe_id, line_type, group_code")
      .eq("line_type", "bahan")
      .eq("group_code", "kain"),
  ]);

  const categoryByRecipe = new Map(
    (activeRecipes || []).map((recipe: any) => [String(recipe.id), String(recipe.product_category || "")]),
  );
  const kainCategories = Array.from(
    new Set(
      (kainLines || [])
        .map((line: any) => categoryByRecipe.get(String(line.recipe_id)) || "")
        .filter(Boolean),
    ),
  );

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

  // Dropdown kelompok biaya: daftar tetap dulu, lalu kelompok tambahan & label
  // lama (teks bebas) supaya data lama tetap bisa dipilih tanpa diubah.
  const defaultKeys = new Set(COST_GROUP_DEFAULTS.map((name) => name.toLowerCase()));
  const extra = new Map<string, string>();
  for (const item of [...(savedGroups || []), ...(usedGroups || [])]) {
    const name = String((item as any)?.name || (item as any)?.group_label || "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (defaultKeys.has(key) || extra.has(key)) continue;
    extra.set(key, name);
  }
  const costGroups = [
    ...COST_GROUP_DEFAULTS,
    ...Array.from(extra.values()).sort((a, b) => a.localeCompare(b, "id")),
  ];

  return NextResponse.json({
    categories,
    series: Array.from(seriesSet),
    sizes: Array.from(sizeSet),
    colors: Array.from(colorSet).sort((a, b) => a.localeCompare(b, "id")),
    fabrics: fabrics || [],
    cost_groups: costGroups,
    kain_categories: kainCategories,
    product_combinations: (products || []).map((product: any) => ({
      category: String(product.category || ""),
      fabric_type_id: product.jenis_kain_id || null,
      series: String(product.series || ""),
    })),
  });
}
