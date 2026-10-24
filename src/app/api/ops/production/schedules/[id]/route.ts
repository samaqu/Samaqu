import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ownerProductionGuard } from "@/lib/ops-auth";
import {
  computeScheduleRequirements,
  groupRequirements,
  targetTotalPcs,
} from "@/lib/produksi-jadwal";
import {
  loadRecipeMap,
  loadRequirements,
  loadReservedMap,
  loadScheduleComponents,
  mapTargets,
} from "@/lib/produksi-jadwal-server";

/** Detail jadwal + aksi status (approve/mulai/cancel/catatan). */

async function loadSchedule(admin: ReturnType<typeof getSupabaseAdmin>, id: string) {
  const { data } = await admin.from("production_schedules").select("*").eq("id", id).maybeSingle();
  return data;
}

async function loadTargetRows(admin: ReturnType<typeof getSupabaseAdmin>, id: string) {
  const { data } = await admin
    .from("production_schedule_targets")
    .select("*, jenis_kain(name)")
    .eq("schedule_id", id)
    .order("sort_order", { ascending: true });
  return (data || []).map((row: any) => ({ ...row, fabric_type_name: row.jenis_kain?.name || "" }));
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const access = await ownerProductionGuard(req);
  if (!access.ok) return access.response;

  const { id } = await context.params;
  const admin = getSupabaseAdmin();
  const schedule = await loadSchedule(admin, id);
  if (!schedule) return NextResponse.json({ error: "Jadwal tidak ditemukan." }, { status: 404 });

  const [targetRows, components] = await Promise.all([
    loadTargetRows(admin, id),
    loadScheduleComponents(admin),
  ]);
  const targets = mapTargets(targetRows);
  const recipeMap = await loadRecipeMap(admin, targets.map((target) => target.category));

  const computed = computeScheduleRequirements(targets, recipeMap, components);
  const isSnapshot = ["disetujui", "berjalan", "selesai"].includes(schedule.status);
  const snapshotRows = schedule.status === "batal" ? await loadRequirements(admin, id) : [];
  const sourceRows = isSnapshot
    ? await loadRequirements(admin, id)
    : snapshotRows.length > 0
      ? snapshotRows
      : computed.rows;

  const reservedMap = await loadReservedMap(admin, id);
  const warnings = new Set<string>(computed.warnings);

  const requirements = groupRequirements(sourceRows).map((row) => {
    const component = components.get(row.component_id);
    const stock = component?.stock || 0;
    const reserved = reservedMap.get(row.component_id) || 0;
    const available = stock - reserved;
    const difference = available - row.required_qty;
    if (!component) warnings.add(`Komponen ${row.component_code} tidak ditemukan.`);
    else if (!(component.real_price > 0)) warnings.add(`Harga Real ${row.component_code} belum diisi.`);
    return {
      ...row,
      stock,
      reserved,
      available,
      difference: Math.round(difference * 10000) / 10000,
      sufficient: difference >= -0.0001,
      real_price: component?.real_price || 0,
      value: Math.round(row.required_qty * (component?.real_price || 0) * 100) / 100,
    };
  });

  const materialCost = requirements.reduce((sum, row) => sum + row.value, 0);
  const nonMaterialCost = computed.non_material_cost;
  const totalPcs = Number(schedule.total_pcs) || targets.reduce((sum, target) => sum + targetTotalPcs(target), 0);

  const recipesUsed = new Map<string, { recipe_id: string; version: number; category: string }>();
  for (const row of sourceRows) {
    if (row.recipe_id) {
      const recipe = recipeMap.get(targets.find((target) => target.id === row.target_id)?.category || "");
      const key = String(row.recipe_id);
      if (!recipesUsed.has(key)) {
        recipesUsed.set(key, {
          recipe_id: key,
          version: Number(row.recipe_version) || 1,
          category: recipe?.product_category || "",
        });
      }
    }
  }
  if (recipesUsed.size === 0) {
    for (const recipe of computed.recipes) recipesUsed.set(recipe.recipe_id, recipe);
  }

  return NextResponse.json({
    item: schedule,
    targets: targetRows.map((row: any) => ({
      id: row.id,
      category: row.category,
      fabric_type_id: row.fabric_type_id,
      fabric_type_name: row.fabric_type_name || "",
      color: row.color || "",
      series: row.series || "",
      size_qtys: row.size_qtys || {},
      total_pcs: Number(row.total_pcs) || 0,
    })),
    requirements,
    warnings: Array.from(warnings),
    cost_estimate: {
      material: Math.round(materialCost * 100) / 100,
      non_material: nonMaterialCost,
      total: Math.round((materialCost + nonMaterialCost) * 100) / 100,
    },
    recipes_used: Array.from(recipesUsed.values()),
    total_pcs: totalPcs,
    can_edit: ["draft", "disetujui"].includes(schedule.status),
    can_approve: schedule.status === "draft",
    can_start: schedule.status === "disetujui",
    can_cancel: ["draft", "disetujui", "berjalan"].includes(schedule.status),
  });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const access = await ownerProductionGuard(req);
  if (!access.ok) return access.response;

  const { id } = await context.params;
  const admin = getSupabaseAdmin();
  const schedule = await loadSchedule(admin, id);
  if (!schedule) return NextResponse.json({ error: "Jadwal tidak ditemukan." }, { status: 404 });

  try {
    const body = await req.json();
    const action = String(body?.action || "");

    if (action === "approve") {
      if (schedule.status !== "draft") {
        return NextResponse.json({ error: "Hanya jadwal Draft yang bisa disetujui." }, { status: 400 });
      }
      const targets = mapTargets(await loadTargetRows(admin, id));
      const [components, recipeMap] = await Promise.all([
        loadScheduleComponents(admin),
        loadRecipeMap(admin, targets.map((target) => target.category)),
      ]);
      const computed = computeScheduleRequirements(targets, recipeMap, components);
      const { data, error } = await admin.rpc("production_approve_schedule", {
        p_id: id,
        p_requirements: computed.rows,
        p_actor: access.email,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ result: data, warnings: computed.warnings });
    }

    if (action === "start") {
      if (schedule.status !== "disetujui") {
        return NextResponse.json({ error: "Hanya jadwal Disetujui yang bisa dimulai." }, { status: 400 });
      }
      const items = (Array.isArray(body?.items) ? body.items : [])
        .map((item: any) => ({ component_id: String(item?.component_id || ""), qty: Number(item?.qty) || 0 }))
        .filter((item: any) => item.component_id && item.qty > 0);
      if (items.length === 0) {
        return NextResponse.json({ error: "Tidak ada komponen dengan jumlah lebih dari 0." }, { status: 400 });
      }
      const { data, error } = await admin.rpc("production_start_schedule", {
        p_id: id,
        p_items: items,
        p_actor: access.email,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ result: data });
    }

    if (action === "cancel") {
      if (schedule.status === "berjalan") {
        const items = (Array.isArray(body?.items) ? body.items : [])
          .map((item: any) => ({ component_id: String(item?.component_id || ""), qty: Number(item?.qty) || 0 }))
          .filter((item: any) => item.component_id && item.qty > 0);
        const { data, error } = await admin.rpc("production_cancel_started_schedule", {
          p_id: id,
          p_items: items,
          p_actor: access.email,
        });
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ result: data });
      }

      if (!["draft", "disetujui"].includes(schedule.status)) {
        return NextResponse.json({ error: "Jadwal ini tidak bisa dibatalkan." }, { status: 400 });
      }
      const { data, error } = await admin.rpc("production_cancel_schedule", {
        p_id: id,
        p_actor: access.email,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ result: data });
    }

    if (action === "notes") {
      if (!["draft", "disetujui", "berjalan"].includes(schedule.status)) {
        return NextResponse.json({ error: "Catatan tidak bisa diubah pada status ini." }, { status: 400 });
      }
      const notes = String(body?.notes || "").trim() || null;
      const { error } = await admin
        .from("production_schedules")
        .update({ notes, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ notes });
    }

    return NextResponse.json({ error: "Aksi tidak dikenal." }, { status: 400 });
  } catch (e) {
    console.error("[PRODUKSI] jadwal PATCH:", e);
    return NextResponse.json({ error: "Gagal memproses jadwal." }, { status: 500 });
  }
}
