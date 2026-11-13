import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, opsIdentity, unauthorized } from "@/lib/ops-auth";
import { sortMateri, validateMateri, type MateriRow } from "@/lib/reseller/materi";

export const dynamic = "force-dynamic";

const TABEL_BELUM_ADA = "Tabel materi belum dibuat di database (migrasi 20261114_reseller_materials.sql belum dijalankan).";

const isTabelBelumAda = (error: { code?: string; message?: string }) =>
  error.code === "42P01" || /reseller_materials/.test(error.message || "");

/** Semua materi (draft + terbit) untuk panel admin. */
export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const { data, error } = await getSupabaseAdmin().from("reseller_materials").select("*");
  if (error) {
    if (isTabelBelumAda(error)) return NextResponse.json({ data: [], belum_siap: true });
    console.error("[OPS-MATERI] Gagal memuat:", error.message);
    return NextResponse.json({ error: "Gagal memuat materi" }, { status: 500 });
  }
  return NextResponse.json({ data: sortMateri((data ?? []) as MateriRow[]) });
}

/** Tambah materi baru. */
export async function POST(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  const identity = await opsIdentity(req);

  const body = await req.json().catch(() => ({}));
  const checked = validateMateri(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  const { data, error } = await getSupabaseAdmin()
    .from("reseller_materials")
    .insert({ ...checked.value, created_by: identity?.email || "admin" })
    .select("*")
    .single();

  if (error) {
    if (isTabelBelumAda(error)) return NextResponse.json({ error: TABEL_BELUM_ADA }, { status: 500 });
    console.error("[OPS-MATERI] Gagal menambah:", error.message);
    return NextResponse.json({ error: "Gagal menyimpan materi" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, data });
}
