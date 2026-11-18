/**
 * Pembantu route admin "Buat Pesanan atas nama reseller": memuat reseller yang BOLEH dipesankan
 * (hanya status Aktif) — aturan yang sama dengan fungsi database (`Akun reseller tidak aktif`).
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { ResellerRow } from "./types";

export type ActiveResellerResult =
  | { ok: true; reseller: ResellerRow }
  | { ok: false; error: string; status: number };

export async function loadActiveReseller(resellerId: string): Promise<ActiveResellerResult> {
  const id = String(resellerId || "").trim();
  if (!id) return { ok: false, error: "Pilih reseller dulu.", status: 400 };

  const { data, error } = await getSupabaseAdmin().from("resellers").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error("[OPS-RESELLER-ORDER] Gagal membaca reseller:", error.message);
    return { ok: false, error: "Gagal membaca data reseller.", status: 500 };
  }
  if (!data) return { ok: false, error: "Reseller tidak ditemukan.", status: 404 };
  if ((data as ResellerRow).status !== "active") {
    return { ok: false, error: "Hanya reseller berstatus Aktif yang bisa dibuatkan pesanan.", status: 400 };
  }
  return { ok: true, reseller: data as ResellerRow };
}
