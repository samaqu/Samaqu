import type { SupabaseClient } from "@supabase/supabase-js";
import { categoryPrefix, stockStatus } from "@/lib/produksi";

const num = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** Kode komponen otomatis: KAIN-001, KOMP-007, dst. */
export async function nextComponentCode(
  admin: SupabaseClient,
  category: string,
): Promise<string> {
  const prefix = categoryPrefix(category);
  const { data } = await admin
    .from("production_components")
    .select("code")
    .like("code", `${prefix}-%`);
  let max = 0;
  for (const row of data || []) {
    const match = new RegExp(`^${prefix}-(\\d+)$`, "i").exec(String((row as any).code || ""));
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

/**
 * Bentuk komponen untuk klien.
 * `showPrices=false` (Leader) menghapus SEMUA angka harga/nilai dari payload,
 * bukan cuma menyembunyikannya di tabel.
 */
export function mapComponent(row: any, showPrices: boolean) {
  const stock = num(row?.stock);
  const minStock = num(row?.min_stock);
  const base: Record<string, unknown> = {
    id: row?.id,
    code: row?.code,
    name: row?.name,
    category: row?.category,
    unit_use: row?.unit_use,
    unit_buy: row?.unit_buy,
    conversion: num(row?.conversion),
    min_stock: minStock,
    supplier: row?.supplier || "",
    notes: row?.notes || "",
    fabric_type_id: row?.fabric_type_id || null,
    fabric_type_name: row?.fabric_type_name || "",
    is_active: row?.is_active !== false,
    stock,
    status: stockStatus(stock, minStock),
    created_at: row?.created_at || null,
    updated_at: row?.updated_at || null,
  };

  if (!showPrices) return base;

  const realPrice = num(row?.real_price);
  const safePrice = num(row?.safe_price);
  return {
    ...base,
    safe_price: safePrice,
    real_price: realPrice,
    last_buy_price: num(row?.last_buy_price),
    stock_value: Math.round(stock * realPrice),
    price_gap: Math.round(safePrice - realPrice),
  };
}

/** Bentuk satu pergerakan stok; harga disensor untuk Leader. */
export function mapMovement(row: any, showPrices: boolean) {
  const qty = num(row?.qty);
  const base: Record<string, unknown> = {
    id: row?.id,
    component_id: row?.component_id,
    component_code: row?.component_code || "",
    component_name: row?.component_name || "",
    unit_use: row?.unit_use || "",
    movement_date: row?.movement_date,
    type: row?.type,
    qty,
    ref_type: row?.ref_type || "",
    ref_id: row?.ref_id || null,
    notes: row?.notes || "",
    actor: row?.actor || "",
    created_at: row?.created_at,
    running_balance: row?.running_balance,
  };
  if (!showPrices) return base;
  const price = num(row?.unit_price);
  return {
    ...base,
    unit_price: price,
    value: Math.round(Math.abs(qty) * price),
  };
}
