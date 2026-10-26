import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { notifyCustomerReviewReminder } from "@/lib/fonnte";
import { sendOnce } from "@/lib/order-notify";

/**
 * Cron pengingat ulasan.
 * GET /api/cron/review-reminder — dipanggil penjadwal eksternal
 * (header `Authorization: Bearer $CRON_SECRET`).
 *
 * Aturan:
 *  - pesanan `selesai`, minimal 2 hari sejak paket diterima;
 *  - "waktu diterima" memakai `delivered_notified_at`. Kalau kosong (pesanan lama,
 *    sebelum kolom itu ada / WA paket diterima tidak pernah diklaim), dipakai
 *    `updated_at` sebagai perkiraan — jadi backlog pesanan lama tetap dapat pengingat;
 *  - belum pernah diingatkan (`review_reminded_at` kosong) — klaim atomik di
 *    `sendOnce`, jadi cron berulang tetap mengirim satu kali;
 *  - pesanan yang sudah punya ulasan (status apa pun, termasuk ditolak) dilewati;
 *  - nomor WhatsApp kosong dilewati;
 *  - maksimal 40 pesan per eksekusi supaya satu kali jalan tidak menembak terlalu banyak.
 *
 * Catatan: `delivered_notified_at` juga terisi kalau WA paket diterima gagal (klaim tidak
 * dilepas), jadi kolom itu dipakai sebagai penanda "sudah sampai", bukan status kirim WA.
 */

const DELAY_DAYS = 2;
const LIMIT = 40;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - DELAY_DAYS * 86_400_000).toISOString();
  const COLUMNS = "id, order_number, customer_name, customer_whatsapp, delivered_notified_at, updated_at";

  // Dua kelompok: yang punya jam terima (WA paket diterima sudah diklaim) dan pesanan lama
  // yang belum punya kolom itu — untuk yang lama, `updated_at` dipakai sebagai perkiraan.
  const [delivered, legacy] = await Promise.all([
    supabase
      .from("orders")
      .select(COLUMNS)
      .eq("status", "selesai")
      .is("review_reminded_at", null)
      .not("delivered_notified_at", "is", null)
      .lte("delivered_notified_at", cutoff)
      .order("delivered_notified_at", { ascending: true })
      .limit(LIMIT),
    supabase
      .from("orders")
      .select(COLUMNS)
      .eq("status", "selesai")
      .is("review_reminded_at", null)
      .is("delivered_notified_at", null)
      .lte("updated_at", cutoff)
      .order("updated_at", { ascending: true })
      .limit(LIMIT),
  ]);

  const error = delivered.error || legacy.error;
  if (error) {
    // Kolom `review_reminded_at` belum ada (migrasi belum dijalankan) → jangan kirim apa pun.
    console.error("[REVIEW-REMINDER] Gagal membaca pesanan:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const merged = new Map<string, any>();
  for (const row of [...(delivered.data || []), ...(legacy.data || [])]) {
    const key = String(row.id);
    if (!merged.has(key)) merged.set(key, row);
  }

  // Urutkan dari yang paling lama diterima/selesai, lalu batasi per eksekusi.
  const orders = [...merged.values()]
    .sort((a, b) =>
      String(a.delivered_notified_at || a.updated_at || "").localeCompare(
        String(b.delivered_notified_at || b.updated_at || ""),
      ),
    )
    .slice(0, LIMIT);

  if (orders.length === 0) {
    return NextResponse.json({ scanned: 0, sent: 0, skipped: 0, failed: 0 });
  }

  const ids = orders.map((order) => String(order.id));
  const { data: reviews } = await supabase
    .from("testimonials")
    .select("order_id")
    .in("order_id", ids);
  const reviewed = new Set((reviews || []).map((row) => String((row as any).order_id || "")));

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const order of orders) {
    const key = String(order.id);
    if (reviewed.has(key) || !String(order.customer_whatsapp || "").trim()) {
      skipped += 1;
      continue;
    }

    const ok = await sendOnce(order.id, "review_reminder", "WA pengingat ulasan", () =>
      notifyCustomerReviewReminder({
        orderNumber: String(order.order_number || ""),
        customerName: String(order.customer_name || ""),
        customerWhatsapp: String(order.customer_whatsapp || ""),
      }),
    );

    if (ok) sent += 1;
    else failed += 1;
  }

  console.log("[REVIEW-REMINDER] selesai:", { scanned: orders.length, sent, skipped, failed });
  return NextResponse.json({ scanned: orders.length, sent, skipped, failed });
}
