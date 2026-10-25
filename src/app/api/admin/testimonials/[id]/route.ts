import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin } from "@/lib/ops-auth";

/**
 * Setujui / tolak ulasan.
 *
 * PATCH /api/admin/testimonials/[id]
 * body: { action: "approve" | "reject", note?: string }
 *
 * Menyetujui membuat ulasan tampil di halaman publik. Menolak menyembunyikannya
 * dan menyimpan alasan (opsional) untuk dilihat pelanggan di akunnya.
 */

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await isOpsAdmin(req))) {
    return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  }

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "ID ulasan wajib." }, { status: 400 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Data tidak valid." }, { status: 400 });
  }

  const action = String(body?.action || "");
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "Aksi harus approve atau reject." }, { status: 400 });
  }

  const note = String(body?.note || "").trim().slice(0, 500);
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("testimonials")
    .update({
      status: action === "approve" ? "published" : "rejected",
      admin_note: note || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id, status, admin_note, updated_at")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Ulasan tidak ditemukan." }, { status: 404 });

  return NextResponse.json({ review: data });
}
