import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeKontak } from "@/lib/ops-followup";

/**
 * Jembatan Leads ↔ Transaksi.
 *
 * Order baru TIDAK membuat lead baru (pusat data pelanggan tetap modul Pelanggan). Yang
 * dikerjakan di sini hanya dua arah:
 *
 * 1. **Saat transaksi disimpan** → cari lead dengan nomor HP yang sama, syarat:
 *    - dibuat SEBELUM order (`leads.tanggal` <= tanggal order WIB), dan
 *    - paling lama 60 hari sebelum tanggal order,
 *    - status masih `belum_closing`,
 *    lalu ubah jadi Closing, isi nominal dari total transaksi, dan simpan relasinya
 *    (`order_id` + `order_number`).
 * 2. **Saat transaksi dibatalkan** → lead yang `order_id`-nya sama DAN masih berstatus
 *    `closing` dikembalikan ke Belum Closing dengan nominal dikosongkan. Kalau admin sudah
 *    mengubah statusnya manual, lead tidak disentuh.
 *
 * Relasi disimpan di kolom, BUKAN di `note_followup` — catatan follow-up milik admin.
 */

/** Jendela pencocokan: lead harus dibuat maksimal 60 hari sebelum tanggal order. */
export const LEAD_MATCH_WINDOW_DAYS = 60;

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Normalisasi nomor HP untuk pencocokan order ↔ lead.
 * Beda dengan `normalizeKontak()` yang juga meloloskan username IG: di sini hanya nomor
 * yang diterima, karena `orders.customer_whatsapp` selalu nomor. `08xx`, `628xx`, `+62 8xx`
 * dan `812-9144-4977` semuanya jadi `81291444977`.
 */
export function normalizeLeadPhone(raw?: string | null): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  const n = digits.replace(/^0+/, "");
  if (n.startsWith("62") && n[2] === "8") return n.slice(2);
  if (n.startsWith("8")) return n;
  // Nomor asing (bukan Indonesia) tetap dibandingkan apa adanya — jarang, tapi jangan hilang.
  return n;
}

