import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ownerProductionGuard } from "@/lib/ops-auth";

/** Detail satu versi resep + semua barisnya (read-only; versi lama tetap bisa dilihat). */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const access = await ownerProductionGuard(req);
  if (!access.ok) return access.response;

  const { id } = await context.params;
  const admin = getSupabaseAdmin();

  const { data: recipe, error } = await admin
    .from("production_recipes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!recipe) return NextResponse.json({ error: "Resep tidak ditemukan." }, { status: 404 });

  const { data: lines, error: lineError } = await admin
    .from("production_recipe_lines")
    .select("*")
    .eq("recipe_id", id)
    .order("sort_order", { ascending: true });
  if (lineError) return NextResponse.json({ error: lineError.message }, { status: 500 });

  const componentIds = Array.from(
    new Set((lines || []).map((line: any) => line.component_id).filter(Boolean)),
  );
  const fabricIds = Array.from(
    new Set((lines || []).map((line: any) => line.filter_fabric_type_id).filter(Boolean)),
  );

  const [{ data: components }, { data: fabrics }] = await Promise.all([
    componentIds.length
      ? admin
          .from("production_components")
          .select("id, code, name, unit_use, real_price, safe_price, category")
          .in("id", componentIds)
      : Promise.resolve({ data: [] as any[] }),
    fabricIds.length
      ? admin.from("jenis_kain").select("id, name").in("id", fabricIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const componentById = new Map((components || []).map((c: any) => [c.id, c]));
  const fabricById = new Map((fabrics || []).map((f: any) => [f.id, f.name]));

  const items = (lines || []).map((line: any) => {
    const component = line.component_id ? (componentById.get(line.component_id) as any) : null;
    return {
      id: line.id,
      line_type: line.line_type,
      group_code: line.group_code,
      group_label: line.group_label || "",
      component_id: line.component_id,
      component_code: component?.code || "",
      component_name: component?.name || "",
      component_unit: component?.unit_use || "",
      component_real_price: Number(component?.real_price) || 0,
      component_safe_price: Number(component?.safe_price) || 0,
      name: line.name,
      qty_per_pcs: Number(line.qty_per_pcs) || 0,
      waste_percent: Number(line.waste_percent) || 0,
      size_qty: line.size_qty && typeof line.size_qty === "object" ? line.size_qty : {},
      real_price: Number(line.real_price) || 0,
      safe_price: Number(line.safe_price) || 0,
      filter_fabric_type_id: line.filter_fabric_type_id || null,
      filter_fabric_name: line.filter_fabric_type_id
        ? fabricById.get(line.filter_fabric_type_id) || ""
        : "",
      filter_series: line.filter_series || "",
      filter_size: line.filter_size || "",
      filter_color: line.filter_color || "",
      notes: line.notes || "",
      sort_order: line.sort_order,
    };
  });

  return NextResponse.json({ item: recipe, lines: items });
}
