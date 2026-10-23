import type { SupabaseClient } from "@supabase/supabase-js";
import type { TrackHistoryItem, TrackResponse } from "./types";
import { isDelivered, isShipped, isVoided, orderRank, shippingRank } from "./track-status";
import { notifyCustomerOrderDelivered, notifyCustomerOrderShipped } from "../fonnte";
import { claimOrderNotification, recordShippedNotifyStatus, sendOnce } from "../order-notify";
import { syncCommissionStatus } from "../affiliate/commission";

/**
 * Terapkan hasil tracking J&T ke satu pesanan — SATU sumber logika, dipakai cron
 * (`/api/cron/sync-tracking`) maupun aksi admin (`action: "syncTracking"`).
 *
 * Aturan (revisi flow pengiriman):
 * - API gagal / riwayat kosong → status pesanan TIDAK berubah (tetap "Menunggu Pickup").
 * - Simpan tiap entri riwayat ke `order_tracking_events` secara idempoten (`event_key` unik),
 *   termasuk kode status yang tak dikenal (kolom `raw`) untuk pemeriksaan — tanpa menebak.
 * - Naik ke `dikirim` hanya setelah ada pemindaian J&T; ke `selesai` setelah delivered (kode 200).
 * - Transisi **maju-saja**: respons yang telat tidak pernah memundurkan status; `dibatalkan` tetap.
 */

export interface SyncOrder {
  id: string;
  order_number?: string | null;
  status: string;
  shipping_status?: string | null;
  awb_no?: string | null;
  /** Dipakai notifikasi "paket dikirim" (WhatsApp customer). */
  customer_name?: string | null;
  customer_whatsapp?: string | null;
  /** Penanda notifikasi "dikirim" sudah dikirim (kolom `orders.shipped_notified_at`). */
  shipped_notified_at?: string | null;
  /** `voided` = resi sudah dibatalkan di J&T (kolom `orders.jnt_void_status`). */
  jnt_void_status?: string | null;
}

export interface TrackOutcome {
  success: boolean;
  data?: TrackResponse | null;
  /** Bentuk error dari `trackShipment` (objek TrackErrorResponse atau teks) — tak dipakai selain penanda gagal. */
  error?: unknown;
}

export interface SyncResult {
  changed: boolean;
  status: string;
  shippingStatus: string | null;
  eventsStored: number;
  reason: "delivered" | "shipped" | "awaiting-scan" | "api-error" | "no-history" | "cancelled";
}

/** "YYYY-MM-DD HH:mm:ss" (waktu WIB dari J&T) → ISO. Tak terbaca → null. */
function toIso(value?: string | null): string | null {
  if (!value) return null;
  const s = String(value).trim();
  const normalized = s.includes("T") ? s : s.replace(" ", "T");
  const withTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized) ? normalized : `${normalized}+07:00`;
  const d = new Date(withTz);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Kunci idempoten: satu pemindaian (awb + kode + waktu) hanya disimpan sekali. */
function eventKey(awb: string, h: TrackHistoryItem): string {
  return `${awb}|${h.status_code ?? ""}|${h.date_time ?? ""}`;
}

/**
 * Simpan riwayat mentah sebuah resi sebagai **cadangan** (idempoten) — TANPA mengubah status
 * pesanan. Dipakai jalur baca publik (`/api/jnt/track`) supaya saat J&T tidak bisa dihubungi,
 * halaman masih bisa menampilkan data asli terakhir. Resi yang tidak dikenali (bukan pesanan
 * kita) diabaikan — hanya tabel `order_tracking_events` yang ditulis.
 */
