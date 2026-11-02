import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { waLink } from "@/lib/whatsapp";
import { SQ_WA_MESSAGE } from "@/lib/campaign/sama-quran-content";

/**
 * Nomor WhatsApp CS untuk halaman kampanye Sama Quran.
 *
 * Sumber: `store_settings.whatsapp` (baris id = 1) — pengaturan global yang sama dengan
 * tombol bantuan admin & checkout, jadi nomornya cukup diubah dari dashboard.
 * `null` = nomor belum diisi; tombol WA dirender nonaktif, bukan `wa.me/` kosong.
 */
export async function loadCsWhatsappLink(): Promise<string | null> {
  try {
    const { data } = await getSupabaseAdmin()
      .from("store_settings")
      .select("whatsapp")
      .eq("id", 1)
      .maybeSingle();

    const raw = String((data as { whatsapp?: string | null } | null)?.whatsapp ?? "").trim();
    return raw ? waLink(raw, SQ_WA_MESSAGE) : null;
  } catch (error) {
    console.error("[SQ-CAMPAIGN] Gagal membaca nomor WhatsApp CS:", error);
    return null;
  }
}
