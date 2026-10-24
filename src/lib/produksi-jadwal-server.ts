import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ComponentForSchedule,
  RecipeForSchedule,
  RequirementSnapshotRow,
  ScheduleTargetInput,
} from "@/lib/produksi-jadwal";
import type { RecipeLine } from "@/lib/produksi-resep";

const num = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** Komponen + stok fisik (dari view SUM buku stok). */
export async function loadScheduleComponents(
  admin: SupabaseClient,
): Promise<Map<string, ComponentForSchedule>> {
  const { data } = await admin
    .from("production_components_stock")
    .select("id, code, name, unit_use, real_price, stock")
    .eq("is_active", true);

  const map = new Map<string, ComponentForSchedule>();
  for (const row of data || []) {
    map.set(String((row as any).id), {
      id: String((row as any).id),
      code: String((row as any).code || ""),
      name: String((row as any).name || ""),
      unit_use: String((row as any).unit_use || ""),
      real_price: num((row as any).real_price),
      stock: num((row as any).stock),
    });
  }
  return map;
}

/** Resep aktif + baris untuk kategori yang dipakai jadwal. */
export async function loadRecipeMap(
  admin: SupabaseClient,
  categories: string[],
): Promise<Map<string, RecipeForSchedule>> {
  const map = new Map<string, RecipeForSchedule>();
  const unique = Array.from(new Set(categories.filter(Boolean)));
  if (unique.length === 0) return map;

  const { data: recipes } = await admin
    .from("production_recipes")
    .select("id, version, product_category")
    .eq("is_active", true)
    .in("product_category", unique);
  const ids = (recipes || []).map((recipe: any) => recipe.id);
  if (ids.length === 0) return map;

  const { data: lines } = await admin
    .from("production_recipe_lines")
    .select("*")
    .in("recipe_id", ids)
    .order("sort_order", { ascending: true });

  const linesByRecipe = new Map<string, RecipeLine[]>();
  for (const row of lines || []) {
    const list = linesByRecipe.get(row.recipe_id) || [];
    list.push({
      id: row.id,
      line_type: row.line_type === "biaya" ? "biaya" : "bahan",
      group_code: row.group_code,
      group_label: row.group_label || "",
      component_id: row.component_id,
      name: row.name,
      qty_per_pcs: num(row.qty_per_pcs),
      waste_percent: num(row.waste_percent),
      size_qty: row.size_qty && typeof row.size_qty === "object" ? row.size_qty : {},
      real_price: num(row.real_price),
      safe_price: num(row.safe_price),
      filter_fabric_type_id: row.filter_fabric_type_id || null,
      filter_series: row.filter_series || "",
      filter_size: row.filter_size || "",
      filter_color: row.filter_color || "",
      notes: row.notes || "",
      sort_order: row.sort_order,
    });
    linesByRecipe.set(row.recipe_id, list);
  }

  for (const recipe of recipes || []) {
    map.set(String(recipe.product_category), {
      id: String(recipe.id),
      version: Number(recipe.version) || 1,
      product_category: String(recipe.product_category),
      lines: linesByRecipe.get(recipe.id) || [],
    });
  }
  return map;
}

/** Reservasi aktif (hanya jadwal Disetujui), per komponen. */
export async function loadReservedMap(
  admin: SupabaseClient,
  excludeScheduleId?: string | null,
): Promise<Map<string, number>> {
  const { data: schedules } = await admin
    .from("production_schedules")
    .select("id")
    .eq("status", "disetujui");
  const ids = (schedules || [])
    .map((row: any) => String(row.id))
    .filter((id) => id !== excludeScheduleId);
  if (ids.length === 0) return new Map();

  const { data: requirements } = await admin
    .from("production_schedule_requirements")
    .select("component_id, required_qty")
    .in("schedule_id", ids);

  const map = new Map<string, number>();
  for (const row of requirements || []) {
    const id = String((row as any).component_id);
    map.set(id, (map.get(id) || 0) + num((row as any).required_qty));
  }
  return map;
}

export async function loadRequirements(
  admin: SupabaseClient,
  scheduleId: string,
): Promise<RequirementSnapshotRow[]> {
  const { data } = await admin
    .from("production_schedule_requirements")
    .select("target_id, recipe_id, recipe_version, component_id, component_code, component_name, unit_use, required_qty")
    .eq("schedule_id", scheduleId)
    .order("component_name", { ascending: true });

  return (data || []).map((row: any) => ({
    target_id: row.target_id,
    recipe_id: row.recipe_id,
    recipe_version: row.recipe_version,
    component_id: row.component_id,
    component_code: row.component_code,
    component_name: row.component_name,
    unit_use: row.unit_use || "",
    required_qty: num(row.required_qty),
  }));
}

export function mapTargets(rows: any[]): ScheduleTargetInput[] {
  return (rows || []).map((row) => ({
    id: row.id,
    category: row.category,
    fabric_type_id: row.fabric_type_id || null,
    color: row.color || "",
    series: row.series || "",
    size_qtys: row.size_qtys && typeof row.size_qtys === "object" ? row.size_qtys : {},
    total_pcs: num(row.total_pcs),
  }));
}