/** Tanggal WIB (YYYY-MM-DD) dari sebuah ISO/timestamp. */
function wibDate(iso: string | Date): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  return new Date(d.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

/** Tanggal paling awal yang masih boleh dicocokkan (tanggal order − 60 hari). */
function earliestMatchDate(orderDateWib: string): string {
  const base = new Date(`${orderDateWib}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() - LEAD_MATCH_WINDOW_DAYS);
  return base.toISOString().slice(0, 10);
}

export interface OrderLeadSyncInput {
  whatsapp?: string | null;
  orderId: string;
  orderNumber: string;
  total?: number | null;
  /** Waktu order dibuat (default: sekarang). Dipakai untuk jendela 60 hari. */
  orderCreatedAt?: string | null;
}

export interface OrderLeadSyncResult {
  matched: boolean;
  updated: boolean;
  leadId?: string;
}

interface LeadRow {
  id: string;
  kontak: string | null;
  tanggal: string | null;
  jam: string | null;
  status: string | null;
  order_id: string | null;
}

/**
 * Cari lead yang layak dicocokkan untuk sebuah order.
 *
 * Dipakai bersama oleh sync saat order dibuat dan oleh backfill, supaya aturannya satu:
 * nomor sama (setelah normalisasi), lead dibuat sebelum order, maksimal 60 hari sebelumnya,
 * status `belum_closing`, dan kalau ada beberapa → ambil yang paling baru.
 */
export async function findMatchableLead(
  admin: SupabaseClient,
  input: { whatsapp?: string | null; orderCreatedAt?: string | null }
): Promise<LeadRow | null> {
  const target = normalizeLeadPhone(input.whatsapp);
  if (!target) return null;

  const orderDate = wibDate(input.orderCreatedAt || new Date());
  const earliest = earliestMatchDate(orderDate);

  // Jendela sudah disaring di query, lalu dibandingkan di aplikasi dengan normalisasi yang
  // sama (SQL tidak punya fungsi normalisasi nomor). Tabel `leads` kecil (ribuan baris).
  const { data, error } = await admin
    .from("leads")
    .select("id, kontak, tanggal, jam, status, order_id")
    .eq("status", "belum_closing")
    .gte("tanggal", earliest)
    .lte("tanggal", orderDate)
    .order("tanggal", { ascending: false })
    .order("jam", { ascending: false })
    .limit(2000);

  if (error) {
    console.error("[LEAD-SYNC] Gagal membaca leads:", error.message);
    return null;
  }

  const candidates = ((data || []) as LeadRow[]).filter(
    (l) => normalizeLeadPhone(l.kontak) === target && !l.order_id
  );
  if (candidates.length === 0) return null;

  // Query sudah menurunkan tanggal+jam; `.order` PostgREST tidak menyentuh `created_at`,
  // jadi urutkan ulang di sini supaya "paling baru" pasti benar.
  return candidates[0];
}

/** Tandai lead Closing untuk sebuah order yang baru disimpan. */
export async function syncLeadOnOrderSaved(
  admin: SupabaseClient,
  input: OrderLeadSyncInput
): Promise<OrderLeadSyncResult> {
  const lead = await findMatchableLead(admin, input);
  if (!lead) return { matched: false, updated: false };

  const nowIso = new Date().toISOString();
  const nominal = Math.max(0, Math.round(Number(input.total) || 0));

  const { error: updateError } = await admin
    .from("leads")
    .update({
      status: "closing",
      nominal,
      order_id: input.orderId,
      order_number: input.orderNumber,
      updated_at: nowIso,
    })
    // Guard: hanya kalau masih Belum Closing (tidak menimpa perubahan manual yang balapan).
    .eq("id", lead.id)
    .eq("status", "belum_closing");

  if (updateError) {
    console.error("[LEAD-SYNC] Gagal menandai lead closing:", updateError.message);
    return { matched: true, updated: false };
  }

  const { error: actError } = await admin.from("lead_activities").insert({
    lead_id: lead.id,
    actor: "system",
    action: "order_created",
    note: `Closing otomatis dari order ${input.orderNumber} · Rp ${nominal.toLocaleString("id-ID")}`,
  });
  if (actError) console.error("[LEAD-SYNC] Gagal mencatat aktivitas:", actError.message);

  return { matched: true, updated: true, leadId: lead.id };
}

/**
 * Kembalikan lead ke Belum Closing saat order dibatalkan.
 * Hanya menyentuh lead yang `order_id`-nya sama DAN statusnya masih `closing` — lead yang
 * sudah diubah manual tidak diganggu.
 */
export async function revertLeadOnOrderCancelled(
  admin: SupabaseClient,
  orderId: string
): Promise<{ reverted: boolean; leadId?: string }> {
  if (!orderId) return { reverted: false };

  const { data, error } = await admin
    .from("leads")
    .select("id")
    .eq("order_id", orderId)
    .eq("status", "closing")
    .maybeSingle();

  if (error) {
    console.error("[LEAD-SYNC] Gagal mencari lead untuk revert:", error.message);
    return { reverted: false };
  }
  if (!data?.id) return { reverted: false };

  const nowIso = new Date().toISOString();
  const { error: updateError } = await admin
    .from("leads")
    .update({
      status: "belum_closing",
      nominal: 0,
      order_id: null,
      order_number: null,
      updated_at: nowIso,
    })
    .eq("id", data.id)
    .eq("status", "closing");

  if (updateError) {
    console.error("[LEAD-SYNC] Gagal mengembalikan lead:", updateError.message);
    return { reverted: false };
  }

  const { error: actError } = await admin.from("lead_activities").insert({
    lead_id: data.id,
    actor: "system",
    action: "order_cancelled",
    note: "Transaksi dibatalkan — lead kembali ke Belum Closing",
  });
  if (actError) console.error("[LEAD-SYNC] Gagal mencatat aktivitas:", actError.message);

  return { reverted: true, leadId: data.id };
}
