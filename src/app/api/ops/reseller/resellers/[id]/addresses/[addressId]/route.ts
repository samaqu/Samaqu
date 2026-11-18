import { NextRequest, NextResponse } from "next/server";
import { isOpsAdmin, opsIdentity, unauthorized } from "@/lib/ops-auth";
import { parseAddressInput } from "@/lib/reseller/addresses";
import { deleteResellerAddress, saveResellerAddress, setDefaultResellerAddress } from "@/lib/reseller/addresses-server";

type Ctx = { params: Promise<{ id: string; addressId: string }> };

/**
 * Ubah satu alamat tersimpan.
 *   PATCH { action: "set_default" }          -> jadikan alamat utama
 *   PATCH { label, recipient_name, ... }     -> ubah isi alamat (status utama tidak dicabut; untuk
 *                                               memindahkan utama, jadikan alamat lain utama)
 *   DELETE                                   -> hapus (bila yang utama, alamat tertua yang tersisa jadi utama)
 */
export async function PATCH(req: NextRequest, context: Ctx) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  const identity = await opsIdentity(req);
  const { id, addressId } = await context.params;

  const body = await req.json().catch(() => null);
  if (body && typeof body === "object" && (body as Record<string, unknown>).action === "set_default") {
    const result = await setDefaultResellerAddress(id, addressId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, data: result.data });
  }

  const parsed = parseAddressInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const result = await saveResellerAddress(id, addressId, parsed.value, identity?.email || "admin");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, data: result.data });
}

export async function DELETE(req: NextRequest, context: Ctx) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  const { id, addressId } = await context.params;
  const result = await deleteResellerAddress(id, addressId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, ...result.data });
}
