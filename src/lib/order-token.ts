import { createHmac, timingSafeEqual } from "crypto";

/**
 * Token tautan pesanan — dipakai halaman sukses checkout (`?order=…&t=…`) supaya customer
 * (termasuk tamu yang belum masuk) tetap bisa melihat pesanannya SETELAH policy RLS `orders`
 * ditutup dari anon.
 *
 * Token = HMAC-SHA256 dari nomor pesanan. Kuncinya `ORDER_TOKEN_SECRET` (fallback `OTP_SECRET`),
 * TERPISAH dari service role key. Sifatnya deterministik & tanpa kedaluwarsa, sama seperti
 * tautan pelacakan: yang punya tautan hanya bisa melihat pesanan itu sendiri.
 */
const KEY = process.env.ORDER_TOKEN_SECRET || process.env.OTP_SECRET || "";

function sign(orderNumber: string): Buffer {
  return createHmac("sha256", KEY).update(String(orderNumber || "").trim()).digest();
}

/** Token pendek (32 karakter base64url) untuk dipasang di URL. */
export function orderLookupToken(orderNumber: string): string {
  return sign(orderNumber).toString("base64url").slice(0, 32);
}

/** Cocok? Dibandingkan dengan waktu konstan supaya tidak bisa ditebak dari selisih waktu. */
export function verifyOrderLookupToken(orderNumber: string, token: string): boolean {
  if (!KEY || !orderNumber || !token) return false;
  const expected = Buffer.from(orderLookupToken(orderNumber));
  const given = Buffer.from(String(token));
  if (expected.length !== given.length) return false;
  try {
    return timingSafeEqual(expected, given);
  } catch {
    return false;
  }
}
