/**
 * OTP login reseller (WhatsApp).
 *
 * Nomor WhatsApp adalah identitas; OTP hanya dikirim kalau nomor itu
 * terdaftar sebagai reseller berstatus active. Respons ke pemanggil tetap
 * generik supaya nomor reseller tidak bisa dienumerasi.
 *
 * Mekanisme kode (hash HMAC, TTL 5 menit, maks 5 percobaan) memakai inti
 * bersama `src/lib/otp-core.ts` — alur OTP customer tidak berubah.
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { normalizeWhatsappTarget, sendFonnteMessage, getFonnteConfigs } from "@/lib/fonnte";
import {
  OTP_MAX_ATTEMPTS,
  otpExpiryIso,
  otpGenerateCode,
  otpHmac,
  otpHmacMatches,
  otpNormalizeCode,
} from "@/lib/otp-core";
import type { ResellerRow } from "./types";

const RESEND_COOLDOWN_MS = 60 * 1000;

export interface RequestResellerOtpResult {
  ok: true;
}

export type VerifyResellerOtpResult =
  | { ok: true; reseller: ResellerRow }
  | { ok: false; error: string; expired?: boolean; attemptsLeft?: number };

/** Baris reseller dari nomor WhatsApp (ternormalisasi), wajib active. */
export async function resellerByWhatsapp(whatsapp: string): Promise<ResellerRow | null> {
  const target = normalizeWhatsappTarget(whatsapp);
  if (!target) return null;

  try {
    const { data } = await getSupabaseAdmin()
      .from("resellers")
      .select("*")
      .eq("whatsapp", target)
      .eq("status", "active")
      .maybeSingle();
    return (data as ResellerRow) ?? null;
  } catch (e) {
    console.error("[RESELLER-OTP] Gagal mencari reseller:", e);
    return null;
  }
}

/** Kirim kode OTP ke WhatsApp reseller. Memakai jalur customer (device Lite). */
async function sendOtpWhatsapp(whatsapp: string, code: string): Promise<boolean> {
  const { customer } = await getFonnteConfigs();
  if (!customer.enabled || !customer.token) return false;

  const message = [
    "SAMAQU Reseller",
    "",
    `Kode verifikasi kamu: ${code}`,
    "Berlaku 5 menit.",
    "",
    "Jangan bagikan kode ini ke siapa pun, termasuk admin SAMAQU.",
    "",
    "Bukan kamu? Abaikan pesan ini.",
  ].join("\n");

  return sendFonnteMessage(customer.token, normalizeWhatsappTarget(whatsapp), message);
}

export async function requestResellerOtp(
  rawWhatsapp: string,
  ip: string
): Promise<RequestResellerOtpResult> {
  const target = normalizeWhatsappTarget(rawWhatsapp);
  const reseller = target ? await resellerByWhatsapp(target) : null;
  // Nomor tidak terdaftar / tidak aktif: respons tetap sama.
  if (!reseller) return { ok: true };

  const admin = getSupabaseAdmin();
  const now = Date.now();

  const { data: latest } = await admin
    .from("reseller_otps")
    .select("created_at")
    .eq("reseller_id", reseller.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Jeda kirim ulang (sama dengan OTP customer).
  if (latest?.created_at && now - new Date(latest.created_at as string).getTime() < RESEND_COOLDOWN_MS) {
    return { ok: true };
  }

  // Hanya kode terbaru yang boleh dipakai.
  await admin
    .from("reseller_otps")
    .update({ consumed_at: new Date().toISOString() })
    .eq("reseller_id", reseller.id)
    .is("consumed_at", null);

  const code = otpGenerateCode();

  const { error: insertError } = await admin.from("reseller_otps").insert({
    reseller_id: reseller.id,
    code_hash: otpHmac(code),
    expires_at: otpExpiryIso(now),
    requested_ip: ip ? otpHmac(`ip:${ip}`) : null,
  });

  if (insertError) {
    console.error("[RESELLER-OTP] Gagal menyimpan OTP:", insertError.message);
    return { ok: true };
  }

  const sent = await sendOtpWhatsapp(reseller.whatsapp || target, code);
  if (!sent) console.error("[RESELLER-OTP] Gagal mengirim OTP ke", target);

  return { ok: true };
}

export async function verifyResellerOtp(
  rawWhatsapp: string,
  rawCode: string
): Promise<VerifyResellerOtpResult> {
  const code = otpNormalizeCode(rawCode);
  if (code.length !== 6) {
    return { ok: false, error: "Kode harus 6 digit." };
  }

  const reseller = await resellerByWhatsapp(rawWhatsapp);
  if (!reseller) return { ok: false, error: "Kode salah atau sudah kedaluwarsa." };

  const admin = getSupabaseAdmin();
  const { data: row, error } = await admin
    .from("reseller_otps")
    .select("id, code_hash, expires_at, attempts, consumed_at")
    .eq("reseller_id", reseller.id)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !row) {
    if (error) console.error("[RESELLER-OTP] Gagal membaca OTP:", error.message);
    return { ok: false, error: "Kode salah atau sudah kedaluwarsa." };
  }

  if (new Date(row.expires_at as string).getTime() < Date.now()) {
    return { ok: false, error: "Kode sudah kedaluwarsa. Minta kode baru.", expired: true };
  }

  const attempts = Number(row.attempts) || 0;
  if (attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, error: "Terlalu banyak percobaan. Minta kode baru.", expired: true };
  }

  if (!otpHmacMatches(String(row.code_hash), otpHmac(code))) {
    // Naikkan attempts ATOMIK (UPDATE bersyarat) supaya percobaan paralel
    // tidak bisa melewati batas.
    let nextAttempts = attempts + 1;
    const { data: bumped } = await admin
      .from("reseller_otps")
      .update({ attempts: nextAttempts })
      .eq("id", row.id)
      .lt("attempts", OTP_MAX_ATTEMPTS)
      .select("attempts")
      .maybeSingle();
    if (bumped) nextAttempts = Number(bumped.attempts) || nextAttempts;

    const attemptsLeft = Math.max(0, OTP_MAX_ATTEMPTS - nextAttempts);
    return {
      ok: false,
      error:
        attemptsLeft > 0
          ? `Kode salah. Sisa ${attemptsLeft} percobaan.`
          : "Terlalu banyak percobaan. Minta kode baru.",
      attemptsLeft,
    };
  }

  const { error: updateError } = await admin
    .from("reseller_otps")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id);

  if (updateError) {
    console.error("[RESELLER-OTP] Gagal menandai OTP terpakai:", updateError.message);
    return { ok: false, error: "Gagal memproses kode. Coba lagi." };
  }

  return { ok: true, reseller };
}
