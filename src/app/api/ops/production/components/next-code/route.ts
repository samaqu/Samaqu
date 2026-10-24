import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { productionGuard } from "@/lib/ops-auth";
import { nextComponentCode } from "@/lib/produksi-server";

/** Kode komponen otomatis sesuai prefix kategori (masih bisa diedit di form). */
export async function GET(req: NextRequest) {
  const access = await productionGuard(req);
  if (!access.ok) return access.response;

  const category = String(new URL(req.url).searchParams.get("category") || "").trim();
  if (!category) return NextResponse.json({ error: "Kategori wajib diisi." }, { status: 400 });

  const code = await nextComponentCode(getSupabaseAdmin(), category);
  return NextResponse.json({ code });
}
