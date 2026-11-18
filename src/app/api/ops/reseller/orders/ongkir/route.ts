import { NextRequest, NextResponse } from "next/server";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";
import { calcResellerOngkir } from "@/lib/reseller/ongkir";

/**
 * Cek ongkir J&T untuk form "Buat Pesanan" admin — fungsi hitung yang sama dengan portal reseller
 * (`lib/reseller/ongkir.ts`). Body: { city, district, items?, weight? }. Hanya membaca tarif.
 */
export async function POST(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const result = await calcResellerOngkir(body);
  return NextResponse.json(result.body, { status: result.status });
}
