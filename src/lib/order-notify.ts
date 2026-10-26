import { getSupabaseAdmin } from "./supabase-admin";

/**
 * Klaim "sekali pakai" untuk notifikasi WhatsApp pesanan.
 *
 * Masalah yang diselesaikan: satu peristiwa bisa diproses bersamaan oleh webhook Mayar, cron,
 * dan aksi admin — kalau pengirimannya dikunci hanya dengan `if (!order.sudahDikirim)` di kode,
 * dua proses bisa sama-sama lolos dan customer menerima pesan dobel.
 *
 * Solusinya satu UPDATE bersyarat di database (atomik):
 *   update orders set <kolom> = now() where id = ? and <kolom> is null returning id
 * Hanya proses yang benar-benar mengubah baris (pemenang klaim) yang boleh mengirim pesan.
 *
 * Kolom penanda dibuat di `supabase/order-notify-flags.sql`.
 */
export type NotifyEvent =
  | "created"
  | "paid"
  | "shipped"
  | "delivered"
  | "reminded"
  | "cancelled"
  | "review_reminder";

const CLAIM_COLUMN: Record<NotifyEvent, string> = {
  created: "notify_created_at",
  paid: "paid_notified_at",
  shipped: "shipped_notified_at",
  delivered: "delivered_notified_at",
  reminded: "reminded_at",
  cancelled: "cancelled_notified_at",
  review_reminder: "review_reminded_at",
};

export interface ClaimOptions {
  /** Batasi klaim: status pesanan harus masih salah satu nilai ini (mis. `pending`). */
  status?: string[] | string;
  /** Batasi klaim: pesanan belum dibayar (`paid_at` masih kosong). */
  requireUnpaid?: boolean;
}

/**
 * Coba klaim satu peristiwa notifikasi untuk sebuah pesanan.
 * Mengembalikan `true` HANYA untuk pemanggil yang menang — dialah yang boleh mengirim.
 * Kegagalan database mengembalikan `false` (lebih baik tidak mengirim daripada dobel).
 */
export async function claimOrderNotification(
  orderId: string,
  event: NotifyEvent,
  options?: ClaimOptions
): Promise<boolean> {
  const column = CLAIM_COLUMN[event];
  if (!orderId) return false;

  try {
    let query = getSupabaseAdmin()
      .from("orders")
      .update({ [column]: new Date().toISOString() })
      .eq("id", orderId)
      .is(column, null);

    if (options?.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status];
      query = query.in("status", statuses);
    }
    if (options?.requireUnpaid) query = query.is("paid_at", null);

    const { data, error } = await query.select("id");
    if (error) {
      console.error("[NOTIFY] Klaim gagal:", event, error.message);
      return false;
    }
    return (data?.length ?? 0) > 0;
  } catch (e) {
    console.error("[NOTIFY] Klaim error:", event, e);
    return false;
  }
}

/** Catat hasil kirim notifikasi "dikirim" — kolomnya sudah ada sejak fitur resi. */
export async function recordShippedNotifyStatus(orderId: string, sent: boolean): Promise<void> {
  try {
    const { error } = await getSupabaseAdmin()
      .from("orders")
      .update({ shipped_notify_status: sent ? "sent" : "failed" })
      .eq("id", orderId);
    if (error) console.error("[NOTIFY] Gagal menyimpan status notifikasi kirim:", error.message);
  } catch (e) {
    console.error("[NOTIFY] Gagal menyimpan status notifikasi kirim:", e);
  }
}

/**
 * Klaim lalu kirim. Klaim TIDAK dilepas kalau pengiriman gagal — itu disengaja agar pesan
 * tidak pernah dobel; kegagalannya dicatat di log supaya bisa ditindaklanjuti admin.
 */
export async function sendOnce(
  orderId: string,
  event: NotifyEvent,
  label: string,
  send: () => Promise<boolean>,
  options?: ClaimOptions
): Promise<boolean> {
  if (!(await claimOrderNotification(orderId, event, options))) return false;

  let sent = false;
  try {
    sent = await send();
  } catch (e) {
    console.error(`[NOTIFY] ${label} error saat mengirim:`, orderId, e);
  }

  if (sent) console.log(`[NOTIFY] ${label} terkirim:`, orderId);
  else console.error(`[NOTIFY] ${label} GAGAL terkirim:`, orderId);

  return sent;
}
