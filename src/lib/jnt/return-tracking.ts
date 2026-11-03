import type { SupabaseClient } from "@supabase/supabase-js";
import type { TrackHistoryItem, TrackResponse } from "./types";
import { isDelivered } from "./track-status";
import { notifyCustomerReplacementDelivered } from "../fonnte";

/**
 * Tracking untuk resi **pengganti** pada retur (Tukar Size).
 *
 * Sengaja dipisah dari `tracking-sync.ts` yang mengurus `orders` — supaya aturan pesanan
 * tidak tercampur dan tidak ada risiko regresi pada alur yang sudah jalan.
 *
 * Aturan transisi:
 * - `pengganti_dikirim` → `selesai` HANYA saat J&T menyatakan paket diterima (kode 200).
 * - Maju-saja: tidak pernah memundurkan status, tidak menyentuh `dibatalkan`/`ditolak`.
 * - Status `pengganti_dikirim` memang sudah diset saat resi terbit, jadi tidak ada
 *   transisi "dikirim" di sini.
 * - Riwayat pemindaian disimpan di `return_tracking_events` (idempoten via `event_key`).
 */

export interface SyncReturn {
  id: string;
  return_number?: string | null;
  status: string;
  shipping_out_awb?: string | null;
  customer_name?: string | null;
  customer_whatsapp?: string | null;
  replacement_delivered_at?: string | null;
  replacement_delivered_notified_at?: string | null;
}

export interface TrackOutcome {
  success: boolean;
  data?: TrackResponse | null;
  error?: unknown;
}

export interface ReturnSyncResult {
  completed: boolean;
  eventsStored: number;
  reason: "delivered" | "awaiting-delivery" | "api-error" | "no-history";
}

/** "YYYY-MM-DD HH:mm:ss" (WIB) → ISO. Tak terbaca → null. Sama dengan `tracking-sync.ts`. */
function toIso(value?: string | null): string | null {
  if (!value) return null;
  const s = String(value).trim();
  const normalized = s.includes("T") ? s : s.replace(" ", "T");
  const withTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized) ? normalized : `${normalized}+07:00`;
  const d = new Date(withTz);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function eventKey(h: TrackHistoryItem): string {
  return `${h.status_code ?? ""}|${h.date_time ?? ""}`;
}

export async function applyTrackingToReturn(
  supabase: SupabaseClient,
  record: SyncReturn,
  track: TrackOutcome,
): Promise<ReturnSyncResult> {
  const history = track?.data?.history ?? [];
  const awb = String(record.shipping_out_awb || "");

  if (!track?.success || !track.data || history.length === 0) {
    return {
      completed: false,
      eventsStored: 0,
      reason: !track?.success ? "api-error" : "no-history",
    };
  }

  let eventsStored = 0;
  if (awb) {
    const rows = history.map((h) => ({
      return_id: record.id,
      awb_no: awb,
      event_key: eventKey(h),
      code: h.status_code != null ? String(h.status_code) : null,
      description: h.status ?? null,
      city: h.city_name ?? null,
      occurred_at: toIso(h.date_time),
      raw: h,
    }));
    const { count, error } = await supabase
      .from("return_tracking_events")
      .upsert(rows, { onConflict: "return_id,event_key", ignoreDuplicates: true, count: "exact" });
    if (error) {
      console.error("[RETURN-TRACKING] Gagal simpan riwayat:", record.return_number, error.message);
    } else {
      eventsStored = count ?? 0;
    }
  }

  const delivered = isDelivered(track.data);
  if (!delivered) {
    return { completed: false, eventsStored, reason: "awaiting-delivery" };
  }

  // Sudah final / sudah tercatat selesai: jangan tulis ulang.
  if (record.status !== "pengganti_dikirim" || record.replacement_delivered_at) {
    return { completed: false, eventsStored, reason: "delivered" };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("returns")
    .update({ status: "selesai", completed_at: now, replacement_delivered_at: now, updated_at: now })
    .eq("id", record.id)
    .eq("status", "pengganti_dikirim");
  if (error) {
    console.error("[RETURN-TRACKING] Gagal menutup retur:", record.return_number, error.message);
    return { completed: false, eventsStored, reason: "delivered" };
  }

  // Klaim notifikasi (sekali per retur) lalu kirim. Gagal kirim tidak membuka klaim,
  // supaya customer tidak menerima pesan dobel.
  if (!record.replacement_delivered_notified_at && record.customer_whatsapp) {
    const { data: claimed } = await supabase
      .from("returns")
      .update({ replacement_delivered_notified_at: now })
      .eq("id", record.id)
      .is("replacement_delivered_notified_at", null)
      .select("id");
    if (claimed && claimed.length > 0) {
      try {
        const sent = await notifyCustomerReplacementDelivered({
          returnNumber: String(record.return_number || ""),
          customerName: record.customer_name || "-",
          customerWhatsapp: String(record.customer_whatsapp),
        });
        if (!sent) {
          console.error("[RETURN-TRACKING] WA pengganti diterima GAGAL:", record.return_number);
        }
      } catch (e) {
        console.error("[RETURN-TRACKING] WA pengganti diterima error:", record.return_number, e);
      }
    }
  }

  return { completed: true, eventsStored, reason: "delivered" };
}
