import type { SupabaseClient } from "@supabase/supabase-js";
import { computeStandardCost } from "@/lib/produksi-finished";
import {
  lineMatchesTarget,
  type ScheduleTargetInput,
} from "@/lib/produksi-jadwal";
import { loadRecipeMap, loadScheduleComponents } from "@/lib/produksi-jadwal-server";

const norm = (value: unknown) => String(value ?? "").trim().toLowerCase();
const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;
const round4 = (value: number) => Math.round((Number(value) || 0) * 10000) / 10000;

type OrderItemRow = {
  id: string;
  product_id: string;
  product_name: string;
  color: string | null;
  size: string | null;
  quantity: number;
};

export type PackagingLine = {
  component_id: string;
  component_code: string;
  component_name: string;
  unit_use: string;
  qty: number;
  stock: number;
  real_price: number;
  kind: "packaging" | "cover_hanger";
};

/**
 * Snapshot HPP barang jadi per baris order. Dipanggil sekali saat order dibuat.
 * Sumber: production_finished_hpp (aktual) → fallback HPP standar resep → none.
 */
export async function snapshotOrderHpp(admin: SupabaseClient, orderId: string): Promise<void> {
  const { data: existing } = await admin
    .from("production_order_hpp")
    .select("order_id")
    .eq("order_id", orderId)
    .maybeSingle();
  if (existing) return;

  const { data: itemRows } = await admin
    .from("order_items")
    .select("id, product_id, product_name, color, size, quantity")
    .eq("order_id", orderId);
  const items: OrderItemRow[] = (itemRows || [])
    .map((row: any) => ({
      id: String(row.id),
      product_id: String(row.product_id || ""),
      product_name: String(row.product_name || ""),
      color: String(row.color || "default"),
      size: String(row.size || "").toUpperCase(),
      quantity: Number(row.quantity) || 0,
    }))
    .filter((row) => row.product_id && row.size && row.quantity > 0);
  if (items.length === 0) return;

  const productIds = Array.from(new Set(items.map((item) => item.product_id)));
  const { data: products } = await admin
    .from("products")
    .select("id, category, series, jenis_kain_id")
    .in("id", productIds);
  const productById = new Map((products || []).map((row: any) => [String(row.id), row]));

  // HPP dicari pada PRODUK SERIES yang benar-benar dibeli, bukan produk induk
  // tempat stok menumpang. Stok tetap mengikuti `base_product_id` di jalur stok.
  const { data: finishedHppRows } = productIds.length
    ? await admin
        .from("production_finished_hpp")
        .select("product_id, color, size, hpp_avg")
        .in("product_id", productIds)
    : { data: [] as any[] };
  const finishedByKey = new Map(
    (finishedHppRows || []).map((row: any) => [
      `${row.product_id}|${norm(row.color)}|${norm(row.size)}`,
      Number(row.hpp_avg) || 0,
    ]),
  );

  const categories = Array.from(
    new Set(items.map((item) => String(productById.get(item.product_id)?.category || "")).filter(Boolean)),
  );
  const [recipeMap, components] = await Promise.all([
    loadRecipeMap(admin, categories),
    loadScheduleComponents(admin),
  ]);

  let hppGoods = 0;
  const snapshotItems = items.map((item) => {
    const product = productById.get(item.product_id);
    const category = String(product?.category || "");
    const actual = finishedByKey.get(
      `${item.product_id}|${norm(item.color)}|${norm(item.size)}`,
    );
    let hppUnit: number | null = actual != null ? round2(actual) : null;
    let source: "aktual" | "standar" | "none" = actual != null ? "aktual" : "none";
    let hppWarning: string | null = null;

    if (hppUnit == null && category && recipeMap.has(category)) {
      const sizeKey = String(item.size || "").toUpperCase();
      const sizeQtys: Record<string, number> = {};
      sizeQtys[sizeKey] = item.quantity;
      const target: ScheduleTargetInput = {
        id: item.id,
        category,
        fabric_type_id: product?.jenis_kain_id || null,
        color: item.color,
        series: product?.series || null,
        size_qtys: sizeQtys,
      };
      const standard = computeStandardCost(
        [target],
        new Map([[`${item.id}|${sizeKey}`, item.quantity]]),
        recipeMap,
        components,
      );
      if (standard.total > 0) {
        hppUnit = round2(standard.total / item.quantity);
        source = "standar";
      }
      hppWarning = standard.warnings[0] || null;
    }

    const hppTotal = hppUnit != null ? round2(hppUnit * item.quantity) : null;
    if (hppTotal != null) hppGoods += hppTotal;
    return {
      order_id: orderId,
      order_item_id: item.id,
      product_id: item.product_id,
      product_name: item.product_name,
      color: item.color,
      size: item.size,
      quantity: item.quantity,
      hpp_unit: hppUnit,
      hpp_total: hppTotal,
      source,
      hpp_warning: hppWarning,
    };
  });

  const { error: itemError } = await admin.from("production_order_hpp_items").insert(snapshotItems);
  if (itemError) throw new Error(itemError.message);

  const { error: headerError } = await admin.from("production_order_hpp").insert({
    order_id: orderId,
    hpp_goods: round2(hppGoods),
    packaging_cost: 0,
    total_hpp: round2(hppGoods),
    packaging_status: "belum",
  });
  if (headerError) {
    await admin.from("production_order_hpp_items").delete().eq("order_id", orderId);
    throw new Error(headerError.message);
  }
}

