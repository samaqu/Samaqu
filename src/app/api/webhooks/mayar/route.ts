import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getMayarConfig, getMayarInvoice, getMayarTransaction } from "@/lib/mayar";
import { notifyCustomerOrderPaid } from "@/lib/fonnte";
import { sendOnce } from "@/lib/order-notify";
import { syncCommissionStatus } from "@/lib/affiliate/commission";

/**
 * POST /api/webhooks/mayar — notifikasi pembayaran dari Mayar.
 *
 * Keamanan DUA LAPIS:
 * 1. **Token** — Mayar mengirim "Webhook Token" (dashboard → Integration → Webhook) di header
 *    `x-callback-token` (atau sebagai query `?token=`). Dibandingkan timing-safe.
 * 2. **Verifikasi ulang ke API Mayar** — isi body webhook TIDAK dipercaya. Setelah token cocok,
 *    status pembayaran diambil ulang dari `GET /invoices/{id}` (atau `/transactions/{id}`), dan
 *    hanya kalau statusnya benar-benar `paid` pesanan ditandai lunas. Ini penting karena Mayar
 *    tidak menandatangani body-nya.
 *
 * Idempoten: pesanan yang sudah `paid_at` dilewati (webhook bisa dikirim berulang).
 */

/** Status Mayar yang berarti uang sudah masuk. */
const PAID_STATUSES = new Set(["paid", "settlement", "success"]);

function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

