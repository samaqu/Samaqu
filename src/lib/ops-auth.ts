import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

/**
 * Gerbang akses untuk semua route /api/ops/*: hanya admin SAMAQU
 * (session Supabase + terdaftar di tabel `admins`) yang boleh lewat.
 *
 * Hasil verifikasi di-cache di memori function (TTL 5 menit) supaya tiap
 * request tidak perlu 2 round-trip tambahan ke Supabase (auth + tabel admins).
 * Cache di-key pakai token; token Supabase berlaku ~1 jam, jadi aman.
 */
const ADMIN_TTL_MS = 5 * 60 * 1000;

/** Role yang dikenal sistem. `other` = admin biasa / Admin Operasional. */
export type OpsRole = "owner" | "leader" | "admin" | "admin_operasional" | "other";

type CacheEntry = { ok: boolean; email: string; role: OpsRole; exp: number };
const adminCache = new Map<string, CacheEntry>();

function tokenOf(req: NextRequest): string {
  return (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
}

/**
 * Normalisasi nilai `admins.role` (teks bebas) ke role yang dikenal.
 * Hanya `owner` dan `leader` yang punya akses ke menu Produksi.
 */
export function normalizeOpsRole(value?: string | null): OpsRole {
  const raw = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (raw === "owner" || raw === "pemilik" || raw === "bos") return "owner";
  if (raw === "leader" || raw === "leader_ops" || raw === "supervisor") return "leader";
  if (raw === "admin_operasional" || raw === "admin_ops" || raw === "operasional") return "admin_operasional";
  if (raw === "admin") return "admin";
  return "other";
}

async function readIdentity(req: NextRequest): Promise<{ email: string; role: OpsRole } | null> {
  const token = tokenOf(req);
  if (!token) return null;

  const hit = adminCache.get(token);
  if (hit && hit.exp > Date.now()) {
    return hit.ok ? { email: hit.email, role: hit.role } : null;
  }

  try {
    const admin = getSupabaseAdmin();
    const { data: { user }, error } = await admin.auth.getUser(token);
    if (error || !user) return null;
    const { data } = await admin
      .from("admins")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!data) return null;

    const role = normalizeOpsRole(data.role);
    const email = user.email || "";
    // Hanya hasil positif yang di-cache, supaya error sesaat tidak bikin
    // admin terkunci 5 menit.
    adminCache.set(token, { ok: true, email, role, exp: Date.now() + ADMIN_TTL_MS });
    return { email, role };
  } catch (e) {
    console.error("[OPS] Verifikasi admin gagal:", e);
    return null;
  }
}

export async function isOpsAdmin(req: NextRequest): Promise<boolean> {
  return (await readIdentity(req)) !== null;
}

/** Email + role admin yang sedang login (untuk kolom `actor` / gerbang fitur). */
export async function opsIdentity(req: NextRequest): Promise<{ email: string; role: OpsRole } | null> {
  return readIdentity(req);
}

/** Email admin yang sedang login (untuk kolom `actor` di riwayat). */
export async function opsActorEmail(req: NextRequest): Promise<string> {
  return (await readIdentity(req))?.email || "admin";
}

export const unauthorized = () => NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

export const forbidden = (message = "Tidak punya akses ke fitur ini") =>
  NextResponse.json({ error: message }, { status: 403 });

export type ProductionAccess =
  | { ok: true; email: string; role: "owner" | "leader"; canWrite: boolean }
  | { ok: false; response: NextResponse };

/**
 * Gerbang khusus menu Produksi:
 *  - Owner : baca + tulis (harga terlihat).
 *  - Leader: baca stok & status saja (semua harga disensor di route).
 *  - Admin / Admin Operasional / lainnya: ditolak 403 (bukan cuma menu disembunyikan).
 */
export async function productionGuard(
  req: NextRequest,
  opts: { write?: boolean } = {},
): Promise<ProductionAccess> {
  const identity = await readIdentity(req);
  if (!identity) return { ok: false, response: unauthorized() };

  if (identity.role !== "owner" && identity.role !== "leader") {
    return { ok: false, response: forbidden("Menu Produksi hanya untuk Owner dan Leader") };
  }
  if (opts.write && identity.role !== "owner") {
    return { ok: false, response: forbidden("Hanya Owner yang boleh mengubah data produksi") };
  }

  return { ok: true, email: identity.email, role: identity.role, canWrite: identity.role === "owner" };
}

/** Leader tidak boleh melihat angka harga sama sekali (bukan hanya disembunyikan di UI). */
export function canSeePrices(role: string): boolean {
  return role === "owner";
}

/** Status stok mengikuti aturan app Base44: 0 habis, <=5 menipis, sisanya aman. */
export function stockStatus(total: number): "habis" | "menipis" | "aman" {
  if (total <= 0) return "habis";
  if (total <= 5) return "menipis";
  return "aman";
}
