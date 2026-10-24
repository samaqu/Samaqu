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
  const [{ data: products }, { data: variants }] = await Promise.all([
    admin.from("products").select("id, category, series, jenis_kain_id").in("id", productIds),
    admin.from("product_variants").select("product_id, color, size, base_product_id, base_size").in("product_id", productIds),
  ]);
  const productById = new Map((products || []).map((row: any) => [String(row.id), row]));
  const variantByKey = new Map(
    (variants || []).map((row: any) => [
      `${row.product_id}|${norm(row.color)}|${norm(row.size)}`,
      row,
    ]),
  );

  const resolved = items.map((item) => {
    const variant = variantByKey.get(`${item.product_id}|${norm(item.color)}|${norm(item.size)}`);
    return {
      item,
      baseProductId: String(variant?.base_product_id || item.product_id),
      baseSize: String(variant?.base_size || item.size).toUpperCase(),
      product: productById.get(item.product_id),
    };
  });

  const baseIds = Array.from(new Set(resolved.map((row) => row.baseProductId)));
  const { data: finishedHppRows } = baseIds.length
    ? await admin
        .from("production_finished_hpp")
        .select("product_id, color, size, hpp_avg")
        .in("product_id", baseIds)
    : { data: [] as any[] };
  const finishedByKey = new Map(
    (finishedHppRows || []).map((row: any) => [
      `${row.product_id}|${norm(row.color)}|${norm(row.size)}`,
      Number(row.hpp_avg) || 0,
    ]),
  );

  const categories = Array.from(
    new Set(resolved.map((row) => String(row.product?.category || "")).filter(Boolean)),
  );
  const [recipeMap, components] = await Promise.all([
    loadRecipeMap(admin, categories),
    loadScheduleComponents(admin),
  ]);

  let hppGoods = 0;
  const snapshotItems = resolved.map(({ item, baseProductId, baseSize, product }) => {
    const category = String(product?.category || "");
    const actual = finishedByKey.get(`${baseProductId}|${norm(item.color)}|${norm(baseSize)}`);
    let hppUnit: number | null = actual != null ? round2(actual) : null;
    let source: "aktual" | "standar" | "none" = actual != null ? "aktual" : "none";

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
  useCoverOverride?: boolean | null,
  includeAllCover = false,
): Promise<{
  items: PackagingLine[];
  has_cover_hanger: boolean;
  use_cover_hanger: boolean;
}> {
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

  if (items.length === 0) return { items: [], has_cover_hanger: false, use_cover_hanger: false };

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
  let hasCover = false;

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
      const isPackaging = line.group_code === "packaging_pesanan";
      const isCoverLine =
        line.group_code === "tambahan_opsional" &&
        /cover|hanger/i.test(String(line.name || ""));
      if (!isPackaging && !isCoverLine) continue;
      if (!lineMatchesTarget(line, target, sizeKey)) continue;
      if (isCoverLine) hasCover = true;

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
          kind: isCoverLine ? "cover_hanger" : "packaging",
        });
      }
    }
  }

  const useCover = useCoverOverride == null ? hasCover : Boolean(useCoverOverride);
  return {
    items: Array.from(packaging.values()).filter(
      (row) => includeAllCover || row.kind !== "cover_hanger" || useCover,
    ),
    has_cover_hanger: hasCover,
    use_cover_hanger: useCover,
  };
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
