/**
 * Pengaturan reseller di `store_settings` (baris tunggal id = 1):
 * biaya admin penarikan non-BSI dan rekening BSI tujuan top up.
 * Angka yang bisa berubah diambil dari sini, tidak pernah hardcode.
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const DEFAULT_ADMIN_FEE_NON_BSI = 2500;

export interface ResellerSettingsValue {
  adminFeeNonBsi: number;
  bsiBankName: string;
  bsiAccountNumber: string;
  bsiAccountHolder: string;
  /** Gambar QRIS untuk top up & bayar kekurangan di portal reseller (null = belum diatur). */
  qrisImageUrl: string | null;
}

/** Baris pengaturan reseller; nilai default dipakai kalau tabel/kolom belum ada. */
export async function getResellerSettings(): Promise<ResellerSettingsValue> {
  try {
    const { data } = await getSupabaseAdmin()
      .from("store_settings")
      .select(
        "reseller_admin_fee_non_bsi, reseller_bsi_bank_name, reseller_bsi_account_number, reseller_bsi_account_holder, reseller_qris_image_url"
      )
      .eq("id", 1)
      .maybeSingle();

    const row = (data ?? {}) as Record<string, unknown>;
    return {
      adminFeeNonBsi: Math.max(0, Number(row.reseller_admin_fee_non_bsi ?? DEFAULT_ADMIN_FEE_NON_BSI) || 0),
      bsiBankName: String(row.reseller_bsi_bank_name ?? "Bank Syariah Indonesia (BSI)").trim(),
      bsiAccountNumber: String(row.reseller_bsi_account_number ?? "").trim(),
      bsiAccountHolder: String(row.reseller_bsi_account_holder ?? "").trim(),
      qrisImageUrl: String(row.reseller_qris_image_url ?? "").trim() || null,
    };
  } catch (e) {
    console.error("[RESELLER] Gagal membaca pengaturan reseller:", e);
    return {
      adminFeeNonBsi: DEFAULT_ADMIN_FEE_NON_BSI,
      bsiBankName: "Bank Syariah Indonesia (BSI)",
      bsiAccountNumber: "",
      bsiAccountHolder: "",
      qrisImageUrl: null,
    };
  }
}

/** Apakah nama bank dianggap BSI (penarikan bebas biaya admin)? */
export function isBsiBank(bankName?: string | null): boolean {
  const name = String(bankName || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  return name.includes("bsi") || name.includes("banksyariahindonesia");
}

/** Biaya admin penarikan: 0 kalau BSI, selain itu nilai pengaturan. */
export async function withdrawalAdminFee(isBsi: boolean): Promise<number> {
  if (isBsi) return 0;
  const settings = await getResellerSettings();
  return settings.adminFeeNonBsi;
}
