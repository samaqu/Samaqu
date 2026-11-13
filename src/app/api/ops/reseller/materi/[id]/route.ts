import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";
import { validateMateri } from "@/lib/reseller/materi";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ubah satu materi (isian penuh, divalidasi sama seperti saat menambah). */
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "ID materi tidak valid" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const checked = validateMateri(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  const { data, error } = await getSupabaseAdmin()
    .from("reseller_materials")
    .update({ ...checked.value, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[OPS-MATERI] Gagal mengubah:", error.message);
    return NextResponse.json({ error: "Gagal menyimpan materi" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Materi tidak ditemukan" }, { status: 404 });
  return NextResponse.json({ ok: true, data });
}

/** Hapus satu materi (permanen). Video di YouTube tidak ikut terhapus. */
export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "ID materi tidak valid" }, { status: 400 });

  const { error } = await getSupabaseAdmin().from("reseller_materials").delete().eq("id", id);
  if (error) {
    console.error("[OPS-MATERI] Gagal menghapus:", error.message);
    return NextResponse.json({ error: "Gagal menghapus materi" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
