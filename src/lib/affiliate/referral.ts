import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAffiliateSettings } from "./settings";

/**
 * Atribusi referral.
 *
 * Alur:
 *   1. Pengunjung membuka `/r/<kode>` â†’ route itu mencatat klik & Sets cookie `sq_ref`.
 *   2. Saat checkout, route `/api/orders` (dan `/api/open-order`) membaca cookie itu
 *      di sisi SERVER dan memvalidasi ulang kodenya ke tabel `affiliate_links` /
 *      `affiliates`. Nilai dari browser TIDAK pernah dipercaya apa adanya.
 *   3. Hasil validasi disimpan permanen di baris `orders` (affiliate_id, referral_code,
 *      referral_attributed_at) supaya tetap bisa diaudit walau cookie dihapus.
 *
 * Atribusi first-click vs last-click mengikuti `affiliate_settings.attribution_model`:
 *   - last_click (default): klik terakhir yang menimpa cookie.
 *   - first_click: klik pertama yang masih berlaku (cookie lama tidak ditimpa).
 */

export const REF_COOKIE = "sq_ref";

export interface ResolvedReferral {
  affiliateId: string;
  linkId: string | null;
  code: string;
  productId: string | null;
}

/** Validasi kode referral ke database. Null kalau kode tidak dikenal / affiliate tidak aktif. */
export async function resolveReferralCode(
  supabase: SupabaseClient,
  rawCode: string | null | undefined,
): Promise<ResolvedReferral | null> {
  const code = String(rawCode || "").trim();
  if (!code || code.length > 64) return null;

  const { data: link } = await supabase
    .from("affiliate_links")
    .select("id, affiliate_id, is_active, product_id")
    .eq("code", code)
    .maybeSingle();

  let affiliateId = link?.affiliate_id ?? null;
  let linkId = link?.id ?? null;

  if (!affiliateId) {
    // Kode utama affiliate (SAM-AF-xxxxx) juga boleh dipakai sebagai link referral.
    const { data: affiliate } = await supabase
      .from("affiliates")
      .select("id, status")
      .eq("affiliate_code", code)
      .maybeSingle();
    if (!affiliate) return null;
    affiliateId = affiliate.id;
  } else if (link && link.is_active === false) {
    return null;
  }

  const { data: affiliate } = await supabase
    .from("affiliates")
    .select("id, status")
    .eq("id", affiliateId)
    .maybeSingle();

  if (!affiliate || affiliate.status !== "aktif") return null;

  return { affiliateId, linkId, code, productId: link?.product_id ?? null };
}

/** Baca kode referral dari request (cookie dulu, lalu fallback body). */
export function referralCodeFromRequest(req: NextRequest, bodyCode?: string | null): string | null {
  const cookieCode = req.cookies.get(REF_COOKIE)?.value;
  const code = String(cookieCode || bodyCode || "").trim();
  return code || null;
}

/**
 * Resolusi atribusi untuk sebuah pesanan (dipakai route checkout).
 *
 * Sumber kode referral HANYA cookie `sq_ref` (httpOnly, diset route `/r/[code]`).
 * Kode lalu divalidasi ulang ke database, dan self-referral (email/WA pembeli sama
 * dengan data affiliate) dibuang supaya orang tidak dapat mengkomisi sendiri.
 */
export async function resolveAttribution(
  supabase: SupabaseClient,
  req: NextRequest,
  customer: { email?: string | null; whatsapp?: string | null },
): Promise<ResolvedReferral | null> {
  const cookieCode = req.cookies.get(REF_COOKIE)?.value;
  if (!cookieCode) return null;

  const referral = await resolveReferralCode(supabase, cookieCode);
  if (!referral) return null;

  const { data: affiliate } = await supabase
    .from("affiliates")
    .select("email, phone")
    .eq("id", referral.affiliateId)
    .maybeSingle();

  if (affiliate) {
    const buyerEmail = normalizeEmail(customer.email);
    const affiliateEmail = normalizeEmail((affiliate as { email: string | null }).email);
    if (buyerEmail && affiliateEmail && buyerEmail === affiliateEmail) {
      console.log("[affiliate] Atribusi dibuang: self-referral (email sama).");
      return null;
    }

    const buyerPhone = digitsOnly(customer.whatsapp);
    const affiliatePhone = digitsOnly((affiliate as { phone: string | null }).phone);
    if (buyerPhone && affiliatePhone && buyerPhone === affiliatePhone) {
      console.log("[affiliate] Atribusi dibuang: self-referral (nomor HP sama).");
      return null;
    }
  }

  return referral;
}

function normalizeEmail(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

function digitsOnly(value: string | null | undefined): string {
  return String(value || "").replace(/\D/g, "");
}

/** Catat klik referral (untuk statistik) + naikkan counter di link. */
export async function recordReferralClick(
  supabase: SupabaseClient,
  referral: ResolvedReferral,
): Promise<void> {
  try {
    await supabase.from("affiliate_clicks").insert({
      link_id: referral.linkId,
      affiliate_id: referral.affiliateId,
    });
    if (referral.linkId) await incrementLinkClick(supabase, referral.linkId);
  } catch (e) {
    console.error("[affiliate] Gagal mencatat klik:", e);
  }
}

/**
 * Naikkan penghitung klik dengan aman (increment atomik lewat RPC SQL).
 * Fallback: ambil angka lalu tulis ulang (race kecil, hanya untuk statistik).
 */
export async function incrementLinkClick(supabase: SupabaseClient, linkId: string): Promise<void> {
  const { data } = await supabase
    .from("affiliate_links")
    .select("click_count")
    .eq("id", linkId)
    .maybeSingle();

  if (!data) return;
  const next = Number((data as { click_count?: number }).click_count || 0) + 1;
  await supabase.from("affiliate_links").update({ click_count: next }).eq("id", linkId);
}

/**
 * Apakah cookie referral masih berlaku?
 * Aturan: masa berlaku mengikuti `affiliate_settings.referral_validity_days`, yang
 * dipasang sebagai maxAge cookie di route `/r/[code]`.
 */
export function referralCookieMaxAge(settings: { referral_validity_days: number }): number {
  return Math.max(0, settings.referral_validity_days) * 24 * 60 * 60;
}
