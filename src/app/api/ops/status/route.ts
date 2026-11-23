import { NextRequest, NextResponse } from "next/server";
import { opsIdentity, unauthorized } from "@/lib/ops-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

/**
 * POST /api/ops/status {status} → ubah status kerja AKUN SENDIRI (aktif | istirahat | pulang).
 * Siapa pun tidak bisa mengubah status admin lain lewat route ini: baris yang diubah selalu milik pemanggil.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATUSES = ["aktif", "istirahat", "pulang"] as const;
type Status = (typeof STATUSES)[number];

export async function POST(req: NextRequest) {
  const me = await opsIdentity(req);
  if (!me) return unauthorized();

  const body = (await req.json().catch(() => null)) as { status?: unknown } | null;
  const status = String(body?.status ?? "") as Status;
  if (!STATUSES.includes(status)) {
    return NextResponse.json({ error: "Status tidak valid." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { error } = await getSupabaseAdmin()
    .from("admins")
    .update({ status, status_at: now })
    .eq("user_id", me.userId);
  if (error) {
    console.error("[OPS-STATUS] gagal mengubah status:", error.message);
    return NextResponse.json({ error: "Gagal mengubah status." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, status, statusAt: now }, { headers: { "Cache-Control": "no-store, private" } });
}
