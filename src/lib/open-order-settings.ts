import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { OpenOrderWindow } from "./open-order-window";

/**
 * Baca jendela Open Order dari `store_settings`.
 *
 * Kolom jam (`open_order_start_time` / `open_order_end_time`) **opsional** — dibuat lewat
 * `supabase/migrations/20261021_open_order_time.sql`. Selama SQL-nya belum dijalankan di
 * Supabase, `select` kolom itu akan error (42703) dan seluruh data window ikut hilang —
 * makanya di sini ada fallback: kalau kolom jam belum ada, query-nya diulang tanpa kolom
 * jam dan hasilnya tetap terpakai (jam kosong = mulai 00:00, tutup 23:59).
 */

export interface OpenOrderWindowRow extends OpenOrderWindow {
  /** `true` kalau kolom jam sudah tersedia di database. */
  hasTimeColumns: boolean;
}

const BASE_COLUMNS = "open_order_start_date, open_order_end_date, open_order_active";
const FULL_COLUMNS = `${BASE_COLUMNS}, open_order_start_time, open_order_end_time`;

type Row = Record<string, unknown>;

function toWindow(row: Row | null | undefined): OpenOrderWindow {
  return {
    open_order_start_date: (row?.open_order_start_date as string | null) ?? null,
    open_order_end_date: (row?.open_order_end_date as string | null) ?? null,
    open_order_start_time: (row?.open_order_start_time as string | null) ?? null,
    open_order_end_time: (row?.open_order_end_time as string | null) ?? null,
    open_order_active: (row?.open_order_active as boolean | null) ?? null,
  };
}

/**
 * Ambil jendela Open Order. `client` boleh Supabase anon (klien) atau admin (server).
 * Kalau kolom jam belum ada di database → fallback ke query tanpa kolom jam.
 */
export async function readOpenOrderWindow(client: SupabaseClient = supabase): Promise<OpenOrderWindowRow> {
  const withTime = await client.from("store_settings").select(FULL_COLUMNS).eq("id", 1).maybeSingle();
  if (!withTime.error && withTime.data) {
    return { ...toWindow(withTime.data as Row), hasTimeColumns: true };
  }

  // Kolom jam belum ada → ulangi query tanpa kolom jam supaya jendela tetap terbaca.
  const fallback = await client.from("store_settings").select(BASE_COLUMNS).eq("id", 1).maybeSingle();
  return { ...toWindow(fallback.data as Row | null), hasTimeColumns: false };
}
