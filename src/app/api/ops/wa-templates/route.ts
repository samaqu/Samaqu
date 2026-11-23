import { NextRequest, NextResponse } from "next/server";
import { forbidden, opsIdentity, unauthorized } from "@/lib/ops-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { TEMPLATE_LIMITS } from "@/lib/wa-template";

/**
 * Template chat Inbox WA (panel admin).
 *
 *  GET                         → daftar template aktif (SEMUA admin boleh membaca/memakai). Owner/Leader dapat `?all=1`
 *                                 untuk ikut melihat yang nonaktif dan `canManage: true`.
 *  POST   {title,category,content}            → tambah (Owner/Leader)
 *  PATCH  {id,title?,category?,content?,active?} → ubah (Owner/Leader)
 *  DELETE ?id=…                → hapus (Owner/Leader)
 *
 * Pengelolaan dijaga di SERVER. Tabel `wa_templates` tidak dibaca bot.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store, private" };
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: noStore });
const canManageRole = (role: string) => role === "owner" || role === "leader";

function cleanField(value: unknown, [min, max]: readonly [number, number], label: string): { ok: true; value: string } | { ok: false; error: string } {
  const text = String(value ?? "").replace(/\r\n/g, "\n").trim();
  if (text.length < min || text.length > max) return { ok: false, error: `${label} harus ${min}-${max} karakter.` };
  return { ok: true, value: text };
}

export async function GET(req: NextRequest) {
  const me = await opsIdentity(req);
  if (!me) return unauthorized();
  const manage = canManageRole(me.role);
  const all = manage && new URL(req.url).searchParams.get("all") === "1";

  let query = getSupabaseAdmin()
    .from("wa_templates")
    .select("id, title, category, content, sort_order, active")
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true })
    .limit(1000);
  if (!all) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) return fail("Gagal memuat template.", 500);
  return NextResponse.json({ items: data || [], canManage: manage }, { headers: noStore });
}

export async function POST(req: NextRequest) {
  const me = await opsIdentity(req);
  if (!me) return unauthorized();
  if (!canManageRole(me.role)) return forbidden("Hanya Owner dan Leader yang boleh mengelola template");

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const title = cleanField(body?.title, TEMPLATE_LIMITS.title, "Judul");
  const category = cleanField(body?.category ?? "Umum", TEMPLATE_LIMITS.category, "Kategori");
  const content = cleanField(body?.content, TEMPLATE_LIMITS.content, "Isi template");
  if (!title.ok) return fail(title.error, 400);
  if (!category.ok) return fail(category.error, 400);
  if (!content.ok) return fail(content.error, 400);

  const { data, error } = await getSupabaseAdmin()
    .from("wa_templates")
    .insert({ title: title.value, category: category.value, content: content.value, created_by: me.userId, updated_by: me.userId })
    .select("id")
    .single();
  if (error) return fail("Gagal menyimpan template.", 500);
  return NextResponse.json({ ok: true, id: data?.id }, { headers: noStore });
}

export async function PATCH(req: NextRequest) {
  const me = await opsIdentity(req);
  if (!me) return unauthorized();
  if (!canManageRole(me.role)) return forbidden("Hanya Owner dan Leader yang boleh mengelola template");

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) return fail("Template tidak valid.", 400);

  const patch: Record<string, unknown> = { updated_by: me.userId, updated_at: new Date().toISOString() };
  if (body?.title !== undefined) {
    const r = cleanField(body.title, TEMPLATE_LIMITS.title, "Judul");
    if (!r.ok) return fail(r.error, 400);
    patch.title = r.value;
  }
  if (body?.category !== undefined) {
    const r = cleanField(body.category, TEMPLATE_LIMITS.category, "Kategori");
    if (!r.ok) return fail(r.error, 400);
    patch.category = r.value;
  }
  if (body?.content !== undefined) {
    const r = cleanField(body.content, TEMPLATE_LIMITS.content, "Isi template");
    if (!r.ok) return fail(r.error, 400);
    patch.content = r.value;
  }
  if (typeof body?.active === "boolean") patch.active = body.active;
  if (Object.keys(patch).length <= 2) return fail("Tidak ada yang diubah.", 400);

  const { data, error } = await getSupabaseAdmin().from("wa_templates").update(patch).eq("id", id).select("id");
  if (error) return fail("Gagal mengubah template.", 500);
  if (!data || data.length === 0) return fail("Template tidak ditemukan.", 404);
  return NextResponse.json({ ok: true }, { headers: noStore });
}

export async function DELETE(req: NextRequest) {
  const me = await opsIdentity(req);
  if (!me) return unauthorized();
  if (!canManageRole(me.role)) return forbidden("Hanya Owner dan Leader yang boleh mengelola template");

  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return fail("Template tidak valid.", 400);
  const { data, error } = await getSupabaseAdmin().from("wa_templates").delete().eq("id", id).select("id");
  if (error) return fail("Gagal menghapus template.", 500);
  if (!data || data.length === 0) return fail("Template tidak ditemukan.", 404);
  return NextResponse.json({ ok: true }, { headers: noStore });
}
