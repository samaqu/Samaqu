/**
 * Reset password customer lewat OTP WhatsApp (Fonnte). Server-only.
 *
 * Alur tiga langkah:
 *   1. `requestPasswordResetOtp` — cari akun dari email, buat 6 digit, simpan hash, kirim WA.
 *   2. `verifyPasswordResetOtp`  — cocokkan kode, terbitkan token reset sekali pakai.
 *   3. `resetCustomerPassword`   — set password baru lewat Supabase Admin API.
 *
 * Prinsip keamanan:
 * - Email adalah identitas; nomor WhatsApp hanya kanal kirim (nomornya tidak unik di DB).
 * - OTP disimpan sebagai HMAC, bukan teks polos; TTL 5 menit; maksimal 5 percobaan.
 * - Token reset berlaku 10 menit, sekali pakai, disimpan sebagai hash.
 * - Respons ke pemanggil tetap generik saat email tidak ditemukan (anti-enumerasi).
 * - Rate limit per akun (5/jam, jeda 60 detik) dan per IP (10/jam).
 */

import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "./supabase-admin";
import { normalizeWhatsappTarget, notifyCustomerPasswordResetOtp } from "./fonnte";

export const PASSWORD_MIN_LENGTH = 6;

const OTP_TTL_MS = 5 * 60 * 1000;
const RESET_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_REQUESTS_PER_HOUR = 5;
const MAX_REQUESTS_PER_IP_HOUR = 10;
const MAX_ATTEMPTS = 5;

/** Tabel/fungsi migrasi belum dijalankan di Supabase. */
export class PasswordResetNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PasswordResetNotReadyError";
  }
}

export interface RequestOtpResult {
  ok: true;
}

export type VerifyOtpResult =
  | { ok: true; resetToken: string }
  | { ok: false; error: string; expired?: boolean; attemptsLeft?: number };

export type ResetPasswordResult = { ok: true } | { ok: false; error: string };

function secret(): string {
  return process.env.OTP_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "samaqu-otp";
}

function hashValue(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

function normalizeEmail(email: string): string {
  return String(email || "").trim().toLowerCase();
}

function normalizeCode(code: string): string {
  return String(code || "").replace(/\D/g, "").slice(0, 6);
}

/** IP disimpan sebagai hash supaya tidak menyimpan alamat mentah pelanggan. */
function hashIp(ip: string): string {
  const value = String(ip || "").trim();
  return value ? hashValue(`ip:${value}`) : "";
}

/** IP pemanggil dari header proxy (Vercel mengisi `x-forwarded-for`). */
export function requestIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for") || "";
  return forwarded.split(",")[0].trim() || headers.get("x-real-ip") || "";
}

/** Deteksi tabel/fungsi yang belum dibuat (migrasi belum dijalankan). */
function isMissingSetup(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  const code = e?.code || "";
  const message = e?.message || "";
  return (
    code === "PGRST205" ||
    code === "PGRST202" ||
    code === "42P01" ||
    code === "42883" ||
    /could not find the (table|function)/i.test(message)
  );
}

async function userIdByEmail(email: string): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin().rpc("customer_id_by_email", {
    p_email: email,
  });

  if (error) {
    if (isMissingSetup(error)) throw new PasswordResetNotReadyError(error.message);
    console.error("[RESET-OTP] Lookup email gagal:", error.message);
    return null;
  }

  return typeof data === "string" && data ? data : null;
}

async function countRequests(sinceIso: string, userId?: string, ipHash?: string): Promise<number> {
  const admin = getSupabaseAdmin();
  let query = admin
    .from("password_reset_otp")
    .select("id", { count: "exact", head: true })
    .gte("created_at", sinceIso);

  if (userId) query = query.eq("user_id", userId);
  if (ipHash) query = query.eq("requested_ip", ipHash);

  const { count } = await query;
  return count ?? 0;
}

