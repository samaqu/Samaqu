/**
 * Level reseller di sisi server untuk panel admin: satu query pesanan 90 hari terakhir untuk
 * SEMUA reseller yang diminta, lalu aturan yang sama dengan portal reseller (`level.ts`).
 * Gagal membaca = peta kosong (kolom/drawer level disembunyikan, bukan membuat halaman error).
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { LEVEL_WINDOW_DAYS, bulanDihitung, hitungLevel, type LevelSummary } from "./level";

export async function levelsForResellers(
  resellers: { id: string; created_at?: string | null }[]
): Promise<Map<string, LevelSummary>> {
  const result = new Map<string, LevelSummary>();
  if (resellers.length === 0) return result;

  const now = new Date();
  const windowStart = new Date(now.getTime() - LEVEL_WINDOW_DAYS * 24 * 3600 * 1000);

  const { data, error } = await getSupabaseAdmin()
    .from("orders")
    .select("reseller_id, status, order_items(quantity, price)")
    .in(
      "reseller_id",
      resellers.map((row) => row.id)
    )
    .gte("created_at", windowStart.toISOString());

  if (error) {
    console.error("[OPS-RESELLER] Gagal membaca pesanan untuk level:", error.message);
    return result;
  }

  const belanja = new Map<string, number>();
  for (const order of data ?? []) {
    if (order.status === "dibatalkan") continue;
    const key = String(order.reseller_id);
    const items = (order.order_items ?? []) as Array<{ quantity: number | null; price: number | null }>;
    let total = 0;
    for (const item of items) total += (Number(item.price) || 0) * (Number(item.quantity) || 0);
    belanja.set(key, (belanja.get(key) ?? 0) + total);
  }

  for (const row of resellers) {
    result.set(row.id, hitungLevel(belanja.get(row.id) ?? 0, bulanDihitung(row.created_at, now)));
  }
  return result;
}
