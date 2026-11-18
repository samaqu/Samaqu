import { NextRequest, NextResponse } from "next/server";
import { resellerSession, resellerUnauthorized } from "@/lib/reseller/auth";
import { calcResellerOngkir } from "@/lib/reseller/ongkir";

/**
 * Cek ongkir J&T untuk pesanan reseller — memakai fungsi tarif J&T yang
 * sama dengan checkout website. Hitungannya ada di `lib/reseller/ongkir.ts`
 * (dipakai juga oleh admin); route ini hanya memeriksa sesi reseller.
 *
 * Body: { city, district, items?, weight? }.
 */
export async function POST(req: NextRequest) {
  const session = await resellerSession(req);
  if (!session) return resellerUnauthorized();

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const result = await calcResellerOngkir(body);
  return NextResponse.json(result.body, { status: result.status });
}