export async function requestPasswordResetOtp(
  rawEmail: string,
  ip: string
): Promise<RequestOtpResult> {
  const email = normalizeEmail(rawEmail);
  const userId = await userIdByEmail(email);
  // Email tidak terdaftar (atau bukan akun customer): respons tetap sama.
  if (!userId) return { ok: true };

  const admin = getSupabaseAdmin();

  const { data: customer, error: customerError } = await admin
    .from("customers")
    .select("whatsapp")
    .eq("id", userId)
    .maybeSingle();

  if (customerError) {
    if (isMissingSetup(customerError)) throw new PasswordResetNotReadyError(customerError.message);
    console.error("[RESET-OTP] Gagal membaca customer:", customerError.message);
    return { ok: true };
  }

  const target = normalizeWhatsappTarget(String(customer?.whatsapp ?? ""));
  // Tidak ada nomor WhatsApp: jangan kirim apa pun, respons tetap generik.
  if (!target) {
    console.warn("[RESET-OTP] Customer tanpa nomor WhatsApp:", userId);
    return { ok: true };
  }

  const now = Date.now();
  const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();
  const ipHash = hashIp(ip);

  const { data: latest } = await admin
    .from("password_reset_otp")
    .select("created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Jeda kirim ulang: permintaan berikutnya diabaikan tanpa membocorkan status akun.
  if (latest?.created_at && now - new Date(latest.created_at as string).getTime() < RESEND_COOLDOWN_MS) {
    return { ok: true };
  }

  if ((await countRequests(oneHourAgo, userId)) >= MAX_REQUESTS_PER_HOUR) return { ok: true };
  if (ipHash && (await countRequests(oneHourAgo, undefined, ipHash)) >= MAX_REQUESTS_PER_IP_HOUR) {
    return { ok: true };
  }

  // Hanya kode terbaru yang boleh dipakai.
  await admin
    .from("password_reset_otp")
    .update({ consumed_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("consumed_at", null)
    .is("used_at", null);

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");

  const { error: insertError } = await admin.from("password_reset_otp").insert({
    user_id: userId,
    code_hash: hashValue(code),
    expires_at: new Date(now + OTP_TTL_MS).toISOString(),
    requested_ip: ipHash || null,
  });

  if (insertError) {
    if (isMissingSetup(insertError)) throw new PasswordResetNotReadyError(insertError.message);
    console.error("[RESET-OTP] Gagal menyimpan OTP:", insertError.message);
    return { ok: true };
  }

  const sent = await notifyCustomerPasswordResetOtp(target, code);
  if (!sent) console.error("[RESET-OTP] Gagal mengirim OTP WhatsApp ke", target);

  return { ok: true };
}

export async function verifyPasswordResetOtp(
  rawEmail: string,
  rawCode: string
): Promise<VerifyOtpResult> {
  const email = normalizeEmail(rawEmail);
  const code = normalizeCode(rawCode);
  if (code.length !== 6) {
    return { ok: false, error: "Kode harus 6 digit." };
  }

  const userId = await userIdByEmail(email);
  if (!userId) return { ok: false, error: "Kode salah atau sudah kedaluwarsa." };

  const admin = getSupabaseAdmin();
  const { data: row, error } = await admin
    .from("password_reset_otp")
    .select("id, code_hash, expires_at, attempts, consumed_at")
    .eq("user_id", userId)
    .is("consumed_at", null)
    .is("used_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingSetup(error)) throw new PasswordResetNotReadyError(error.message);
    console.error("[RESET-OTP] Gagal membaca OTP:", error.message);
    return { ok: false, error: "Kode salah atau sudah kedaluwarsa." };
  }

  if (!row) return { ok: false, error: "Kode salah atau sudah kedaluwarsa." };

  if (new Date(row.expires_at as string).getTime() < Date.now()) {
    return { ok: false, error: "Kode sudah kedaluwarsa. Minta kode baru.", expired: true };
  }

  const attempts = Number(row.attempts) || 0;
  if (attempts >= MAX_ATTEMPTS) {
    return { ok: false, error: "Terlalu banyak percobaan. Minta kode baru.", expired: true };
  }

  if (!sameHash(String(row.code_hash), hashValue(code))) {
    const nextAttempts = attempts + 1;
    await admin
      .from("password_reset_otp")
      .update({ attempts: nextAttempts })
      .eq("id", row.id);

    const attemptsLeft = Math.max(0, MAX_ATTEMPTS - nextAttempts);
    return {
      ok: false,
      error:
        attemptsLeft > 0
          ? `Kode salah. Sisa ${attemptsLeft} percobaan.`
          : "Terlalu banyak percobaan. Minta kode baru.",
      attemptsLeft,
    };
  }

  const resetToken = randomBytes(32).toString("hex");
  const { error: updateError } = await admin
    .from("password_reset_otp")
    .update({
      consumed_at: new Date().toISOString(),
      reset_token_hash: hashValue(resetToken),
      reset_token_expires_at: new Date(Date.now() + RESET_TTL_MS).toISOString(),
    })
    .eq("id", row.id);

  if (updateError) {
    console.error("[RESET-OTP] Gagal menerbitkan token reset:", updateError.message);
    return { ok: false, error: "Gagal memproses kode. Coba lagi." };
  }

  return { ok: true, resetToken };
}

export async function resetCustomerPassword(
  resetToken: string,
  newPassword: string
): Promise<ResetPasswordResult> {
  const token = String(resetToken || "").trim();
  const password = String(newPassword || "");

  if (!token) return { ok: false, error: "Sesi reset tidak valid. Ulangi dari awal." };
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, error: `Password minimal ${PASSWORD_MIN_LENGTH} karakter.` };
  }

  const admin = getSupabaseAdmin();
  const { data: row, error } = await admin
    .from("password_reset_otp")
    .select("id, user_id, reset_token_expires_at, used_at")
    .eq("reset_token_hash", hashValue(token))
    .is("used_at", null)
    .maybeSingle();

  if (error) {
    if (isMissingSetup(error)) throw new PasswordResetNotReadyError(error.message);
    console.error("[RESET-OTP] Gagal membaca token reset:", error.message);
    return { ok: false, error: "Sesi reset tidak valid. Ulangi dari awal." };
  }

  if (!row) return { ok: false, error: "Sesi reset sudah dipakai atau tidak valid." };

  if (
    !row.reset_token_expires_at ||
    new Date(row.reset_token_expires_at as string).getTime() < Date.now()
  ) {
    return { ok: false, error: "Sesi reset sudah kedaluwarsa. Ulangi dari awal." };
  }

  const { error: authError } = await admin.auth.admin.updateUserById(String(row.user_id), {
    password,
  });

  if (authError) {
    console.error("[RESET-OTP] Gagal mengganti password:", authError.message);
    return { ok: false, error: "Gagal menyimpan password baru. Coba lagi." };
  }

  await admin
    .from("password_reset_otp")
    .update({ used_at: new Date().toISOString() })
    .eq("id", row.id);

  return { ok: true };
}
