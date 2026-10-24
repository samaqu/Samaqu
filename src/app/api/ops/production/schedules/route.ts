import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ownerProductionGuard } from "@/lib/ops-auth";
import {
  computeScheduleRequirements,
  groupRequirements,
  targetSummary,
  targetTotalPcs,
  type ScheduleTargetInput,
} from "@/lib/produksi-jadwal";
import {
  loadRecipeMap,
  loadScheduleComponents,
  mapTargets,
} from "@/lib/produksi-jadwal-server";

/**
 * Daftar jadwal produksi + buat/ubah Draft.
 * Semua route jadwal hanya untuk Owner (Leader/Admin 403).
 */

function cleanTargets(raw: unknown): ScheduleTargetInput[] {
  const rows = Array.isArray(raw) ? raw : [];
  return rows.map((row: any) => {
    const sizeQtys: Record<string, number> = {};
    for (const [size, qty] of Object.entries(row?.size_qtys || {})) {
      const n = Number(qty);
      if (Number.isFinite(n) && n > 0) sizeQtys[String(size)] = Math.round(n);
    }
    return {
      id: row?.id ? String(row.id) : undefined,
      category: String(row?.category || "").trim(),
      fabric_type_id: row?.fabric_type_id || null,
      color: String(row?.color || "").trim() || null,
      series: String(row?.series || "").trim() || null,
      size_qtys: sizeQtys,
    };
  });
}

export async function GET(req: NextRequest) {
  const access = await ownerProductionGuard(req);
  if (!access.ok) return access.response;

  const sp = new URL(req.url).searchParams;
  const status = String(sp.get("status") || "").trim();
  const start = String(sp.get("start") || "").trim();
  const end = String(sp.get("end") || "").trim();

  const admin = getSupabaseAdmin();
  let query = admin
    .from("production_schedules")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);
  if (status) query = query.eq("status", status);
  if (start) query = query.gte("start_date", start);
  if (end) query = query.lte("start_date", end);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const schedules = data || [];
  const ids = schedules.map((row: any) => row.id);
  if (ids.length === 0) return NextResponse.json({ items: [] });

  const [{ data: targetRows }, components, { data: allRequirements }] = await Promise.all([
    admin
      .from("production_schedule_targets")
      .select("*, jenis_kain(name)")
      .in("schedule_id", ids)
      .order("sort_order", { ascending: true }),
    loadScheduleComponents(admin),
    admin
      .from("production_schedule_requirements")
      .select("schedule_id, component_id, component_code, component_name, unit_use, required_qty")
      .in("schedule_id", ids),
  ]);

  const targetsBySchedule = new Map<string, any[]>();
  for (const row of targetRows || []) {
    const list = targetsBySchedule.get(row.schedule_id) || [];
    list.push({ ...row, fabric_type_name: row.jenis_kain?.name || "" });
    targetsBySchedule.set(row.schedule_id, list);
  }

  const requirementsBySchedule = new Map<string, any[]>();
  for (const row of allRequirements || []) {
    const list = requirementsBySchedule.get(row.schedule_id) || [];
    list.push(row);
    requirementsBySchedule.set(row.schedule_id, list);
  }

  // Reservasi aktif dari SEMUA jadwal Disetujui.
  const { data: approvedRows } = await admin
    .from("production_schedules")
    .select("id")
    .eq("status", "disetujui");
  const approvedIds = (approvedRows || []).map((row: any) => row.id);
  const { data: approvedRequirements } = approvedIds.length
    ? await admin
        .from("production_schedule_requirements")
        .select("schedule_id, component_id, required_qty")
        .in("schedule_id", approvedIds)
    : { data: [] as any[] };
  const reservedTotal = new Map<string, number>();
  for (const row of approvedRequirements || []) {
    const id = String(row.component_id);
    reservedTotal.set(id, (reservedTotal.get(id) || 0) + (Number(row.required_qty) || 0));
  }

  const recipeMap = await loadRecipeMap(
    admin,
    (targetRows || []).map((row: any) => row.category),
  );

  const items = schedules.map((schedule: any) => {
    const targets = mapTargets(targetsBySchedule.get(schedule.id) || []);
    let requirements: any[] = [];
    let warnings: string[] = [];

    if (["disetujui", "berjalan", "selesai"].includes(schedule.status)) {
      requirements = groupRequirements(
        (requirementsBySchedule.get(schedule.id) || []).map((row) => ({
          ...row,
          required_qty: Number(row.required_qty) || 0,
        })),
      );
    } else if (schedule.status === "draft") {
      const computed = computeScheduleRequirements(targets, recipeMap, components);
      requirements = groupRequirements(computed.rows);
      warnings = computed.warnings;
    }

    const ownReserved = new Map<string, number>();
    if (schedule.status === "disetujui") {
      for (const row of requirements) ownReserved.set(row.component_id, row.required_qty);
    }

    let shortage = 0;
    for (const requirement of requirements) {
      const component = components.get(requirement.component_id);
      const stock = component?.stock || 0;
      const reservedOther = (reservedTotal.get(requirement.component_id) || 0) - (ownReserved.get(requirement.component_id) || 0);
      const available = stock - reservedOther;
      if (available < requirement.required_qty) shortage += 1;
    }

    return {
      id: schedule.id,
      schedule_number: schedule.schedule_number,
      status: schedule.status,
      start_date: schedule.start_date,
      target_date: schedule.target_date,
      tailor: schedule.tailor || "",
      total_pcs: Number(schedule.total_pcs) || 0,
      created_at: schedule.created_at,
      target_summary: targetSummary(targets),
      target_count: targets.length,
      sufficient: requirements.length > 0 && shortage === 0,
      shortage_count: shortage,
      warnings,
    };
  });

  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const access = await ownerProductionGuard(req);
  if (!access.ok) return access.response;

  try {
    const body = await req.json();
    const targets = cleanTargets(body?.targets);
    if (targets.length === 0) {
      return NextResponse.json({ error: "Minimal satu baris target." }, { status: 400 });
    }
    if (targets.some((target) => targetTotalPcs(target) <= 0)) {
      return NextResponse.json({ error: "Setiap baris target harus punya jumlah lebih dari 0." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc("production_save_schedule", {
      p_id: body?.id ? String(body.id) : null,
      p_header: {
        start_date: String(body?.start_date || "").trim(),
        target_date: String(body?.target_date || "").trim() || null,
        tailor: String(body?.tailor || "").trim() || null,
        notes: String(body?.notes || "").trim() || null,
      },
      p_targets: targets.map((target) => ({
        category: target.category,
        fabric_type_id: target.fabric_type_id,
        color: target.color,
        series: target.series,
        size_qtys: target.size_qtys,
      })),
      p_actor: access.email,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ item: data }, { status: 201 });
  } catch (e) {
    console.error("[PRODUKSI] jadwal POST:", e);
    return NextResponse.json({ error: "Gagal menyimpan jadwal." }, { status: 500 });
  }
}
