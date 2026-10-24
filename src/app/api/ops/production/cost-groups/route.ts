import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ownerProductionGuard } from "@/lib/ops-auth";

/** Tambah pilihan kelompok biaya baru (khusus Owner). Baris resep lama tidak diubah. */
export async function POST(req: NextRequest) {
  const access = await ownerProductionGuard(req);
  if (!access.ok) return access.response;

  try {
    const body = await req.json();
    const name = String(body?.name || "").trim().replace(/\s+/g, " ");
    if (!name) return NextResponse.json({ error: "Nama kelompok wajib diisi." }, { status: 400 });
    if (name.length > 80) {
      return NextResponse.json({ error: "Nama kelompok maksimal 80 karakter." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("production_cost_groups")
      .insert({ name, created_by: access.email })
      .select("name")
      .maybeSingle();

    if (error) {
      if (error.code === "23505") return NextResponse.json({ name });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ name: data?.name || name }, { status: 201 });
  } catch (e) {
    console.error("[PRODUKSI] kelompok biaya POST:", e);
    return NextResponse.json({ error: "Gagal menambah kelompok biaya." }, { status: 500 });
  }
}
