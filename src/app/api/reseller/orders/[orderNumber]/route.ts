import { NextRequest, NextResponse } from "next/server";
import { resellerSession, resellerUnauthorized } from "@/lib/reseller/auth";
import { getResellerOrderDetail } from "@/lib/reseller/orders";

/** Detail satu pesanan milik reseller sendiri (item, resi, tracking). */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ orderNumber: string }> }
) {
  const session = await resellerSession(req);
  if (!session) return resellerUnauthorized();

  const { orderNumber } = await context.params;
  const order = await getResellerOrderDetail(session.reseller.id, orderNumber);
  if (!order) {
    return NextResponse.json({ error: "Pesanan tidak ditemukan" }, { status: 404 });
  }

  return NextResponse.json({ data: order });
}
