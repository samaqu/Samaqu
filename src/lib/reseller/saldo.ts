/**
 * Saldo reseller — selalu lewat RPC `samaqu_reseller_saldo` (tahap 1),
 * tidak ada versi perhitungan kedua di kode.
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { ResellerBalance } from "./types";

export async function getResellerBalance(resellerId: string): Promise<ResellerBalance | null> {
  try {
    const { data, error } = await getSupabaseAdmin().rpc("samaqu_reseller_saldo", {
      p_reseller_id: resellerId,
    });
    if (error || !data) {
      console.error("[RESELLER] Gagal membaca saldo:", error?.message);
      return null;
    }
    return data as unknown as ResellerBalance;
  } catch (e) {
    console.error("[RESELLER] Gagal membaca saldo:", e);
    return null;
  }
}
