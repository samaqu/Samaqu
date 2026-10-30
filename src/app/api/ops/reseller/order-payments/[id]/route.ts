import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, opsIdentity, unauthorized } from "@/lib/ops-auth";
import { cancelOrderCompletely } from "@/lib/cancel-order";
import { notifyResellerOrderPaid, notifyResellerShortfallRejected } from "@/lib/reseller/notify";

/**
 * Konfirmasi / tolak bukti pembayaran KEKURANGAN saldo pesanan reseller.
 *
 * - Approve → pesanan jadi `diproses` + lunas (`paid_at`), reseller diberi tahu.
 * - Reject  → pesanan dibatalkan lewat jalur resmi `cancelOrderCompletely`
 *   (stok & saldo kembali otomatis; notifikasi pembatalan ke reseller
 *   dikirim oleh jalur itu).
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  const identity = await opsIdentity(req);
  const actor = identity?.email || "admin";

  const { id } = await context.params;
  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const action = String(body.action ?? "").trim();
  const reason = String(body.reason ?? "").trim();

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "Aksi tidak dikenal" }, { status: 400 });
  }
  if (action === "reject" && !reason) {
    return NextResponse.json({ error: "Alasan penolakan wajib diisi" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: payment } = await supabase
    .from("reseller_order_payments")
    .select("id, order_id, reseller_id, amount, status")
    .eq("id", id)
    .maybeSingle();

  if (!payment) return NextResponse.json({ error: "Pembayaran tidak ditemukan" }, { status: 404 });
  if (payment.status !== "pending") {
    return NextResponse.json({ error: "Pembayaran sudah diproses sebelumnya" }, { status: 400 });
  }

  const { data: order } = await supabase
    .from("orders")
    .select("id, order_number, status, awb_no, jnt_order_id, stock_reserved, customer_name, customer_whatsapp")
    .eq("id", payment.order_id)
    .maybeSingle();

  if (!order) return NextResponse.json({ error: "Pesanan tidak ditemukan" }, { status: 404 });

  const now = new Date().toISOString();

  if (action === "approve") {
    const { error: paymentError } = await supabase
      .from("reseller_order_payments")
      .update({ status: "approved", reviewed_at: now, reviewed_by: actor })
      .eq("id", id);
    const { error: orderError } = await supabase
      .from("orders")
      .update({
        status: "diproses",
        payment_status: "paid",
        paid_at: now,
        reseller_shortfall_status: "approved",
        updated_at: now,
      })
      .eq("id", order.id);

    if (paymentError || orderError) {
      console.error("[OPS-RESELLER] Approve kekurangan gagal:", paymentError?.message || orderError?.message);
      return NextResponse.json({ error: "Gagal memproses pembayaran" }, { status: 500 });
    }

    await notifyResellerOrderPaid(String(payment.reseller_id), String(order.order_number));

    return NextResponse.json({ ok: true });
  }

  // Reject: tandai dulu, lalu batal lewat jalur resmi (stok & saldo kembali).
  await supabase
    .from("reseller_order_payments")
    .update({ status: "rejected", reviewed_at: now, reviewed_by: actor, reject_reason: reason })
    .eq("id", id);
  await supabase
    .from("orders")
    .update({ reseller_shortfall_status: "rejected", updated_at: now })
    .eq("id", order.id);

  const cancel = await cancelOrderCompletely(
    {
      id: String(order.id),
      order_number: String(order.order_number),
      status: String(order.status),
      awb_no: (order.awb_no as string | null) ?? null,
      jnt_order_id: (order.jnt_order_id as string | null) ?? null,
      stock_reserved: order.stock_reserved === true,
      customer_name: (order.customer_name as string | null) ?? null,
      customer_whatsapp: (order.customer_whatsapp as string | null) ?? null,
    },
    `Pembayaran kekurangan ditolak: ${reason}`
  );

  if (!cancel.success) {
    return NextResponse.json(
      { error: `Pembayaran ditolak, tetapi pembatalan pesanan gagal: ${cancel.message}` },
      { status: 500 }
    );
  }

  await notifyResellerShortfallRejected(
    String(payment.reseller_id),
    String(order.order_number),
    reason
  );

  return NextResponse.json({ ok: true, cancelled: true });
}
