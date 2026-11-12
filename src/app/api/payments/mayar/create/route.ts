import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { createMayarInvoice, getMayarConfig, mayarMobile, mayarPlaceholderEmail, mayarReady } from "@/lib/mayar";
import { isPaymentMethodId } from "@/lib/payment-methods";

/**
 * POST /api/payments/mayar/create — buat link pembayaran Mayar untuk satu pesanan.
 * Body: { orderNumber }.
 *
 * Aturan:
 * - Hanya pemilik pesanan (sesi customer) yang boleh memanggil.
 * - Hanya pesanan `pending` yang memakai metode pembayaran bertipe `mayar`.
 * - **Idempoten**: kalau link sudah pernah dibuat, link yang sama dikembalikan — tidak membuat
 *   invoice dobel (Mayar menolak create duplikat dengan 429).
 */

/** Link bayar kedaluwarsa mengikuti batas auto-cancel pesanan (24 jam). */
const INVOICE_TTL_MS = 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    const { data: authData, error: authError } = token
      ? await supabaseAdmin.auth.getUser(token)
      : { data: { user: null }, error: null };
    const customerId = authData?.user?.id ?? null;
    if (authError || !customerId) {
      return NextResponse.json({ error: "Silakan masuk dulu untuk membayar pesanan." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const orderNumber = String(body?.orderNumber ?? "").trim();
    if (!orderNumber) {
      return NextResponse.json({ error: "Nomor pesanan wajib diisi" }, { status: 400 });
    }

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, status, customer_id, customer_name, customer_email, customer_whatsapp, total, payment_method, payment_ref, payment_url, paid_at"
      )
      .eq("order_number", orderNumber)
      .maybeSingle();

    // Pesanan milik orang lain dibalas 404, bukan 403 — supaya keberadaannya tidak bocor.
    if (!order || order.customer_id !== customerId) {
      return NextResponse.json({ error: "Pesanan tidak ditemukan" }, { status: 404 });
    }

    if (order.paid_at) {
      return NextResponse.json({ success: true, paid: true, url: order.payment_url ?? null });
    }
    if (order.status !== "pending") {
      return NextResponse.json({ error: "Pesanan ini sudah diproses admin." }, { status: 400 });
    }
    // Sudah pernah dibuat → pakai link yang sama.
    if (order.payment_ref && order.payment_url) {
      return NextResponse.json({ success: true, url: order.payment_url, invoiceId: order.payment_ref });
    }

    // Hanya untuk metode pembayaran bertipe "mayar" (pembayaran online).
    if (!isPaymentMethodId(order.payment_method)) {
      return NextResponse.json({ error: "Metode pembayaran pesanan ini bukan pembayaran online." }, { status: 400 });
    }
    const { data: method } = await supabaseAdmin
      .from("payment_methods")
      .select("method_type")
      .eq("id", order.payment_method)
      .maybeSingle();
    if (method?.method_type !== "mayar") {
      return NextResponse.json({ error: "Metode pembayaran pesanan ini bukan pembayaran online." }, { status: 400 });
    }

    const config = await getMayarConfig();
    if (!mayarReady(config)) {
      return NextResponse.json({ error: "Pembayaran online belum diaktifkan admin." }, { status: 400 });
    }

    const invoice = await createMayarInvoice({
      name: order.customer_name || "Pelanggan SAMAQU",
      email: order.customer_email || mayarPlaceholderEmail(order.order_number),
      mobile: mayarMobile(order.customer_whatsapp),
      amount: Number(order.total) || 0,
      description: `SAMAQU ${order.order_number}`,
      orderNumber: order.order_number,
      expiresAt: new Date(Date.now() + INVOICE_TTL_MS).toISOString(),
    });

    if (!invoice.ok || !invoice.data?.link) {
      return NextResponse.json({ error: invoice.error || "Gagal membuat link pembayaran." }, { status: 502 });
    }

    const { error: saveError } = await supabaseAdmin
      .from("orders")
      .update({
        payment_provider: "mayar",
        payment_ref: invoice.data.id,
        payment_url: invoice.data.link,
        payment_status: "unpaid",
      })
      .eq("id", order.id);
    if (saveError) console.error("[MAYAR] Gagal menyimpan link pembayaran:", saveError);

    return NextResponse.json({ success: true, url: invoice.data.link, invoiceId: invoice.data.id });
  } catch (e) {
    console.error("[MAYAR] create invoice error:", e);
    return NextResponse.json({ error: "Terjadi kesalahan server" }, { status: 500 });
  }
}
