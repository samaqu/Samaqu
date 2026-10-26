import { createHash, createHmac } from "node:crypto";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "./supabase-admin";

/**
 * Rate limit sederhana per IP untuk endpoint publik.
 *
 * - IP tidak disimpan mentah: di-hash HMAC dengan `RATE_LIMIT_SECRET` (fallback `OTP_SECRET`).
 * - Hitungan disimpan di `api_rate_limits` (service role). Kalau tabel belum ada, jatuh ke
 *   penghitung memori per instance supaya endpoint tetap jalan.
 */
function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for") || "";
  return forwarded.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

function hashIp(ip: string): string {
  const key = process.env.RATE_LIMIT_SECRET || process.env.OTP_SECRET || "";
  return key
    ? createHmac("sha256", key).update(`ip:${ip}`).digest("hex")
    : createHash("sha256").update(`ip:${ip}`).digest("hex");
}

const memory = new Map<string, number[]>();

function memoryLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (memory.get(key) || []).filter((ts) => now - ts < windowMs);
  if (hits.length >= limit) {
    memory.set(key, hits);
    return false;
  }
  hits.push(now);
  memory.set(key, hits);
  return true;
}

export async function checkRateLimit(
  req: NextRequest,
  bucket: string,
  limit: number,
  windowMs: number,
): Promise<{ ok: boolean; retryAfter: number }> {
  const ipHash = hashIp(clientIp(req));
  const key = `${bucket}:${ipHash}`;
  const since = new Date(Date.now() - windowMs).toISOString();
  const retryAfter = Math.ceil(windowMs / 1000);

  try {
    const admin = getSupabaseAdmin();
    const { count, error } = await admin
      .from("api_rate_limits")
      .select("id", { count: "exact", head: true })
      .eq("bucket", bucket)
      .eq("ip_hash", ipHash)
      .gte("created_at", since);

    if (error) throw error;
    if ((count ?? 0) >= limit) return { ok: false, retryAfter };

    const { error: insertError } = await admin
      .from("api_rate_limits")
      .insert({ bucket, ip_hash: ipHash });
    if (insertError) throw insertError;

    // Bersihkan baris lama sesekali supaya tabel tidak membengkak.
    if (Math.random() < 0.02) {
      await admin
        .from("api_rate_limits")
        .delete()
        .lt("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString());
    }

    return { ok: true, retryAfter: 0 };
  } catch {
    return { ok: memoryLimit(key, limit, windowMs), retryAfter };
  }
}
