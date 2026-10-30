/**
 * Inti OTP bersama untuk semua alur kode 6 digit (reset password customer
 * dan login reseller). Hanya mekanisme kripto & kebijakan — penyimpanan dan
 * alur masing-masing tetap di modul pemakainya.
 *
 * - Kode di-hash HMAC-SHA256 dengan `OTP_SECRET` (fallback tidak ada —
 *   tanpa secret fungsi melempar `OtpNotReadyError`).
 * - TTL 5 menit, maksimal 5 percobaan.
 */

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

export class OtpNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OtpNotReadyError";
  }
}

function otpSecret(): string {
  const value = String(process.env.OTP_SECRET || "").trim();
  if (!value) throw new OtpNotReadyError("OTP_SECRET belum diatur.");
  return value;
}

/** HMAC-SHA256 hex — dipakai untuk hash kode, token sesi, dan IP. */
export function otpHmac(value: string): string {
  return createHmac("sha256", otpSecret()).update(value).digest("hex");
}

/** Bandingkan dua hash dengan waktu konstan. */
export function otpHmacMatches(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Kode 6 digit baru. */
export function otpGenerateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** Normalisasi kode dari input pengguna (angka saja, maksimal 6 digit). */
export function otpNormalizeCode(code: string): string {
  return String(code || "").replace(/\D/g, "").slice(0, 6);
}

/** Masa berlaku baru (ISO) dihitung dari TTL standar. */
export function otpExpiryIso(now = Date.now()): string {
  return new Date(now + OTP_TTL_MS).toISOString();
}
