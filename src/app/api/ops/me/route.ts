import { NextRequest, NextResponse } from "next/server";
import { opsIdentity, unauthorized } from "@/lib/ops-auth";

/**
 * GET /api/ops/me → identitas admin yang sedang login (nama tampil, label jabatan, peran).
 * Dipakai header panel admin supaya tidak lagi menulis nama secara mati.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const me = await opsIdentity(req);
  if (!me) return unauthorized();
  return NextResponse.json(
    { name: me.name, title: me.title, role: me.role, email: me.email },
    { headers: { "Cache-Control": "no-store, private" } },
  );
}
