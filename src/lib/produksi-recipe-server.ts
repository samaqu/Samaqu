import type { SupabaseClient } from "@supabase/supabase-js";
import type { HppComponentInfo } from "@/lib/produksi-hpp";
import type { RecipeLine } from "@/lib/produksi-resep";

/** Ambil resep + baris + harga komponen terkini. Dipakai kalkulator & matriks. */
export async function loadRecipeForHpp(admin: SupabaseClient, id: string) {
  const { data: recipe, error } = await admin
    .from("production_recipes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!recipe) return null;

  const { data: rows, error: lineError } = await admin
    .from("production_recipe_lines")
    .select("*")
    .eq("recipe_id", id)
    .order("sort_order", { ascending: true });
  if (lineError) throw new Error(lineError.message);

  const componentIds = Array.from(
    new Set((rows || []).map((line: any) => line.component_id).filter(Boolean)),
  );
  const { data: components } = componentIds.length
    ? await admin
        .from("production_components")
        .select("id, code, name, unit_use, real_price, safe_price")
        .in("id", componentIds)
    : { data: [] as any[] };

  const componentMap = new Map<string, HppComponentInfo>();
  for (const component of components || []) {
    componentMap.set(component.id, {
      id: component.id,
      code: component.code,
      name: component.name,
      unit_use: component.unit_use,
      real_price: Number(component.real_price) || 0,
      safe_price: Number(component.safe_price) || 0,
    });
  }

  const lines: RecipeLine[] = (rows || []).map((line: any) => ({
    id: line.id,
    line_type: line.line_type === "biaya" ? "biaya" : "bahan",
    group_code: line.group_code,
    group_label: line.group_label || "",
    component_id: line.component_id,
    component_code: line.component_id ? componentMap.get(line.component_id)?.code || "" : "",
    unit_use: line.component_id ? componentMap.get(line.component_id)?.unit_use || "" : "",
    name: line.name,
    qty_per_pcs: Number(line.qty_per_pcs) || 0,
    waste_percent: Number(line.waste_percent) || 0,
    size_qty: line.size_qty && typeof line.size_qty === "object" ? line.size_qty : {},
    real_price: Number(line.real_price) || 0,
    safe_price: Number(line.safe_price) || 0,
    filter_fabric_type_id: line.filter_fabric_type_id || null,
    filter_series: line.filter_series || "",
    filter_size: line.filter_size || "",
    filter_color: line.filter_color || "",
    notes: line.notes || "",
    sort_order: line.sort_order,
  }));

  return { recipe, lines, components: componentMap };
}