/** Hitung paket kemasan default dari resep aktif untuk satu order. */
export async function computeOrderPackaging(
  admin: SupabaseClient,
  orderId: string,
): Promise<{ items: PackagingLine[] }> {
  const { data: itemRows } = await admin
    .from("order_items")
    .select("id, product_id, product_name, color, size, quantity")
    .eq("order_id", orderId);
  const items: OrderItemRow[] = (itemRows || [])
    .map((row: any) => ({
      id: String(row.id),
      product_id: String(row.product_id || ""),
      product_name: String(row.product_name || ""),
      color: String(row.color || "default"),
      size: String(row.size || "").toUpperCase(),
      quantity: Number(row.quantity) || 0,
    }))
    .filter((row) => row.product_id && row.size && row.quantity > 0);

  if (items.length === 0) return { items: [] };

  const productIds = Array.from(new Set(items.map((item) => item.product_id)));
  const [{ data: products }, components] = await Promise.all([
    admin.from("products").select("id, category, series, jenis_kain_id").in("id", productIds),
    loadScheduleComponents(admin),
  ]);
  const productById = new Map((products || []).map((row: any) => [String(row.id), row]));
  const categories = Array.from(
    new Set((products || []).map((row: any) => String(row.category || "")).filter(Boolean)),
  );
  const recipeMap = await loadRecipeMap(admin, categories);

  const packaging = new Map<string, PackagingLine>();

  for (const item of items) {
    const product = productById.get(item.product_id);
    const category = String(product?.category || "");
    const recipe = recipeMap.get(category);
    if (!recipe) continue;

    const sizeKey = String(item.size || "").toUpperCase();
    const sizeQtys: Record<string, number> = {};
    sizeQtys[sizeKey] = item.quantity;
    const target: ScheduleTargetInput = {
      id: item.id,
      category,
      fabric_type_id: product?.jenis_kain_id || null,
      color: item.color,
      series: product?.series || null,
      size_qtys: sizeQtys,
    };

    for (const line of recipe.lines) {
      if (!line.component_id) continue;
      // Cover & Hanger adalah produk dengan stok sendiri. Kelompok
      // `tambahan_opsional` hanya untuk estimasi kalkulator/matriks, tidak
      // pernah dipotong sebagai komponen kemasan pesanan.
      if (line.group_code !== "packaging_pesanan") continue;
      if (!lineMatchesTarget(line, target, sizeKey)) continue;

      const component = components.get(String(line.component_id));
      if (!component) continue;
      const qty = round4((Number(line.qty_per_pcs) || 0) * item.quantity);
      if (qty <= 0) continue;

      const key = String(line.component_id);
      const current = packaging.get(key);
      if (current) {
        current.qty = round4(current.qty + qty);
      } else {
        packaging.set(key, {
          component_id: key,
          component_code: component.code,
          component_name: component.name,
          unit_use: component.unit_use,
          qty,
          stock: Number(component.stock) || 0,
          real_price: Number(component.real_price) || 0,
          kind: "packaging",
        });
      }
    }
  }

  return { items: Array.from(packaging.values()) };
}

export function packagingItemsForRpc(
  available: PackagingLine[],
  overrides: unknown,
): { component_id: string; qty: number }[] {
  const byId = new Map(available.map((row) => [row.component_id, row]));
  if (overrides === undefined || overrides === null) {
    return available.map((row) => ({ component_id: row.component_id, qty: row.qty }));
  }
  if (!Array.isArray(overrides)) {
    return available.map((row) => ({ component_id: row.component_id, qty: row.qty }));
  }
  if (overrides.length === 0) return [];
  const result: { component_id: string; qty: number }[] = [];
  for (const raw of overrides as any[]) {
    const id = String(raw?.component_id || "");
    const row = byId.get(id);
    if (!row) continue;
    const qty = Number(raw?.qty);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    result.push({ component_id: id, qty: round4(qty) });
  }
  return result;
}
