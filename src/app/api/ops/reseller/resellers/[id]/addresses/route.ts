import { NextRequest, NextResponse } from "next/server";
import { isOpsAdmin, opsIdentity, unauthorized } from "@/lib/ops-auth";
import { parseAddressInput } from "@/lib/reseller/addresses";
import { listResellerAddresses, saveResellerAddress } from "@/lib/reseller/addresses-server";

/**
 * Buku alamat satu reseller (admin ops & panel admin).
 *   GET  -> daftar alamat (utama dulu)
 *   POST -> tambah alamat. Alamat pertama otomatis jadi alamat utama; `make_default: true` menjadikannya utama.
 * Admin saja; alamat tersimpan hanya mengisi form pesanan, tidak mengubah pesanan yang sudah ada.
 */
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  const { id } = await context.params;
  const result = await listResellerAddresses(id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ data: result.data });
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  const identity = await opsIdentity(req);
  const { id } = await context.params;

  const body = await req.json().catch(() => null);
  const parsed = parseAddressInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const result = await saveResellerAddress(id, null, parsed.value, identity?.email || "admin");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, data: result.data });
}
