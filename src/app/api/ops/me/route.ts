import { NextRequest, NextResponse } from "next/server";
import { opsIdentity, unauthorized } from "@/lib/ops-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

/**
 * GET /api/ops/me → identitas admin yang sedang login (nama tampil, label jabatan, peran, status kerja).
 * Dipakai header panel admin supaya tidak lagi menulis nama secara mati.
 * Status dibaca langsung dari database (bukan dari cache login) supaya selalu terbaru.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const me = await opsIdentity(req);
  if (!me) return unauthorized();

  // Kolom `status` baru ada setelah migrasi 20261124; kalau belum ada, status dikosongkan dan pemilihnya tidak tampil.
  let status: string | null = null;
  const { data } = await getSupabaseAdmin().from("admins").select("status").eq("user_id", me.userId).maybeSingle();
  if (data && typeof data.status === "string") status = data.status;

  return NextResponse.json(
    { name: me.name, title: me.title, role: me.role, email: me.email, userId: me.userId, status },
    { headers: { "Cache-Control": "no-store, private" } },
  );
}
