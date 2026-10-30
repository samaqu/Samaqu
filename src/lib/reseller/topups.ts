/**
 * Siklus status top up reseller (alur 3 langkah).
 *
 *   menunggu_bayar → (upload bukti) → pending → (admin) → approved / rejected
 *   menunggu_bayar → (lewat batas waktu) → kedaluwarsa   (tanpa mutasi saldo)
 *   menunggu_bayar → (reseller batalkan) → dibatalkan    (tanpa mutasi saldo)
 *
 * Hanya status `pending` (bukti sudah diupload) yang masuk antrean admin dan
 * dihitung "top up belum dikonfirmasi". Saldo & ledger tidak disentuh di modul
 * ini — perubahan saldo tetap lewat RPC saat admin mengonfirmasi.
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const TOPUP_PAY_WINDOW_MINUTES = 60;

/** Batas waktu bayar (ISO) untuk top up baru. */
export function topupDeadlineIso(from: Date = new Date()): string {
  return new Date(from.getTime() + TOPUP_PAY_WINDOW_MINUTES * 60_000).toISOString();
}

/** true kalau batas waktu sudah lewat (null = tidak pernah kedaluwarsa). */
export function isPastDeadline(deadline: string | null | undefined, now = Date.now()): boolean {
  if (!deadline) return false;
  return new Date(deadline).getTime() <= now;
}

/**
 * Tandai top up `menunggu_bayar` yang lewat batas waktu sebagai `kedaluwarsa`.
 * Dipanggil saat data dibaca (list/detail) — tidak ada saldo yang berubah.
 */
export async function expireOverdueTopups(resellerId: string): Promise<void> {
  try {
    const { error } = await getSupabaseAdmin()
      .from("reseller_topups")
      .update({ status: "kedaluwarsa" })
      .eq("reseller_id", resellerId)
      .eq("status", "menunggu_bayar")
      .lt("pay_deadline", new Date().toISOString());
    if (error) console.error("[RESELLER-TOPUP] Gagal menandai kedaluwarsa:", error.message);
  } catch (e) {
    console.error("[RESELLER-TOPUP] Gagal menandai kedaluwarsa:", e);
  }
}
