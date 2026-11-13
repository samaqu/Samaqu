import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { resellerSession, resellerUnauthorized } from "@/lib/reseller/auth";
import { sortMateri, type MateriRow } from "@/lib/reseller/materi";

export const dynamic = "force-dynamic";

/**
 * Materi untuk reseller: HANYA yang berstatus `terbit`. Draft tidak pernah keluar dari endpoint ini.
 * Kalau tabel belum dibuat (migrasi 20261114_reseller_materials.sql belum dijalankan) hasilnya daftar
 * kosong dengan penanda `belum_siap`, bukan error, supaya portal tetap berjalan.
 */
export async function GET(req: NextRequest) {
  const session = await resellerSession(req);
  if (!session) return resellerUnauthorized();

  const { data, error } = await getSupabaseAdmin()
    .from("reseller_materials")
    .select("id, category, type, title, summary, body, video_url, images, sort_order, status, created_at, updated_at")
    .eq("status", "terbit");

  if (error) {
    const tabelBelumAda = error.code === "42P01" || /reseller_materials/.test(error.message || "");
    if (tabelBelumAda) return NextResponse.json({ data: [], belum_siap: true });
    console.error("[RESELLER-MATERI] Gagal memuat materi:", error.message);
    return NextResponse.json({ error: "Gagal memuat materi" }, { status: 500 });
  }

  return NextResponse.json({ data: sortMateri((data ?? []) as MateriRow[]) });
}
