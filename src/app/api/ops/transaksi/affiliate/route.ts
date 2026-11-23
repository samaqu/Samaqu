import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";
import { resolveManualAttribution } from "@/lib/affiliate/manual-attribution";

/**
 * GET /api/ops/transaksi/affiliate?code=SAM-AF-00003&phone=0813...
 *
 * Cek kode affiliate untuk isian "Kode affiliate" di form Transaksi: kode valid dan aktif? Siapa pemiliknya?
 * Kalau nomor HP pembeli diberikan, aturan pembelian sendiri ikut diperiksa. Hanya membaca.
 * Aturan sama dengan yang dipakai saat pesanan disimpan (lib/affiliate/manual-attribution.ts).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  const sp = new URL(req.url).searchParams;
  const code = String(sp.get("code") || "").trim();
  if (!code) return NextResponse.json({ ok: false, error: "Kode affiliate kosong." }, { headers: { "Cache-Control": "no-store, private" } });

  const result = await resolveManualAttribution(getSupabaseAdmin(), code, { phone: sp.get("phone") });
  const headers = { "Cache-Control": "no-store, private" };
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { headers });
  return NextResponse.json({ ok: true, code: result.code, name: result.name, selfAllowed: result.selfAllowed }, { headers });
}
