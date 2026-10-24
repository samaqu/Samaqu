import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ownerProductionGuard } from "@/lib/ops-auth";
import {
  computeStandardCost,
  resolveTargetVariant,
  suggestReceiptCosts,
  sumCosts,
  type ReceiptItemInput,
} from "@/lib/produksi-finished";
import {
  loadFinishedLookup,
  loadReceiptBundle,
  outstandingReworkMap,
} from "@/lib/produksi-finished-server";
import { loadRecipeMap, loadScheduleComponents, mapTargets } from "@/lib/produksi-jadwal-server";

/**
 * Terima hasil produksi + QC.
 * Stok barang jadi dipanggil lewat RPC yang sama dengan Barang Masuk
 * (`samaqu_stock_in_batch`, total_price = 0).
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const access = await ownerProductionGuard(req);
  if (!access.ok) return access.response;

  const { id } = await context.params;
  const admin = getSupabaseAdmin();

  try {
    const { data: schedule } = await admin
      .from("production_schedules")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!schedule) return NextResponse.json({ error: "Jadwal tidak ditemukan." }, { status: 404 });
    if (schedule.status !== "berjalan") {
      return NextResponse.json({ error: "Penerimaan hanya untuk jadwal Berjalan." }, { status: 400 });
    }

    const body = await req.json();
    const date = String(body?.date || "").trim();
    const notes = String(body?.notes || "").trim() || null;

    const [{ data: targetRows }, components, bundle, lookup] = await Promise.all([
      admin
        .from("production_schedule_targets")
        .select("*, jenis_kain(name)")
        .eq("schedule_id", id)
        .order("sort_order", { ascending: true }),
      loadScheduleComponents(admin),
      loadReceiptBundle(admin, id),
      loadFinishedLookup(admin),
    ]);
    const targets = mapTargets(
      (targetRows || []).map((row: any) => ({ ...row, fabric_type_name: row.jenis_kain?.name || "" })),
    );
    const targetById = new Map(targets.map((target) => [String(target.id || ""), target]));
    const outstanding = outstandingReworkMap(bundle.items);
    const recipeMap = await loadRecipeMap(admin, targets.map((target) => target.category));

    const rawItems = Array.isArray(body?.items) ? body.items : [];
    const items: (ReceiptItemInput & { reject_reason?: string | null; notes?: string | null })[] = [];

    for (let index = 0; index < rawItems.length; index += 1) {
      const raw = rawItems[index];
      const targetId = String(raw?.target_id || "");
      const size = String(raw?.size || "").trim().toUpperCase();
      const target = targetById.get(targetId);
      if (!target) {
        return NextResponse.json({ error: `Baris ${index + 1}: target bukan milik jadwal ini.` }, { status: 400 });
      }
      if (!size || !(size in (target.size_qtys || {}))) {
        return NextResponse.json({ error: `Baris ${index + 1}: ukuran tidak ada di target.` }, { status: 400 });
      }

      const int = (value: unknown) => {
        const n = Number(value);
        return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
      };
      const item: ReceiptItemInput & { reject_reason?: string | null; notes?: string | null } = {
        target_id: targetId,
        size,
        qty_lolos: int(raw?.qty_lolos),
        qty_rework: int(raw?.qty_rework),
        qty_reject: int(raw?.qty_reject),
        rework_to_lolos: int(raw?.rework_to_lolos),
        rework_to_reject: int(raw?.rework_to_reject),
        reject_reason: String(raw?.reject_reason || "").trim() || null,
        notes: String(raw?.notes || "").trim() || null,
      };

      if (item.qty_lolos + item.qty_rework + item.qty_reject + item.rework_to_lolos + item.rework_to_reject === 0) {
        continue;
      }
      if ((item.qty_reject > 0 || item.rework_to_reject > 0) && !item.reject_reason) {
        return NextResponse.json({ error: `Baris ${index + 1}: alasan reject wajib diisi.` }, { status: 400 });
      }
      const key = `${targetId}|${size}`;
      const availableRework = outstanding.get(key) || 0;
      if (item.rework_to_lolos + item.rework_to_reject > availableRework) {
        return NextResponse.json(
          { error: `Baris ${index + 1}: rework yang diselesaikan melebihi rework tersisa (${availableRework}).` },
          { status: 400 },
        );
      }

      items.push(item);
    }

    if (items.length === 0) {
      return NextResponse.json({ error: "Isi minimal satu hasil QC." }, { status: 400 });
    }

    // Resolusi varian untuk stok barang jadi (lolos + rework yang jadi lolos).
    const stockMap = new Map<string, { product_id: string; variant_color: string; variant_size: string; qty: number }>();
    const hppEntries: {
      product_id: string;
      color: string;
      size: string;
      qty: number;
      kind: "new" | "rework";
      targetKey: string;
    }[] = [];
    const resolveErrors: string[] = [];

    const reworkHppMap = new Map<string, { qty: number; value: number }>();
    const receiptById = new Map(bundle.receipts.map((receipt: any) => [String(receipt.id), receipt]));
    for (const prior of bundle.items) {
      const qty = Number(prior.qty_rework) || 0;
      if (qty <= 0) continue;
      const receipt = receiptById.get(String(prior.receipt_id));
      const key = `${prior.target_id}|${prior.size}`;
      const current = reworkHppMap.get(key) || { qty: 0, value: 0 };
      current.qty += qty;
      current.value += qty * (Number(receipt?.hpp_per_pcs) || 0);
      reworkHppMap.set(key, current);
    }

    for (const item of items) {
      const qty = item.qty_lolos + item.rework_to_lolos;
      if (qty <= 0) continue;
      const target = targetById.get(item.target_id);
      if (!target) continue;
      const resolved = resolveTargetVariant(target, item.size, lookup.products, lookup.variants);
      if (!resolved.ok) {
        resolveErrors.push(resolved.error);
        continue;
      }
      const row = resolved.row;
      const key = `${row.product_id}|${row.variant_color}|${row.variant_size}`;
      const existing = stockMap.get(key);
      if (existing) existing.qty += qty;
      else stockMap.set(key, { product_id: row.product_id, variant_color: row.variant_color, variant_size: row.variant_size, qty });

      const targetKey = `${item.target_id}|${item.size}`;
      if (item.qty_lolos > 0) {
        hppEntries.push({ product_id: row.product_id, color: row.variant_color, size: row.variant_size, qty: item.qty_lolos, kind: "new", targetKey });
      }
      if (item.rework_to_lolos > 0) {
        hppEntries.push({ product_id: row.product_id, color: row.variant_color, size: row.variant_size, qty: item.rework_to_lolos, kind: "rework", targetKey });
      }
    }
    if (resolveErrors.length > 0) {
      return NextResponse.json({ error: Array.from(new Set(resolveErrors)).join(" ") }, { status: 400 });
    }

    const stockItems = Array.from(stockMap.values()).map((row) => ({
      product_id: row.product_id,
      variant_color: row.variant_color,
      variant_size: row.variant_size,
      qty: row.qty,
      total_price: 0,
    }));

    // Biaya non-bahan: pakai kiriman Owner; kalau kosong, isi otomatis dari resep.
    const rawCosts = Array.isArray(body?.costs) ? body.costs : null;
    const costs = rawCosts
      ? rawCosts
          .map((row: any) => ({
            name: String(row?.name || "").trim(),
            group_label: String(row?.group_label || "").trim(),
            amount: Math.max(0, Number(row?.amount) || 0),
            source: "manual" as const,
          }))
          .filter((row: any) => row.name && row.amount >= 0)
      : suggestReceiptCosts(targets, items, recipeMap);
    const nonMaterialCost = sumCosts(costs.map((row: any) => ({ ...row, source: row.source || "recipe" })));

    // Biaya bahan aktual: biaya yang sudah dikeluarkan dialokasikan proporsional
    // terhadap jumlah yang diproses sampai penerimaan ini.
    const { data: issueMovements } = await admin
      .from("production_stock_movements")
      .select("qty, unit_price, type")
      .eq("ref_type", "production_schedule")
      .eq("ref_id", id)
      .in("type", ["keluar_produksi", "retur_sisa_bahan"]);

    const issuedCost = (issueMovements || []).reduce((sum: number, row: any) => {
      return sum + Math.abs(Number(row.qty) || 0) * (Number(row.unit_price) || 0);
    }, 0);
    const priorProcessed = (bundle.receipts || []).reduce(
      (sum: number, row: any) =>
        sum + (Number(row.total_lolos) || 0) + (Number(row.total_rework) || 0) + (Number(row.total_reject) || 0),
      0,
    );
    const currentProcessed = items.reduce(
      (sum, row) => sum + row.qty_lolos + row.qty_rework + row.qty_reject,
      0,
    );
    const totalProcessed = priorProcessed + currentProcessed;
    const materialCost = totalProcessed > 0 ? (issuedCost * currentProcessed) / totalProcessed : 0;

    const newLolos = items.reduce((sum, row) => sum + row.qty_lolos, 0);
    const totalCost = materialCost + nonMaterialCost;
    const hppPerPcs = newLolos > 0 ? totalCost / newLolos : 0;

    const processedMap = new Map<string, number>();
    for (const item of items) {
      const key = `${item.target_id}|${item.size}`;
      processedMap.set(
        key,
        (processedMap.get(key) || 0) + item.qty_lolos + item.qty_rework + item.qty_reject,
      );
    }
    const standardCost = computeStandardCost(targets, processedMap, recipeMap, components);
    const hppStandard = newLolos > 0 ? standardCost.total / newLolos : 0;

    const hppItems = hppEntries.map((entry) => {
      const rework = reworkHppMap.get(entry.targetKey);
      const reworkHpp = rework && rework.qty > 0 ? rework.value / rework.qty : 0;
      const value =
        entry.kind === "new"
          ? hppPerPcs
          : reworkHpp > 0
            ? reworkHpp
            : hppPerPcs;
      return {
        product_id: entry.product_id,
        color: entry.color,
        size: entry.size,
        qty: entry.qty,
        hpp_per_pcs: Math.round(value * 100) / 100,
      };
    });

    const { data, error } = await admin.rpc("production_save_receipt", {
      p_schedule_id: id,
      p_payload: {
        request_id: randomUUID(),
        date: date || null,
        notes,
        items: items.map((item) => ({
          target_id: item.target_id,
          size: item.size,
          qty_lolos: item.qty_lolos,
          qty_rework: item.qty_rework,
          qty_reject: item.qty_reject,
          rework_to_lolos: item.rework_to_lolos,
          rework_to_reject: item.rework_to_reject,
          reject_reason: item.reject_reason,
          notes: item.notes,
        })),
        costs,
        stock_items: stockItems,
        hpp_items: hppItems,
        material_cost: Math.round(materialCost * 100) / 100,
        non_material_cost: Math.round(nonMaterialCost * 100) / 100,
        total_cost: Math.round(totalCost * 100) / 100,
        hpp_per_pcs: Math.round(hppPerPcs * 100) / 100,
        hpp_standard: Math.round(hppStandard * 100) / 100,
      },
      p_actor: access.email,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ result: data }, { status: 201 });
  } catch (e) {
    console.error("[PRODUKSI] penerimaan:", e);
    return NextResponse.json({ error: "Gagal menyimpan penerimaan hasil." }, { status: 500 });
  }
}
