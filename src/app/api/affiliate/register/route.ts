import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAffiliateSettings } from "@/lib/affiliate/settings";
import { checkPurchaseEligibility } from "@/lib/affiliate/eligibility";

/**
 * Pendaftaran akun affiliate.
 *
 * Memakai Supabase Auth yang sama dengan toko (tanpa sistem akun terpisah).
 * Akun yang dibuat berstatus "menunggu" sampai admin menyetujui di
 * dashboard admin → "Affiliate → Data Affiliate".
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function generateAffiliateCode(): Promise<string> {
  const admin = getSupabaseAdmin();
  const { data } = await admin.from("affiliates").select("affiliate_code").like("affiliate_code", "SAM-AF-%");

  let max = 0;
  for (const row of (data || []) as { affiliate_code: string }[]) {
    const n = Number.parseInt(String(row.affiliate_code).replace("SAM-AF-", ""), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }

  let next = max + 1;
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = `SAM-AF-${String(next).padStart(5, "0")}`;
    const { data: exists } = await admin
      .from("affiliates")
      .select("id")
      .eq("affiliate_code", code)
      .maybeSingle();
    if (!exists) return code;
    next++;
  }
  return `SAM-AF-${String(next).padStart(5, "0")}`;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const fullName = String(body.fullName || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const phone = String(body.phone || "").trim();
  const password = String(body.password || "");
  const tos = body.tos === true;
  const primaryChannel = String(body.primaryChannel || "").trim();
  const channelHandle = String(body.channelHandle || "").trim();
  const contentDescription = String(body.contentDescription || "").trim();

  if (fullName.length < 3) {
    return NextResponse.json({ error: "Nama lengkap minimal 3 karakter." }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Format email tidak valid." }, { status: 400 });
  }
  if (!/^0\d{8,13}$/.test(phone.replace(/\D/g, ""))) {
    return NextResponse.json({ error: "Nomor telepon harus diawali 0 dan berisi 9–14 digit." }, { status: 400 });
  }
  if (password.length < 8 || !/\d/.test(password) || !/[a-zA-Z]/.test(password)) {
    return NextResponse.json({ error: "Kata sandi minimal 8 karakter, kombinasi huruf dan angka." }, { status: 400 });
  }
  if (!tos) {
    return NextResponse.json({ error: "Kamu harus menyetujui Ketentuan Program Affiliate." }, { status: 400 });
  }
  if (!primaryChannel || primaryChannel.length > 40) {
    return NextResponse.json({ error: "Pilih channel utama (maksimal 40 karakter)." }, { status: 400 });
  }
  if (channelHandle.length < 2 || channelHandle.length > 160) {
    return NextResponse.json(
      { error: "Username atau link akun wajib diisi (2–160 karakter)." },
      { status: 400 },
    );
  }
  if (contentDescription.length > 600) {
    return NextResponse.json({ error: "Cerita konten maksimal 600 karakter." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const settings = await getAffiliateSettings(admin);
  if (!settings.enabled) {
    return NextResponse.json(
      { error: "Program affiliate sedang tidak menerima pendaftaran baru." },
      { status: 503 },
    );
  }

  // Syarat: minimal satu pembelian VALID. Diverifikasi di server dari riwayat `orders`.
  // Kalau belum bisa diverifikasi (mis. email/telepon beda dengan data pesanan), jangan
  // langsung tolak: pendaftaran tetap dibuat dan admin yang memverifikasi.
  const eligibility = await checkPurchaseEligibility(admin, { email, phone });
  if (eligibility.status === "not_eligible") {
    return NextResponse.json(
      {
        error:
          "Riwayat pembelianmu belum valid (pesanan dibatalkan/refund). Silakan lakukan pembelian pertama dulu sebelum mendaftar affiliate.",
        code: "NOT_ELIGIBLE",
        eligibility,
      },
      { status: 403 },
    );
  }

  // 1. Buat akun auth (alur sama dengan akun pelanggan: verifikasi email bila diaktifkan).
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
  if (signUpError) {
    const msg = signUpError.message || "";
    if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("registered")) {
      return NextResponse.json(
        { error: "Email sudah terdaftar. Silakan masuk atau gunakan email lain." },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: msg || "Gagal membuat akun." }, { status: 400 });
  }

  const user = signUpData?.user;
  if (!user) {
    return NextResponse.json({ error: "Gagal membuat akun." }, { status: 500 });
  }

  // 2. Buat profil affiliate (status menunggu persetujuan admin).
  const affiliateCode = await generateAffiliateCode();
  const baseProfile = {
    user_id: user.id,
    affiliate_code: affiliateCode,
    full_name: fullName,
    display_name: fullName,
    email,
    phone,
    status: "menunggu",
    terms_accepted_at: new Date().toISOString(),
  };

  let { data: created, error: insertError } = await admin
    .from("affiliates")
    .insert({
      ...baseProfile,
      primary_channel: primaryChannel,
      channel_handle: channelHandle,
      content_description: contentDescription || null,
    })
    .select("id")
    .maybeSingle();

  // Kalau migrasi kolom channel belum dijalankan, pendaftaran tetap disimpan
  // (tanpa data channel) alih-alih gagal total.
  if (
    insertError &&
    (insertError.code === "42703" || /column .* does not exist/i.test(insertError.message))
  ) {
    console.warn(
      "[affiliate] Kolom channel belum ada di tabel affiliates. Jalankan supabase/migrations/20261027_affiliate_channel.sql.",
    );
    ({ data: created, error: insertError } = await admin
      .from("affiliates")
      .insert(baseProfile)
      .select("id")
      .maybeSingle());
  }

  if (insertError || !created) {
    console.error("[affiliate] Gagal membuat profil affiliate:", insertError?.message);
    return NextResponse.json({ error: "Gagal membuat profil affiliate." }, { status: 500 });
  }

  await admin.from("affiliate_activity_log").insert({
    affiliate_id: (created as { id: string }).id,
    actor_type: "affiliate",
    actor_id: user.id,
    action: "daftar",
    to_status: "menunggu",
    note: `Pendaftaran akun affiliate ${email}. Verifikasi pembelian: ${eligibility.status}.`,
  });

  return NextResponse.json({
    ok: true,
    email,
    affiliateCode,
    eligibility,
    needsVerification: !signUpData?.session,
  });
}
