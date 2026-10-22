import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAffiliateSettings } from "@/lib/affiliate/settings";
import {
  REF_COOKIE,
  recordReferralClick,
  referralCookieMaxAge,
  resolveReferralCode,
} from "@/lib/affiliate/referral";

/**
 * Halaman tujuan tautan referral: `/r/<kode>`.
 *
 * Yang dilakukan di sini:
 *  1. Validasi kode ke server (kode palsu / affiliate nonaktif → langsung ke beranda).
 *  2. Catat klik (analitik) & naikkan penghitung klik tautan.
 *  3. Simpan kode di cookie `sq_ref` supaya atribusi ikut ke checkout.
 *
 * Atribusi first-click vs last-click mengikuti `affiliate_settings.attribution_model`.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const supabase = getSupabaseAdmin();
  const settings = await getAffiliateSettings(supabase);

  const home = new URL("/", req.url);

  if (!settings.enabled) {
    return NextResponse.redirect(home);
  }

  const referral = await resolveReferralCode(supabase, code);
  if (!referral) {
    // Kode tidak dikenal — arahkan ke beranda tanpa sets cookie.
    return NextResponse.redirect(home);
  }

  // Tautan produk → langsung ke halaman detail produk di toko. Kalau produk
  // sudah tidak published, tetap ke beranda supaya tidak 404.
  let target = home;
  if (referral.productId) {
    const { data: product } = await supabase
      .from("products")
      .select("id, is_published")
      .eq("id", referral.productId)
      .maybeSingle();
    if (product?.is_published) {
      target = new URL(`/katalog/${referral.productId}`, req.url);
    }
  }

  await recordReferralClick(supabase, referral);

  const response = NextResponse.redirect(target);
  const maxAge = referralCookieMaxAge(settings);
  const existing = req.cookies.get(REF_COOKIE)?.value;

  // first_click: klik pertama yang berlaku menang — cookie lama tidak ditimpa.
  const keepExisting = settings.attribution_model === "first_click" && !!existing;

  if (!keepExisting && maxAge > 0) {
    response.cookies.set(REF_COOKIE, referral.code, {
      maxAge,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  }

  return response;
}
