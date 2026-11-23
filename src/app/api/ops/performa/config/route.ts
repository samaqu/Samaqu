import { NextRequest, NextResponse } from "next/server";
import { opsIdentity, unauthorized } from "@/lib/ops-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { loadSlaConfig } from "@/lib/performa-data";

/**
 * GET /api/ops/performa/config → ambang SLA yang dipakai tampilan (warna waktu tunggu di Inbox WA).
 * Boleh dibaca semua admin yang login; hanya ambang waktu, tanpa data lain. Perubahan lewat PUT /api/ops/performa.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await opsIdentity(req))) return unauthorized();
  const cfg = await loadSlaConfig(getSupabaseAdmin());
  return NextResponse.json(
    { targetResponseMin: cfg.targetResponseMin, warningMin: cfg.warningMin, lateMin: cfg.lateMin },
    { headers: { "Cache-Control": "no-store, private" } },
  );
}
