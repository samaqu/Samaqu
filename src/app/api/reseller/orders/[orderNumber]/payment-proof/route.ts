import { NextRequest, NextResponse } from "next/server";
import { resellerSession, resellerUnauthorized } from "@/lib/reseller/auth";
import { uploadShortfallProof } from "@/lib/reseller/orders";

/**
 * Upload bukti transfer KEKURANGAN saldo untuk satu pesanan milik reseller.
 * File diunggah lebih dulu ke Cloudinary (mekanisme upload bersama),
 * endpoint ini hanya menerima URL-nya.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ orderNumber: string }> }
) {
  const session = await resellerSession(req);
  if (!session) return resellerUnauthorized();

  const { orderNumber } = await context.params;
  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const proofUrl = typeof body.proof_url === "string" ? body.proof_url : "";
  const paymentMethod = body.payment_method === "qris" ? "qris" : "bsi";

  const result = await uploadShortfallProof(session.reseller.id, orderNumber, proofUrl, paymentMethod);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
