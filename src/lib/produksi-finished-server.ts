import type { SupabaseClient } from "@supabase/supabase-js";
import type { FinishedProduct, FinishedVariant } from "@/lib/produksi-finished";

const num = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export type ReceiptBundle = {
  receipts: any[];
  items: any[];
  costs: any[];
};

export async function loadFinishedLookup(admin: SupabaseClient): Promise<{
  products: FinishedProduct[];
  variants: FinishedVariant[];
}> {
  const [{ data: products }, { data: variants }] = await Promise.all([
    admin.from("products").select("id, name, category, series, jenis_kain_id, colors"),
    admin.from("product_variants").select("product_id, color, size, base_product_id, base_size"),
  ]);

  return {
    products: (products || []).map((row: any) => ({
      id: String(row.id),
      name: String(row.name || ""),
      category: String(row.category || ""),
      series: String(row.series || ""),
      jenis_kain_id: row.jenis_kain_id || null,
      colors: Array.isArray(row.colors) ? row.colors.map((color: unknown) => String(color)) : [],
    })),
    variants: (variants || []).map((row: any) => ({
      product_id: String(row.product_id),
      color: String(row.color || "default"),
      size: String(row.size || ""),
      base_product_id: row.base_product_id || null,
      base_size: row.base_size || null,
    })),
  };
}

export async function loadReceiptBundle(admin: SupabaseClient, scheduleId: string): Promise<ReceiptBundle> {
  const { data: receipts } = await admin
    .from("production_receipts")
    .select("*")
    .eq("schedule_id", scheduleId)
    .order("received_date", { ascending: true })
    .order("created_at", { ascending: true });

  const ids = (receipts || []).map((row: any) => row.id);
  if (ids.length === 0) return { receipts: [], items: [], costs: [] };

  const [{ data: items }, { data: costs }] = await Promise.all([
    admin.from("production_receipt_items").select("*").in("receipt_id", ids),
    admin.from("production_receipt_costs").select("*").in("receipt_id", ids).order("sort_order", { ascending: true }),
  ]);

  return {
    receipts: receipts || [],
    items: (items || []).map((row: any) => ({
      ...row,
      qty_lolos: num(row.qty_lolos),
      qty_rework: num(row.qty_rework),
      qty_reject: num(row.qty_reject),
      rework_to_lolos: num(row.rework_to_lolos),
      rework_to_reject: num(row.rework_to_reject),
    })),
    costs: (costs || []).map((row: any) => ({ ...row, amount: num(row.amount) })),
  };
}

/** Sisa rework per "target_id|size". */
export function outstandingReworkMap(items: any[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items || []) {
    const key = `${item.target_id}|${item.size}`;
    const value =
      (map.get(key) || 0) +
      num(item.qty_rework) -
      num(item.rework_to_lolos) -
      num(item.rework_to_reject);
    map.set(key, Math.max(0, Math.round(value)));
  }
  return map;
}

/** Jumlah diproses (lolos + rework + reject baru) per target/ukuran. */
export function processedByTargetSize(items: any[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items || []) {
    const key = `${item.target_id}|${item.size}`;
    map.set(
      key,
      (map.get(key) || 0) +
        num(item.qty_lolos) +
        num(item.qty_rework) +
        num(item.qty_reject),
    );
  }
  return map;
}

export function receiptTotals(receipts: any[]) {
  return (receipts || []).reduce(
    (acc, row) => ({
      lolos: acc.lolos + num(row.total_lolos),
      rework: acc.rework + num(row.total_rework),
      reject: acc.reject + num(row.total_reject),
      resolvedLolos: acc.resolvedLolos + num(row.rework_to_lolos),
      resolvedReject: acc.resolvedReject + num(row.rework_to_reject),
      material: acc.material + num(row.material_cost),
      nonMaterial: acc.nonMaterial + num(row.non_material_cost),
      totalCost: acc.totalCost + num(row.total_cost),
    }),
    { lolos: 0, rework: 0, reject: 0, resolvedLolos: 0, resolvedReject: 0, material: 0, nonMaterial: 0, totalCost: 0 },
  );
}
