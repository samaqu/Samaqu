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
import { computeStandardCost, costLinesForTarget, countMatchingProducts } from "@/lib/produksi-finished";
import {
  loadReceiptBundle,
  outstandingReworkMap,
  processedByTargetSize,
  receiptTotals,
} from "@/lib/produksi-finished-server";

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

  // ── Fase 4: penerimaan, rework, HPP aktual & pemakaian bahan ──
  const bundle = await loadReceiptBundle(admin, id);
  const outstanding = outstandingReworkMap(bundle.items);
  const processedMap = processedByTargetSize(bundle.items);
  const receiptSummary = receiptTotals(bundle.receipts);

  const { data: usageMovements } = await admin
    .from("production_stock_movements")
    .select("component_id, type, qty, unit_price")
    .eq("ref_type", "production_schedule")
    .eq("ref_id", id)
    .in("type", ["keluar_produksi", "retur_sisa_bahan"]);

  const issuedMap = new Map<string, number>();
  const returnedMap = new Map<string, number>();
  let issuedCostTotal = 0;
  let returnedCostTotal = 0;
  for (const movement of usageMovements || []) {
    const componentId = String(movement.component_id);
    const qty = Math.abs(Number(movement.qty) || 0);
    const value = qty * (Number(movement.unit_price) || 0);
    if (movement.type === "keluar_produksi") {
      issuedMap.set(componentId, (issuedMap.get(componentId) || 0) + qty);
      issuedCostTotal += value;
    } else {
      returnedMap.set(componentId, (returnedMap.get(componentId) || 0) + qty);
      returnedCostTotal += value;
    }
  }

  const processedTargets = targets.map((target) => ({
    ...target,
    size_qtys: Object.fromEntries(
      Object.keys(target.size_qtys || {}).map((size) => [
        size,
        processedMap.get(`${target.id}|${size}`) || 0,
      ]),
    ),
  }));
  const standardUsage = computeScheduleRequirements(processedTargets, recipeMap, components);
  const standardByComponent = new Map(
    groupRequirements(standardUsage.rows).map((row) => [row.component_id, row.required_qty]),
  );
  const standardCost = computeStandardCost(targets, processedMap, recipeMap, components);

  const usageIds = new Set<string>([
    ...requirements.map((row) => row.component_id),
    ...issuedMap.keys(),
    ...returnedMap.keys(),
  ]);
  const usage = Array.from(usageIds).map((componentId) => {
    const component = components.get(componentId);
    const issued = issuedMap.get(componentId) || 0;
    const returned = returnedMap.get(componentId) || 0;
    const actualQty = Math.max(0, Math.round((issued - returned) * 10000) / 10000);
    const standardQty = standardByComponent.get(componentId) || 0;
    const defaultReturn = Math.max(0, Math.round((issued - standardQty) * 10000) / 10000);
    return {
      component_id: componentId,
      component_code: component?.code || "",
      component_name: component?.name || "",
      unit_use: component?.unit_use || "",
      issued_qty: issued,
      returned_qty: returned,
      standard_qty: standardQty,
      default_return_qty: defaultReturn,
      actual_qty: actualQty,
      difference: Math.round((actualQty - standardQty) * 10000) / 10000,
      unit_price: component?.real_price || 0,
    };
  });

  const totalOutstandingRework = Array.from(outstanding.values()).reduce((sum, qty) => sum + qty, 0);
  const totalLolos = receiptSummary.lolos + receiptSummary.resolvedLolos;
  const totalReject = receiptSummary.reject + receiptSummary.resolvedReject;
  const totalResult = totalLolos + totalOutstandingRework + totalReject;
  // Setelah Selesai, biaya bahan memakai pemakaian aktual (dikeluarkan − retur).
  // Sebelumnya, penerimaan memakai alokasi biaya yang sudah dikeluarkan.
  const completed = schedule.status === "selesai";
  const finalMaterialCost = Math.max(0, issuedCostTotal - returnedCostTotal);
  const summaryMaterialCost = completed && schedule.final_material_cost != null
    ? Number(schedule.final_material_cost)
    : completed
      ? finalMaterialCost
      : receiptSummary.material;
  const summaryTotalCost = completed && schedule.final_total_cost != null
    ? Number(schedule.final_total_cost)
    : completed
      ? summaryMaterialCost + receiptSummary.nonMaterial
      : receiptSummary.totalCost;
  const calculatedHppActual = totalLolos > 0 ? summaryTotalCost / totalLolos : 0;
  const storedFinalHpp = completed && schedule.final_hpp != null ? Number(schedule.final_hpp) : null;
  const storedEstimatedHpp = completed && schedule.estimated_hpp != null ? Number(schedule.estimated_hpp) : null;
  const hppActual = storedFinalHpp != null ? storedFinalHpp : calculatedHppActual;
  const hppStandard = totalLolos > 0 ? standardCost.total / totalLolos : 0;

  const resultMap = new Map<string, { lolos: number; reject: number }>();
  for (const item of bundle.items) {
    const key = `${item.target_id}|${item.size}`;
    const current = resultMap.get(key) || { lolos: 0, reject: 0 };
    current.lolos += (Number(item.qty_lolos) || 0) + (Number(item.rework_to_lolos) || 0);
    current.reject += (Number(item.qty_reject) || 0) + (Number(item.rework_to_reject) || 0);
    resultMap.set(key, current);
  }
  const results = targetRows.flatMap((target: any) =>
    Object.entries(target.size_qtys || {})
      .filter(([, qty]) => Number(qty) > 0)
      .map(([size, targetQty]) => {
        const key = `${target.id}|${size}`;
        const row = resultMap.get(key) || { lolos: 0, reject: 0 };
        return {
          target_id: target.id,
          category: target.category,
          size,
          target_qty: Number(targetQty) || 0,
          lolos: row.lolos,
          rework: outstanding.get(key) || 0,
          reject: row.reject,
        };
      }),
  );

  const receiptItemsByReceipt = new Map<string, any[]>();
  for (const item of bundle.items) {
    const list = receiptItemsByReceipt.get(item.receipt_id) || [];
    list.push(item);
    receiptItemsByReceipt.set(item.receipt_id, list);
  }
  const receiptCostsByReceipt = new Map<string, any[]>();
  for (const cost of bundle.costs) {
    const list = receiptCostsByReceipt.get(cost.receipt_id) || [];
    list.push(cost);
    receiptCostsByReceipt.set(cost.receipt_id, list);
  }
  const receipts = bundle.receipts.map((receipt) => ({
    ...receipt,
    items: receiptItemsByReceipt.get(receipt.id) || [],
    costs: receiptCostsByReceipt.get(receipt.id) || [],
  }));

  const { data: hppContributionRows } = await admin
    .from("production_schedule_hpp_contributions")
    .select("product_id, color, size, qty, hpp_value, is_final")
    .eq("schedule_id", id);
  const hppProductIds = Array.from(
    new Set((hppContributionRows || []).map((row: any) => String(row.product_id))),
  );
  const [{ data: hppProducts }, { data: hppGlobalRows }] = hppProductIds.length > 0
    ? await Promise.all([
        admin.from("products").select("id, name").in("id", hppProductIds),
        admin
          .from("production_finished_hpp")
          .select("product_id, color, size, qty_received, hpp_avg")
          .in("product_id", hppProductIds),
      ])
    : [{ data: [] as any[] }, { data: [] as any[] }];
  const productNameById = new Map((hppProducts || []).map((row: any) => [String(row.id), String(row.name || "")]));
  const globalHppByKey = new Map(
    (hppGlobalRows || []).map((row: any) => [
      `${row.product_id}|${row.color}|${row.size}`,
      row,
    ]),
  );
  const contributionMap = new Map<
    string,
    { product_id: string; color: string; size: string; qty: number; value: number; final: boolean }
  >();
  for (const row of hppContributionRows || []) {
    const key = `${row.product_id}|${row.color}|${row.size}`;
    const qty = Number(row.qty) || 0;
    const current = contributionMap.get(key) || {
      product_id: String(row.product_id),
      color: String(row.color || "default"),
      size: String(row.size || ""),
      qty: 0,
      value: 0,
      final: false,
    };
    current.qty += qty;
    current.value += qty * (Number(row.hpp_value) || 0);
    current.final = current.final || Boolean(row.is_final);
    contributionMap.set(key, current);
  }
  const finishedHpp = Array.from(contributionMap.values())
    .map((row) => {
      const key = `${row.product_id}|${row.color}|${row.size}`;
      const global = globalHppByKey.get(key);
      return {
        product_id: row.product_id,
        product_name: productNameById.get(row.product_id) || row.product_id,
        color: row.color,
        size: row.size,
        qty: Math.round(row.qty * 10000) / 10000,
        hpp_schedule: row.qty > 0 ? Math.round((row.value / row.qty) * 100) / 100 : 0,
        hpp_avg: global ? Number(global.hpp_avg) || 0 : 0,
        qty_received: global ? Number(global.qty_received) || 0 : 0,
        is_final: row.final,
      };
    })
    .sort((a, b) => a.product_name.localeCompare(b.product_name, "id") || a.size.localeCompare(b.size));

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
      cost_lines: costLinesForTarget(
        { category: row.category, fabric_type_id: row.fabric_type_id, color: row.color, series: row.series, size_qtys: {} },
        recipeMap.get(String(row.category || "")),
      ),
    })),
    requirements,
    warnings: Array.from(warnings),
    cost_estimate: {
      material: Math.round(materialCost * 100) / 100,
      non_material: nonMaterialCost,
      total: Math.round((materialCost + nonMaterialCost) * 100) / 100,
    },
    receipts,
    finished_hpp: finishedHpp,
    results,
    outstanding_rework: totalOutstandingRework,
    usage,
    summary: {
      target_pcs: totalPcs,
      lolos: totalLolos,
      rework: totalOutstandingRework,
      reject: totalReject,
      percent_lolos: totalResult > 0 ? Math.round((totalLolos / totalResult) * 1000) / 10 : 0,
      percent_reject: totalResult > 0 ? Math.round((totalReject / totalResult) * 1000) / 10 : 0,
      material_cost: summaryMaterialCost,
      non_material_cost: receiptSummary.nonMaterial,
      total_cost: summaryTotalCost,
      hpp_actual: Math.round(hppActual * 100) / 100,
      hpp_estimated: Math.round((storedEstimatedHpp ?? calculatedHppActual) * 100) / 100,
      hpp_final: storedFinalHpp != null ? Math.round(storedFinalHpp * 100) / 100 : null,
      hpp_standard: Math.round(hppStandard * 100) / 100,
      hpp_difference: Math.round((hppActual - hppStandard) * 100) / 100,
      standard_cost: standardCost.total,
    },
    recipes_used: Array.from(recipesUsed.values()),
    total_pcs: totalPcs,
    can_edit: ["draft", "disetujui"].includes(schedule.status),
    can_approve: schedule.status === "draft",
    can_start: schedule.status === "disetujui",
    can_cancel: ["draft", "disetujui", "berjalan"].includes(schedule.status) && bundle.receipts.length === 0,
    can_receive: schedule.status === "berjalan",
    can_issue: schedule.status === "berjalan",
    can_complete: schedule.status === "berjalan" && totalOutstandingRework === 0,
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
      const [components, recipeMap, { data: productRows }] = await Promise.all([
        loadScheduleComponents(admin),
        loadRecipeMap(admin, targets.map((target) => target.category)),
        admin.from("products").select("category, jenis_kain_id, series"),
      ]);
      const productCombinations = (productRows || []).map((row: any) => ({
        category: String(row.category || ""),
        fabric_type_id: row.jenis_kain_id || null,
        series: String(row.series || ""),
      }));
      for (const target of targets) {
        const count = countMatchingProducts(
          target.category,
          target.fabric_type_id,
          target.series,
          productCombinations,
        );
        if (count > 1 && !target.color) {
          return NextResponse.json(
            {
              error: `Warna wajib diisi untuk ${target.category}${target.series ? ` · ${target.series}` : ""} karena kombinasi ini cocok dengan ${count} produk.`,
            },
            { status: 400 },
          );
        }
      }
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

    if (action === "issue") {
      if (schedule.status !== "berjalan") {
        return NextResponse.json({ error: "Hanya jadwal Berjalan yang bisa menambah bahan." }, { status: 400 });
      }
      const items = (Array.isArray(body?.items) ? body.items : [])
        .map((item: any) => ({ component_id: String(item?.component_id || ""), qty: Number(item?.qty) || 0 }))
        .filter((item: any) => item.component_id && item.qty > 0);
      if (items.length === 0) {
        return NextResponse.json({ error: "Pilih komponen dan jumlah lebih dari 0." }, { status: 400 });
      }
      const { data, error } = await admin.rpc("production_issue_schedule_materials", {
        p_schedule_id: id,
        p_items: items,
        p_actor: access.email,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ result: data });
    }

    if (action === "complete") {
      if (schedule.status !== "berjalan") {
        return NextResponse.json({ error: "Hanya jadwal Berjalan yang bisa ditutup." }, { status: 400 });
      }
      const items = (Array.isArray(body?.items) ? body.items : [])
        .map((item: any) => ({ component_id: String(item?.component_id || ""), qty: Number(item?.qty) || 0 }))
        .filter((item: any) => item.component_id && item.qty > 0);
      const { data, error } = await admin.rpc("production_complete_schedule", {
        p_schedule_id: id,
        p_items: items,
        p_notes: String(body?.notes || "").trim() || null,
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
