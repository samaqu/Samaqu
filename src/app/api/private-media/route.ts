import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { createR2PrivateDownloadUrl, r2PrivateConfigured } from "@/lib/r2";
import { verifyPrivateProofUrl } from "@/lib/private-media";

export const runtime = "nodejs";

/**
 * Tukar URL bertanda tangan (dibuat endpoint reseller/admin yang sudah
 * terautentikasi) menjadi presigned GET R2 selama 5 menit.
 */
export async function GET(req: NextRequest) {
  if (!r2PrivateConfigured()) {
    return new NextResponse("Private media belum dikonfigurasi", { status: 503 });
  }

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") || "";
  const id = url.searchParams.get("id") || "";
  const exp = Number(url.searchParams.get("exp") || 0);
  const sig = url.searchParams.get("sig") || "";

  if (kind !== "topup" && kind !== "order-payment") {
    return new NextResponse("Tidak diizinkan", { status: 403 });
  }
  if (!verifyPrivateProofUrl(kind, id, exp, sig)) {
    return new NextResponse("Tidak diizinkan", { status: 403 });
  }

  const table = kind === "topup" ? "reseller_topups" : "reseller_order_payments";
  const { data, error } = await getSupabaseAdmin()
    .from(table)
    .select("proof_key")
    .eq("id", id)
    .maybeSingle();

  if (error || !data?.proof_key) {
    return new NextResponse("Bukti tidak ditemukan", { status: 404 });
  }

  const { downloadUrl } = createR2PrivateDownloadUrl(String(data.proof_key), 300);
  return NextResponse.redirect(downloadUrl, 302);
}
