import { NextRequest, NextResponse } from "next/server";
import { resellerSession, resellerUnauthorized } from "@/lib/reseller/auth";
import { uploadShortfallProof } from "@/lib/reseller/orders";

/**
 * Upload bukti transfer KEKURANGAN saldo untuk satu pesanan milik reseller.
 * File diunggah lebih dulu ke R2 private (presigned PUT), endpoint ini hanya
 * menerima object key-nya. `proof_url` lama tetap didukung.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ orderNumber: string }> }
) {
  const session = await resellerSession(req);
  if (!session) return resellerUnauthorized();

  const { orderNumber } = await context.params;
  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const proofKey = typeof body.proof_key === "string" ? body.proof_key : "";
  const proofUrl = typeof body.proof_url === "string" ? body.proof_url : "";
  const paymentMethod = body.payment_method === "qris" ? "qris" : "bsi";

  const result = await uploadShortfallProof(
    session.reseller.id,
    orderNumber,
    { key: proofKey, url: proofUrl },
    paymentMethod,
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
