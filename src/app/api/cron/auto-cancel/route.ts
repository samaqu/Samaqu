import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { cancelOrderCompletely } from "@/lib/cancel-order";
import { notifyCustomerPaymentReminder, paymentInstructionFrom } from "@/lib/fonnte";
import { claimOrderNotification } from "@/lib/order-notify";
import { fetchOrderPaymentMethodRow } from "@/lib/payment-methods";
import { validMayarPaymentUrl } from "@/lib/mayar";
import { RESELLER_ORDER_PREFIX, LEGACY_RESELLER_ORDER_PREFIX } from "@/lib/reseller/order-number";

/**
 * Cron pembayaran: **reminder** lalu **auto-cancel**.
 * GET /api/cron/auto-cancel — dipanggil penjadwal eksternal (header `Authorization: Bearer $CRON_SECRET`).
 *
 * 1. REMINDER (jendela 20–24 jam sejak pesanan dibuat)
 *    Auto-cancel juga mengenai usia 24 jam, jadi reminder harus keluar SEBELUM itu. Jendela 4 jam
 *    dipilih supaya penjadwal yang jalan tiap jam selalu punya beberapa kali kesempatan sebelum
 *    pesanan benar-benar dibatalkan — dan pesanan yang sudah lewat 24 jam tidak diingatkan lagi.
 *    Hanya untuk pesanan `pending` yang belum dibayar, bukan COD, dan belum pernah diingatkan
 *    (klaim atomik `reminded_at`, jadi cron yang jalan berulang tetap mengirim satu kali).
 *    Link Mayar diverifikasi dulu ke API: kalau sudah lunas/kedaluwarsa, link TIDAK dikirim.
 *
 * 2. AUTO-CANCEL (lewat 24 jam)
 *    Memakai jalur bersama `cancelOrderCompletely()`: kalau pesanan ternyata masih memegang resi
 *    J&T (mis. statusnya pernah ditarik balik ke `pending` dari chip admin), resinya di-void dulu
 *    baru status jadi `dibatalkan` — kalau J&T menolak, pesanan dilewati supaya resi aktif tidak
 *    menggantung. Stok dikembalikan untuk pesanan yang benar-benar memotongnya (penanda
 *    `orders.stock_reserved`), baik checkout website (`SMQ-`) maupun Open Order (`CYO-`).
 */

/** Batas jumlah reminder per eksekusi cron — supaya satu kali jalan tidak menembak terlalu banyak. */
const REMINDER_LIMIT = 30;

