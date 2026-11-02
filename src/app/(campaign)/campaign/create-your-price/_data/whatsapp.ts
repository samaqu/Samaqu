import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { waLink } from "@/lib/whatsapp";
import { CYP_WA_MESSAGE } from "@/lib/campaign/create-your-price-content";

/**
 * Nomor WhatsApp CS untuk halaman kampanye.
 *
 * Sumber: `store_settings.whatsapp` (baris id = 1) — pengaturan global yang sama dengan
 * tombol bantuan admin, jadi nomornya cukup diubah dari dashboard, tidak dari kode.
 * Pesan otomatisnya `CYP_WA_MESSAGE` (soal Create Your Price).
 *
 * `null` = nomor belum diisi; tombol WA dirender nonaktif, bukan mengarah ke `wa.me/` kosong.
 */
export async function loadCsWhatsappLink(): Promise<string | null> {
  try {
    const { data } = await getSupabaseAdmin()
      .from("store_settings")
      .select("whatsapp")
      .eq("id", 1)
      .maybeSingle();

    const raw = String((data as { whatsapp?: string | null } | null)?.whatsapp ?? "").trim();
    return raw ? waLink(raw, CYP_WA_MESSAGE) : null;
  } catch (error) {
    console.error("[CYP-CAMPAIGN] Gagal membaca nomor WhatsApp CS:", error);
    return null;
  }
}
