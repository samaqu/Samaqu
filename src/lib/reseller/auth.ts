/**
 * Sesi reseller + guard route.
 *
 * Reseller TIDAK punya akun Supabase Auth: akun dibuat admin lewat panel
 * (pendaftaran tidak publik). Setelah OTP diverifikasi, server menerbitkan
 * token acak; yang disimpan di database hanya hash-nya (tabel
 * `reseller_sessions`), pola yang sama dengan token reset OTP.
 */

import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { otpHmac } from "@/lib/otp-core";
import type { ResellerRow } from "./types";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 hari

export interface ResellerSession {
  reseller: ResellerRow;
}

function readToken(req: NextRequest): string {
  const raw = req.headers.get("authorization") || "";
  return raw.replace(/^Bearer\s+/i, "").trim();
}

/** Terbitkan token sesi baru; hanya hash yang disimpan. */
export async function issueResellerSession(resellerId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await getSupabaseAdmin().from("reseller_sessions").insert({
    token_hash: otpHmac(token),
    reseller_id: resellerId,
    expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  });
  return token;
}

/** Hapus sesi (logout). Selalu sukses — token tidak dikenal pun diabaikan. */
export async function revokeResellerSession(token: string): Promise<void> {
  if (!token) return;
  await getSupabaseAdmin().from("reseller_sessions").delete().eq("token_hash", otpHmac(token));
}

/**
 * Ambil sesi reseller dari header Authorization. Hanya sesi yang belum
 * kedaluwarsa dan reseller berstatus active yang dianggap sah.
 */
export async function resellerSession(req: NextRequest): Promise<ResellerSession | null> {
  const token = readToken(req);
  if (!token) return null;

  try {
    const admin = getSupabaseAdmin();
    const { data: session } = await admin
      .from("reseller_sessions")
      .select("reseller_id, expires_at")
      .eq("token_hash", otpHmac(token))
      .maybeSingle();

    if (!session) return null;
    if (new Date(session.expires_at as string).getTime() < Date.now()) return null;

    const { data: reseller } = await admin
      .from("resellers")
      .select("*")
      .eq("id", String(session.reseller_id))
      .eq("status", "active")
      .maybeSingle();

    if (!reseller) return null;
    return { reseller: reseller as ResellerRow };
  } catch (e) {
    console.error("[RESELLER] Gagal verifikasi sesi:", e);
    return null;
  }
}

/** Helper balasan 401 untuk route reseller. */
export function resellerUnauthorized(): NextResponse {
  return NextResponse.json({ error: "Sesi reseller tidak valid" }, { status: 401 });
}