export async function GET(request: NextRequest) {
  // Verify cron secret (penjadwal mengirim header Authorization: Bearer $CRON_SECRET)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  // Kalau CRON_SECRET kosong, route DITOLAK (bukan dibiarkan publik) — supaya tidak ada yang bisa
  // memicu reminder WA massal / auto-cancel tanpa kredensial.
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  /* ── 1. Reminder pembayaran (20–23 jam) ── */
  // Jendela berhenti di 23 jam, bukan 24: memberi jarak 1 jam dari auto-cancel sehingga tidak ada
  // pesanan yang diingatkan lalu langsung dibatalkan pada eksekusi yang sama. Lebarnya 3 jam
  // supaya penjadwal yang jalan tiap jam selalu punya beberapa kali kesempatan.
  const windowStart = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();

  const { data: pendingOrders } = await supabase
    .from("orders")
    .select(
      "id, order_number, customer_name, customer_whatsapp, total, payment_method, payment_url, payment_ref"
    )
    .eq("status", "pending")
    .is("paid_at", null)
    // Hanya pesanan website (`SMQ-`) & Open Order (`CYO-`). Transaksi manual dari ops/admin
    // bernomor `OPS-…` dan boleh berstatus pending ("Belum Lunas") — itu urusan admin, jangan
    // pernah diingatkan atau dibatalkan otomatis oleh cron.
    .or("order_number.like.SMQ-%,order_number.like.CYO-%")
    .is("reminded_at", null)
    .gt("created_at", windowStart)
    .lt("created_at", windowEnd)
    .limit(REMINDER_LIMIT);

  let reminded = 0;
  let remindErrors = 0;

  for (const order of pendingOrders ?? []) {
    try {
      const methodRow = await fetchOrderPaymentMethodRow(order.payment_method);
      const paymentMethod = methodRow ? paymentInstructionFrom(methodRow) : null;

      // COD tidak butuh pembayaran — tidak boleh diingatkan untuk transfer.
      if (paymentMethod?.type === "cod") continue;
      if (!order.customer_whatsapp) continue;

      // Klaim dulu: sekaligus memastikan statusnya MASIH `pending` dan belum dibayar saat detik
      // ini (kalau admin mengubah status di sela-sela, klaim gagal dan pesan tidak dikirim).
      const claimed = await claimOrderNotification(order.id, "reminded", {
        status: "pending",
        requireUnpaid: true,
      });
      if (!claimed) continue;

      // Link Mayar hanya dipakai kalau masih berlaku; kalau tidak, pesan jatuh ke instruksi
      // "hubungi admin" (lihat paymentInstructionBlock) — tidak pernah mengirim link mati.
      const paymentUrl =
        paymentMethod?.type === "mayar"
          ? await validMayarPaymentUrl(order.payment_ref, order.payment_url)
          : null;

      const sent = await notifyCustomerPaymentReminder({
        orderNumber: order.order_number,
        customerName: order.customer_name || "",
        customerWhatsapp: order.customer_whatsapp,
        total: Number(order.total) || 0,
        paymentMethod,
        paymentUrl,
      });

      if (sent) {
        reminded++;
        console.log("[PAYMENT-REMINDER] Reminder terkirim:", order.order_number);
      } else {
        remindErrors++;
        console.error("[PAYMENT-REMINDER] Reminder gagal terkirim:", order.order_number);
      }
    } catch (e) {
      remindErrors++;
      console.error("[PAYMENT-REMINDER] Unexpected error:", order.order_number, e);
    }
  }

  /* ── 2. Auto-cancel pesanan yang melewati batas pembayaran (24 jam) ── */
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: expiredOrders, error: fetchError } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, awb_no, jnt_order_id, stock_reserved, customer_name, customer_whatsapp"
    )
    .eq("status", "pending")
    .is("paid_at", null)
    // Sama seperti reminder: transaksi manual `OPS-…` ("Belum Lunas") tidak ikut dibatalkan.
    // Pesanan reseller (`EP-…` baru / `RSL-…` lama) yang masih pending = kekurangan belum
    // dibayar; ikut dibatalkan setelah 24 jam lewat jalur resmi (saldo & stok kembali).
    .or(
      `order_number.like.SMQ-%,order_number.like.CYO-%,order_number.like.${RESELLER_ORDER_PREFIX}%,order_number.like.${LEGACY_RESELLER_ORDER_PREFIX}%`
    )
    .lt("created_at", cutoff);

  if (fetchError) {
    console.error("[AUTO-CANCEL] Fetch error:", fetchError);
    return NextResponse.json(
      { error: "Gagal mengambil pesanan", reminded, remindErrors },
      { status: 500 }
    );
  }

  if (!expiredOrders || expiredOrders.length === 0) {
    return NextResponse.json({ reminded, remindErrors, cancelled: 0, errors: 0, total: 0 });
  }

  let cancelled = 0;
  let errors = 0;

  for (const order of expiredOrders) {
    try {
      const result = await cancelOrderCompletely(order, "Dibatalkan otomatis (belum dibayar 24 jam)");

      if (result.success) {
        cancelled++;
        console.log("[AUTO-CANCEL] Cancelled:", order.order_number);
      } else {
        console.error("[AUTO-CANCEL] Gagal membatalkan:", order.order_number, result.stage, result.message);
        errors++;
      }
    } catch (e) {
      console.error("[AUTO-CANCEL] Unexpected error:", order.order_number, e);
      errors++;
    }
  }

  return NextResponse.json({ reminded, remindErrors, cancelled, errors, total: expiredOrders.length });
}