interface MayarWebhookBody {
  event?: string;
  data?: Record<string, unknown> | null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  try {
    const raw = await request.text();
    let body: MayarWebhookBody = {};
    try {
      body = JSON.parse(raw) as MayarWebhookBody;
    } catch {
      return NextResponse.json({ error: "Body bukan JSON" }, { status: 400 });
    }

    const data = (body.data ?? {}) as Record<string, unknown>;
    const config = await getMayarConfig();

    // ── Lapis 1: token webhook WAJIB cocok ──
    if (!config.webhookToken) {
      console.error("[MAYAR] Webhook Token belum diatur — request ditolak.");
      return NextResponse.json({ error: "Webhook token belum dikonfigurasi" }, { status: 401 });
    }

    const headerToken =
      request.headers.get("x-callback-token") ||
      request.headers.get("x-mayar-token") ||
      request.headers.get("x-webhook-token") ||
      "";
    const queryToken = new URL(request.url).searchParams.get("token") ?? "";
    const provided = headerToken || queryToken;
    if (!provided || !safeEqual(provided, config.webhookToken)) {
      console.warn("[MAYAR] Webhook ditolak: token tidak cocok.");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const event = asString(body.event);
    const invoiceId = asString(data.paymentLinkId) || asString(data.id);
    const transactionId = asString(data.transactionId) || asString(data.paymentLinkTransactionId);
    const extraOrder = asString((data.extraData as Record<string, unknown> | undefined)?.orderNumber);

    const supabaseAdmin = getSupabaseAdmin();

    // Cocokkan ke pesanan kita: utamakan nomor pesanan dari extraData, lalu id invoice/transaksi.
    let order: { id: string; order_number: string; status: string; customer_name: string | null; customer_whatsapp: string | null; payment_ref: string | null; paid_at: string | null; total: number | null } | null = null;

    if (extraOrder) {
      const { data: byNumber } = await supabaseAdmin
        .from("orders")
        .select("id, order_number, status, customer_name, customer_whatsapp, payment_ref, paid_at, total")
        .eq("order_number", extraOrder)
        .maybeSingle();
      order = byNumber ?? null;
    }
    if (!order) {
      const ids = [invoiceId, transactionId].filter(Boolean);
      if (ids.length === 0) {
        console.warn("[MAYAR] Webhook tanpa id yang bisa dicocokkan:", event);
        return NextResponse.json({ ignored: true });
      }
      const { data: rows } = await supabaseAdmin
        .from("orders")
        .select("id, order_number, status, customer_name, customer_whatsapp, payment_ref, paid_at, total")
        .in("payment_ref", ids)
        .limit(1);
      order = rows?.[0] ?? null;
    }

    if (!order) {
      console.warn("[MAYAR] Webhook tidak cocok dengan pesanan mana pun:", event, invoiceId, transactionId);
      return NextResponse.json({ ignored: true });
    }
    if (order.paid_at) {
      return NextResponse.json({ success: true, alreadyPaid: true });
    }

    // ── Lapis 2: verifikasi ulang ke API Mayar (body tidak dipercaya) ──
    let verifiedPaid = false;
    let txId = transactionId;
    const refId = order.payment_ref || invoiceId;
    if (refId) {
      const inv = await getMayarInvoice(refId);
      // invoice detail menyimpan transactionId — dipakai membaca channel pembayaran.
      if (!txId) txId = asString(inv.data?.transactionId) || asString(inv.data?.transactions?.[0]?.id);
      const status = asString(inv.data?.status).toLowerCase();
      if (inv.ok && PAID_STATUSES.has(status)) verifiedPaid = true;
      else if (!inv.ok && txId) {
        const tx = await getMayarTransaction(txId);
        if (tx.ok && PAID_STATUSES.has(asString(tx.data?.status).toLowerCase())) verifiedPaid = true;
      }
    }

    if (!verifiedPaid) {
      console.warn("[MAYAR] Webhook diabaikan: status Mayar belum 'paid'.", order.order_number, event);
      return NextResponse.json({ ignored: true });
    }

    // Channel yang dipilih customer (QRIS/VA/e-wallet). Body webhook kadang membawanya,
    // kadang `null` — jadi cadangkan ke detail transaksi. Best-effort: gagal baca channel
    // tidak boleh menahan penandaan lunas.
    let channel = asString(data.paymentMethod).toLowerCase();
    if (!channel && txId) {
      const tx = await getMayarTransaction(txId);
      if (tx.ok) channel = asString(tx.data?.paymentMethod).toLowerCase();
    }

    // ── Tandai lunas (atomik: hanya proses pertama yang menang) ──
    // `paid_at is null` di WHERE membuat dua webhook paralel tidak bisa dua-duanya lolos.
    const paidAt = new Date().toISOString();
    const patch: Record<string, unknown> = { payment_status: "paid", paid_at: paidAt };
    if (order.status === "pending") patch.status = "diproses";
    if (channel) patch.payment_channel = channel;
    const { data: paidRows, error: updateError } = await supabaseAdmin
      .from("orders")
      .update(patch)
      .eq("id", order.id)
      .is("paid_at", null)
      .select("id");
    if (updateError) {
      console.error("[MAYAR] Gagal menandai pesanan lunas:", order.order_number, updateError);
      return NextResponse.json({ error: "Gagal menyimpan status pembayaran" }, { status: 500 });
    }
    if (!paidRows || paidRows.length === 0) {
      // Proses lain (webhook ulang / admin) sudah menandai lunas lebih dulu.
      return NextResponse.json({ success: true, alreadyPaid: true });
    }

    console.log("[MAYAR] Pembayaran diterima:", order.order_number, refId);

    // Kabari customer — klaim `paid_notified_at` memastikan pesan ini hanya terkirim sekali,
    // dan kegagalan Fonnte tidak pernah menggagalkan webhook.
    if (order.customer_whatsapp) {
      await sendOnce(order.id, "paid", "WA pembayaran diterima (Mayar)", () =>
        notifyCustomerOrderPaid({
          orderNumber: order.order_number,
          customerName: order.customer_name || "",
          customerWhatsapp: order.customer_whatsapp as string,
          total: Number(order.total) || 0,
        })
      );
    }

    // Komisi affiliate diselaraskan (pesanan lunas → komisi keluar dari masa "menunggu pembayaran").
    try {
      await syncCommissionStatus(supabaseAdmin, order.id, { actor: "mayar-webhook" });
    } catch (e) {
      console.error("[MAYAR] Gagal menyelaraskan komisi affiliate:", e);
    }

    return NextResponse.json({ success: true, orderNumber: order.order_number });
  } catch (e) {
    console.error("[MAYAR] Webhook error:", e);
    return NextResponse.json({ error: "Terjadi kesalahan server" }, { status: 500 });
  }
}
