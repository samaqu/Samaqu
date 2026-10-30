import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { trackShipment } from "@/lib/jnt/track";
import { applyTrackingToOrder } from "@/lib/jnt/tracking-sync";

/**
 * Sinkronkan status pengiriman & pesanan dengan tracking J&T.
 *
 * - Pemindaian J&T pertama → status pengiriman `dikirim` (dan `orders.status = "dikirim"`).
 * - Paket diterima penerima (J&T `status_code` 200) → `selesai`.
 * - Riwayat kosong / API gagal → status TIDAK berubah (tetap "Menunggu Pickup").
 *
 * GET /api/cron/sync-tracking — dipanggil penjadwal cron eksternal (cron-job) dengan header
 * `Authorization: Bearer $CRON_SECRET`, atau manual. Hanya pesanan ber-resi yang belum final
 * (`pending`/`diproses`/`dikirim`) yang diperiksa; tanpa resi dilewati tanpa error.
 * Logika transisinya ada di `src/lib/jnt/tracking-sync.ts` (idempoten, maju-saja).
 */
export async function GET(request: NextRequest) {
  // Verify cron secret (penjadwal mengirim header Authorization: Bearer $CRON_SECRET)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  // Kalau CRON_SECRET kosong, route DITOLAK (bukan dibiarkan publik) — supaya tidak ada yang bisa
  // memicu sinkronisasi tracking & notifikasi WA tanpa kredensial.
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, order_number, awb_no, status, shipping_status, customer_name, customer_whatsapp, shipped_notified_at, reseller_id")
    .in("status", ["pending", "diproses", "dikirim"])
    .not("awb_no", "is", null)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[SYNC-TRACKING] Fetch error:", error);
    return NextResponse.json({ error: "Gagal mengambil pesanan" }, { status: 500 });
  }

  let checked = 0;
  let shipped = 0;
  let completed = 0;
  let eventsStored = 0;
  let errors = 0;

  for (const order of orders || []) {
    if (!order.awb_no) continue;
    checked++;
    try {
      const track = await trackShipment(order.awb_no);
      const result = await applyTrackingToOrder(supabase, order, track);
      eventsStored += result.eventsStored;
      if (result.reason === "delivered") {
        completed++;
        console.log("[SYNC-TRACKING] Paket diterima → selesai:", order.order_number);
      } else if (result.reason === "shipped") {
        shipped++;
        console.log("[SYNC-TRACKING] Pemindaian J&T → dikirim:", order.order_number);
      }
    } catch (e) {
      console.error("[SYNC-TRACKING] Unexpected error:", order.order_number, e);
      errors++;
    }
  }

  return NextResponse.json({ checked, shipped, completed, eventsStored, errors });
}
