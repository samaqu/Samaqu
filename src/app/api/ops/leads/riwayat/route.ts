import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";

/**
 * GET /api/ops/leads/riwayat?id=<lead id>
 *
 * Riwayat perubahan satu lead untuk panel Detail Lead: dibuat, diubah (siapa, kapan, apa yang berubah), dan PIC dipindah.
 * Hanya membaca `lead_activities`; aktivitas follow-up biasa (buka WA, hasil, jadwal) tidak ditampilkan di sini.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SHOWN = ["created", "edited", "set_pic"] as const;

export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id wajib" }, { status: 400 });

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("lead_activities")
    .select("id, actor, action, note, created_at")
    .eq("lead_id", id)
    .in("action", SHOWN as unknown as string[])
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Email pelaku -> nama tampil di Tim Admin.
  const emails = [...new Set((data || []).map((r) => String(r.actor || "")).filter((a) => a.includes("@")))];
  const names = new Map<string, string>();
  if (emails.length > 0) {
    const { data: users } = await admin.from("admins").select("display_name, user_id");
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const idToName = new Map((users || []).map((u) => [u.user_id as string, String(u.display_name || "").trim()]));
    for (const u of list?.users || []) {
      if (u.email && emails.includes(u.email)) names.set(u.email, idToName.get(u.id) || u.email.split("@")[0]);
    }
  }

  const items = (data || []).map((r) => ({
    id: r.id,
    action: r.action,
    note: r.note,
    createdAt: r.created_at,
    actor: names.get(String(r.actor)) || (r.actor === "system" || !r.actor ? "Sistem" : String(r.actor)),
  }));
  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store, private" } });
}