export async function storeTrackingEvents(
  supabase: SupabaseClient,
  awb: string,
  history: TrackHistoryItem[],
): Promise<void> {
  if (!awb || history.length === 0) return;
  try {
    const { data: order } = await supabase.from("orders").select("id").eq("awb_no", awb).maybeSingle();
    if (!order?.id) return;

    const rows = history.map((h) => ({
      order_id: order.id as string,
      awb_no: awb,
      event_key: eventKey(awb, h),
      status_code: typeof h.status_code === "number" ? h.status_code : null,
      status_text: h.status ?? null,
      city_name: h.city_name ?? null,
      event_time: toIso(h.date_time),
      raw: h,
    }));
    const { error } = await supabase
      .from("order_tracking_events")
      .upsert(rows, { onConflict: "event_key", ignoreDuplicates: true });
    if (error) console.error("[TRACKING] Gagal simpan cadangan riwayat:", awb, error.message);
  } catch (e) {
    console.error("[TRACKING] Gagal simpan cadangan riwayat:", awb, e);
  }
}

export async function applyTrackingToOrder(
  supabase: SupabaseClient,
  order: SyncOrder,
  track: TrackOutcome,
): Promise<SyncResult> {
  const currentStatus = order.status;
  const currentShip = order.shipping_status ?? null;
  const history = track?.data?.history ?? [];

  // Lantai status pengiriman: resi sudah ada tapi kolom masih kosong (data lama) → minimal
  // "menunggu_pickup". Ini penyelarasan, bukan menebak status paket.
  const floorShip = currentShip ?? (order.awb_no ? "menunggu_pickup" : null);

  // 1) Simpan riwayat (idempoten) — termasuk kode yang tak dikenal.
  let eventsStored = 0;
  if (order.awb_no && history.length > 0) {
    const rows = history.map((h) => ({
      order_id: order.id,
      awb_no: order.awb_no as string,
      event_key: eventKey(order.awb_no as string, h),
      status_code: typeof h.status_code === "number" ? h.status_code : null,
      status_text: h.status ?? null,
      city_name: h.city_name ?? null,
      event_time: toIso(h.date_time),
      raw: h,
    }));
    const { error, count } = await supabase
      .from("order_tracking_events")
      .upsert(rows, { onConflict: "event_key", ignoreDuplicates: true, count: "exact" });
    if (error) console.error("[TRACKING-SYNC] Gagal simpan riwayat:", order.order_number, error.message);
    else eventsStored = count ?? 0;
  }

  // 2) Snapshot pemindaian terakhir (informasional) — hanya kalau ada data.
  const snapshot: Record<string, unknown> = {};
  if (history.length > 0) {
    const latest = history.reduce((a, b) => ((toIso(b.date_time) ?? "") >= (toIso(a.date_time) ?? "") ? b : a));
    snapshot.tracking_status_code = typeof latest.status_code === "number" ? latest.status_code : null;
    snapshot.tracking_status_text = latest.status ?? null;
    snapshot.tracking_city = latest.city_name ?? null;
    snapshot.tracking_updated_at = new Date().toISOString();
  }

  // 2b) Resi yang di-void LANGSUNG di dashboard J&T (bukan lewat panel kita) hanya terlihat dari
  // riwayatnya (kode 162/163). Tandai supaya label resi mati tidak tercetak lagi dan status
  // pengirimannya tidak ditampilkan. Hanya penanda — status pesanan tidak disentuh di sini.
  if (!order.jnt_void_status && isVoided(track.data)) {
    snapshot.jnt_void_status = "voided";
    snapshot.jnt_voided_at = new Date().toISOString();
  }

  // 3) API gagal / riwayat kosong → JANGAN ubah status pesanan.
  if (!track?.success || history.length === 0) {
    const patch: Record<string, unknown> = { ...snapshot };
    if (floorShip !== currentShip) patch.shipping_status = floorShip;
    const changed = floorShip !== currentShip;
    if (Object.keys(patch).length > 0) {
      patch.updated_at = new Date().toISOString();
      await supabase.from("orders").update(patch).eq("id", order.id);
    }
    return {
      changed,
      status: currentStatus,
      shippingStatus: floorShip,
      eventsStored,
      reason: !track?.success ? "api-error" : "no-history",
    };
  }

  // 4) Pesanan batal = terminal (cukup simpan snapshot/riwayat, jangan ubah status).
  if (currentStatus === "dibatalkan") {
    if (Object.keys(snapshot).length > 0) await supabase.from("orders").update(snapshot).eq("id", order.id);
    return { changed: false, status: currentStatus, shippingStatus: currentShip, eventsStored, reason: "cancelled" };
  }

  // 5) Ada riwayat tapi tak ada penanda pemindaian yang bisa dipakai → simpan, jangan menebak.
  if (!isShipped(track.data)) {
    if (Object.keys(snapshot).length > 0) await supabase.from("orders").update(snapshot).eq("id", order.id);
    return { changed: false, status: currentStatus, shippingStatus: floorShip, eventsStored, reason: "awaiting-scan" };
  }

  // 6) Hitung target — maju-saja.
  const delivered = isDelivered(track.data);
  const targetStatus = delivered ? "selesai" : "dikirim";
  const targetShip = delivered ? "selesai" : "dikirim";

  const nextStatus = orderRank(targetStatus) > orderRank(currentStatus) ? targetStatus : currentStatus;
  const nextShip = shippingRank(targetShip) > shippingRank(floorShip) ? targetShip : floorShip;

  const patch: Record<string, unknown> = { ...snapshot };
  if (nextStatus !== currentStatus) patch.status = nextStatus;
  if (nextShip !== currentShip) patch.shipping_status = nextShip;
  const changed = nextStatus !== currentStatus || nextShip !== currentShip;
  if (changed) patch.updated_at = new Date().toISOString();

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from("orders").update(patch).eq("id", order.id);
    if (error) console.error("[TRACKING-SYNC] Gagal update status:", order.order_number, error.message);
  }

  // 7) WA "pesanan dikirim + nomor resi" — TEPAT saat status berubah jadi `dikirim` (paket sudah
  //    diserahkan ke J&T: resi tersimpan dan J&T sudah memindai). Klaim `shipped_notified_at`
  //    bersifat atomik, jadi cron dan aksi admin yang berjalan bersamaan tetap mengirim satu kali.
  const justShipped = nextStatus === "dikirim" && currentStatus !== "dikirim";
  if (justShipped && order.awb_no) {
    if (await claimOrderNotification(order.id, "shipped")) {
      let sent = false;
      try {
        sent = await notifyCustomerOrderShipped({
          orderNumber: order.order_number || "",
          customerName: order.customer_name || "",
          customerWhatsapp: order.customer_whatsapp || "",
          awbNo: order.awb_no,
        });
      } catch (e) {
        console.error("[TRACKING-SYNC] Notifikasi 'dikirim' error:", order.order_number, e);
      }
      console.log(
        "[TRACKING-SYNC] Notifikasi 'dikirim':",
        order.order_number,
        sent ? "terkirim" : "gagal"
      );
      // Status kirim dicatat untuk pemeriksaan admin. Klaim tidak dilepas walau gagal, supaya
      // pesan tidak pernah terkirim dobel; kegagalannya terlihat dari log & kolom ini.
      await recordShippedNotifyStatus(order.id, sent);
    }
  }

  // 8) WA "paket diterima" — hanya saat transisi ke `selesai` (delivered J&T yang valid), bukan
  //    saat "dikirim". Klaim `delivered_notified_at` menjaga tidak ada pesan dobel.
  const justDelivered = nextStatus === "selesai" && currentStatus !== "selesai";
  if (justDelivered && order.customer_name) {
    await sendOnce(order.id, "delivered", "WA paket diterima", () =>
      notifyCustomerOrderDelivered({
        orderNumber: order.order_number || "",
        customerName: order.customer_name || "",
        customerWhatsapp: order.customer_whatsapp || "",
      })
    );
  }

  // 9) Komisi affiliate diselaraskan dengan status pengiriman (baru "disetujui" setelah masa
  //    validasi habis, lihat src/lib/affiliate/commission.ts). Kegagalan tidak boleh mengganggu
  //    sinkronisasi tracking.
  try {
    await syncCommissionStatus(supabase, order.id, { actor: "tracking-sync" });
  } catch (e) {
    console.error("[TRACKING-SYNC] Gagal menyelaraskan komisi affiliate:", e);
  }

  return {
    changed,
    status: nextStatus,
    shippingStatus: nextShip,
    eventsStored,
    reason: delivered ? "delivered" : "shipped",
  };
}
