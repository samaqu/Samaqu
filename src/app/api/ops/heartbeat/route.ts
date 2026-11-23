import { NextRequest, NextResponse } from "next/server";
import { opsIdentity, unauthorized } from "@/lib/ops-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

/**
 * POST /api/ops/heartbeat → catat "terakhir terlihat" AKUN SENDIRI (admins.last_seen_at).
 * Dipanggil panel tiap ±2 menit selama tab terlihat. Baris yang diubah selalu milik pemanggil.
 * Penulisan dilewati kalau angka yang tersimpan masih baru (< 60 detik) supaya tab ganda / sinyal beruntun tidak menulis berulang.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MIN_GAP_MS = 60_000;

export async function POST(req: NextRequest) {
  const me = await opsIdentity(req);
  if (!me) return unauthorized();

  const admin = getSupabaseAdmin();
  const { data: row, error: readError } = await admin.from("admins").select("last_seen_at").eq("user_id", me.userId).maybeSingle();
  if (readError) {
    // Kolom belum ada (migrasi belum jalan) atau galat sesaat: panel tidak perlu tahu, cukup diam.
    return NextResponse.json({ ok: false }, { status: 200, headers: { "Cache-Control": "no-store, private" } });
  }

  const last = row?.last_seen_at ? Date.parse(String(row.last_seen_at)) : 0;
  if (last && Date.now() - last < MIN_GAP_MS) {
    return NextResponse.json({ ok: true, skipped: true }, { headers: { "Cache-Control": "no-store, private" } });
  }

  const { error } = await admin.from("admins").update({ last_seen_at: new Date().toISOString() }).eq("user_id", me.userId);
  if (error) console.error("[OPS-HEARTBEAT] gagal menulis last_seen_at:", error.message);
  return NextResponse.json({ ok: !error }, { headers: { "Cache-Control": "no-store, private" } });
}
