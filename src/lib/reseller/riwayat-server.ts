/**
 * Pemuat data Riwayat Pesanan reseller — HANYA SELECT (tidak menulis apa pun).
 * Dipakai route admin `GET /api/ops/reseller/riwayat` (tabel + kartu + CSV).
 *
 * Seluruh hasil filter dibaca (per 1000 baris) lalu tahap, filter status, ringkasan, dan paginasi
 * dihitung di sini dengan fungsi murni `riwayat.ts`: tahap pesanan diturunkan dari beberapa kolom
 * (`orderStage`), jadi tidak bisa difilter murni di SQL. Volume pesanan reseller kecil.
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  dateBounds,
  summarize,
  toRiwayatOrder,
  type RiwayatFilters,
  type RiwayatOrder,
  type RiwayatOrderSource,
  type RiwayatSummary,
} from "./riwayat";

const CHUNK = 1000;
/** Batas pengaman: 20.000 pesanan reseller per permintaan. */
const MAX_CHUNKS = 20;

const ORDER_COLUMNS =
  "id, order_number, created_at, status, shipping_status, tracking_status_code, awb_no, is_preorder, preorder_ready_at, shipping_cost, customer_name, reseller_id, order_items(id, product_name, series, kain, color, size, quantity, reseller_buy_price, price)";

export interface RiwayatResult {
  /** Semua pesanan yang cocok filter (terbaru di atas), termasuk yang dibatalkan. */
  orders: RiwayatOrder[];
  summary: RiwayatSummary;
}

export async function loadRiwayat(filters: RiwayatFilters): Promise<RiwayatResult> {
  const supabase = getSupabaseAdmin();
  const { gte, lt } = dateBounds(filters);

  const rows: RiwayatOrderSource[] = [];
  for (let chunk = 0; chunk < MAX_CHUNKS; chunk++) {
    let query = supabase
      .from("orders")
      .select(ORDER_COLUMNS)
      .not("reseller_id", "is", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(chunk * CHUNK, chunk * CHUNK + CHUNK - 1);

    if (filters.reseller_id) query = query.eq("reseller_id", filters.reseller_id);
    if (gte) query = query.gte("created_at", gte);
    if (lt) query = query.lt("created_at", lt);
    if (filters.q) {
      const needle = `%${filters.q}%`;
      query = query.or(`order_number.ilike.${needle},awb_no.ilike.${needle},customer_name.ilike.${needle}`);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as unknown as RiwayatOrderSource[];
    rows.push(...batch);
    if (batch.length < CHUNK) break;
  }

  // Nama reseller: query terpisah (tidak bergantung pada relasi embed).
  const ids = [...new Set(rows.map((row) => String(row.reseller_id)))];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data, error } = await supabase.from("resellers").select("id, store_name").in("id", ids);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) names.set(String(row.id), String(row.store_name || ""));
  }

  let orders = rows.map((row) => toRiwayatOrder(row, names.get(String(row.reseller_id)) || "—"));
  if (filters.status) orders = orders.filter((order) => order.stage === filters.status);

  return { orders, summary: summarize(orders) };
}
