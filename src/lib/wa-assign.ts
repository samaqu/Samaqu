/**
 * Pembagian pemilik chat WhatsApp (tahap 5a).
 *
 * Tiap nomor pelanggan punya satu admin penanggung jawab (`wa_chat_owner`). Pemilik hanya PENANDA: bot tetap membalas
 * seperti biasa, dan tahap ini belum membatasi siapa pun. Bot dan webhook Fonnte tidak membaca tabel ini.
 *
 * Aturan:
 *  - Calon pemilik = admin yang statusnya Aktif DAN online (sinyal panel < 5 menit lalu, jadi panelnya sedang terbuka).
 *  - Hanya chat yang MASIH MENUNGGU balasan yang diberi PIC (langsung di jam kerja admin, 2 menit di luar jam admin). Chat yang dijawab bot tidak perlu pemilik:
 *    bot membalas di jam kerja AI (16.30-07.30, Minggu penuh), di luar itu admin yang membalas.
 *  - Chat tanpa pemilik dibagi ke admin dengan beban paling sedikit (jumlah chat yang ditugaskan 24 jam terakhir).
 *  - Pelanggan lama otomatis kembali ke admin yang sama: pemilik tidak berubah selama belum ada kejadian pemindahan.
 *  - Tidak ada admin Aktif dan online: chat dibiarkan tanpa pemilik (Antrean) dan dibagi begitu ada yang masuk.
 *
 * Dipicu oleh sinyal panel (heartbeat) dan pemuatan daftar Inbox, bukan penjadwal eksternal: admin online berarti
 * panelnya terbuka, jadi selalu ada pemicu saat ada yang bisa menerima chat. Penulisan memakai "insert, abaikan bila
 * sudah ada" sehingga dua pemicu bersamaan tidak membuat pemilik ganda.
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const ONLINE_WINDOW_MS = 5 * 60_000;
const CANDIDATE_WINDOW_MS = 24 * 3600_000;
/**
 * Berapa lama pesan harus menunggu sebelum chatnya diberi PIC.
 *  - Pesan yang masuk di jam kerja admin (Senin-Sabtu 07.30-16.40 WIB): LANGSUNG (0). Bot tidak membalas di jam itu
 *    (dan pengaman wa-agent melewati pesannya), jadi tidak ada risiko memberi PIC ke chat yang sebentar lagi dibalas bot.
 *  - Di luar jam admin: 2 menit, supaya chat yang dijawab bot dalam hitungan detik tidak ikut diberi PIC.
 * Jam admin SAMA dengan `isAdminHoursMessage` di repo Academy (`_shared/wa/schedule.mjs`); ubah keduanya bersama.
 */
export const OUTSIDE_HOURS_WAIT_MS = 2 * 60_000;
export const ADMIN_START_MIN = 7 * 60 + 30;
export const ADMIN_HANDOFF_MIN = 16 * 60 + 40;
const WIB_MS = 7 * 3600_000;

/** Apakah waktu `ms` (epoch) jatuh di jam kerja admin (WIB, Senin-Sabtu 07.30-16.40)? */
export function isAdminHours(ms: number): boolean {
  const w = new Date(ms + WIB_MS);
  if (w.getUTCDay() === 0) return false; // Minggu: admin libur
  const minutes = w.getUTCHours() * 60 + w.getUTCMinutes();
  return minutes >= ADMIN_START_MIN && minutes < ADMIN_HANDOFF_MIN;
}

/** Pesan yang masuk pada `createdMs` sudah cukup lama menunggu untuk diberi PIC pada `nowMs`? */
export function isReadyForPic(createdMs: number, nowMs: number): boolean {
  const wait = isAdminHours(createdMs) ? 0 : OUTSIDE_HOURS_WAIT_MS;
  return nowMs - createdMs >= wait;
}
const MIN_GAP_MS = 15_000;
const CHUNK = 200;

export interface Eligible {
  userId: string;
  /** Jumlah chat yang sudah ditugaskan ke admin ini (24 jam terakhir). */
  load: number;
}

export interface AdminRow {
  user_id: string;
  active?: boolean | null;
  status?: string | null;
  last_seen_at?: string | null;
}

/** Admin boleh menerima chat baru: akun aktif, status Aktif, dan panel terbuka (sinyal < 5 menit). */
export function isEligible(admin: AdminRow, nowMs: number): boolean {
  if (admin.active === false) return false;
  if (admin.status !== "aktif") return false;
  const seen = admin.last_seen_at ? Date.parse(admin.last_seen_at) : 0;
  return Boolean(seen) && nowMs - seen <= ONLINE_WINDOW_MS;
}

/** Bagi tiap nomor ke admin dengan beban paling sedikit, satu per satu (seri: urut user id). Fungsi murni. */
export function pickOwners(senders: string[], eligible: Eligible[]): Map<string, string> {
  const result = new Map<string, string>();
  if (eligible.length === 0) return result;
  const loads = eligible.map((e) => ({ ...e }));
  for (const sender of senders) {
    loads.sort((a, b) => a.load - b.load || a.userId.localeCompare(b.userId));
    loads[0].load += 1;
    result.set(sender, loads[0].userId);
  }
  return result;
}

let lastRun = 0;
let running = false;

export interface AssignResult {
  assigned: number;
  skipped?: boolean;
  reason?: string;
}

/** Bagikan chat yang menunggu balasan (24 jam terakhir) dan belum punya pemilik. Aman dipanggil sering (dibatasi per 15 detik per instance). */
export async function assignUnownedChats(): Promise<AssignResult> {
  const nowMs = Date.now();
  if (running || nowMs - lastRun < MIN_GAP_MS) return { assigned: 0, skipped: true };
  running = true;
  lastRun = nowMs;
  try {
    const db = getSupabaseAdmin();

    const { data: admins, error: adminError } = await db.from("admins").select("user_id, active, status, last_seen_at");
    if (adminError) return { assigned: 0, reason: adminError.message };
    const eligibleAdmins = (admins || []).filter((a) => isEligible(a as AdminRow, nowMs));
    if (eligibleAdmins.length === 0) return { assigned: 0, reason: "tidak ada admin Aktif dan online" };

    const since = new Date(nowMs - CANDIDATE_WINDOW_MS).toISOString();
    // Hanya chat yang MASIH MENUNGGU balasan (pending/processing). Waktu tunggunya mengikuti jam masuk pesan
    // (`isReadyForPic`): langsung di jam kerja admin, 2 menit di luar jam admin (chat yang dijawab bot tidak ikut).
    const { data: rows, error: rowsError } = await db
      .from("wa_inbox")
      .select("sender, created_at")
      .in("status", ["pending", "processing"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(3000);
    if (rowsError) return { assigned: 0, reason: rowsError.message };
    const ready = (rows || []).filter((r) => {
      const created = Date.parse(String(r.created_at));
      return Number.isFinite(created) && isReadyForPic(created, nowMs);
    });
    const senders = [...new Set(ready.map((r) => String(r.sender || "")).filter((s) => /^\d{6,20}$/.test(s)))];
    if (senders.length === 0) return { assigned: 0 };

    const owned = new Set<string>();
    for (let i = 0; i < senders.length; i += CHUNK) {
      const { data } = await db.from("wa_chat_owner").select("sender").in("sender", senders.slice(i, i + CHUNK));
      for (const r of data || []) owned.add(String(r.sender));
    }
    const unowned = senders.filter((s) => !owned.has(s));
    if (unowned.length === 0) return { assigned: 0 };

    const { data: recent } = await db.from("wa_chat_owner").select("owner_user_id").gte("assigned_at", since);
    const loadOf = new Map<string, number>();
    for (const r of recent || []) loadOf.set(String(r.owner_user_id), (loadOf.get(String(r.owner_user_id)) || 0) + 1);

    const plan = pickOwners(
      unowned,
      eligibleAdmins.map((a) => ({ userId: String(a.user_id), load: loadOf.get(String(a.user_id)) || 0 })),
    );
    const toInsert = [...plan].map(([sender, ownerUserId]) => ({ sender, owner_user_id: ownerUserId, assigned_by: "auto" }));
    const { data: inserted, error: insertError } = await db
      .from("wa_chat_owner")
      .upsert(toInsert, { onConflict: "sender", ignoreDuplicates: true })
      .select("sender, owner_user_id");
    if (insertError) return { assigned: 0, reason: insertError.message };

    if (inserted && inserted.length > 0) {
      const { error: logError } = await db
        .from("wa_chat_owner_log")
        .insert(inserted.map((r) => ({ sender: r.sender, from_user_id: null, to_user_id: r.owner_user_id, reason: "dibagi otomatis" })));
      if (logError) console.error("[WA-ASSIGN] gagal menulis riwayat:", logError.message);
    }
    return { assigned: inserted?.length ?? 0 };
  } catch (error) {
    console.error("[WA-ASSIGN] gagal membagi chat:", error);
    return { assigned: 0, reason: "galat tak terduga" };
  } finally {
    running = false;
  }
}

export interface ChatOwner {
  userId: string;
  name: string;
}

/** Pemilik tiap nomor (untuk ditampilkan di Inbox). Nomor tanpa pemilik tidak muncul di hasil. */
export async function ownersFor(senders: string[]): Promise<Map<string, ChatOwner>> {
  const result = new Map<string, ChatOwner>();
  const list = [...new Set(senders.filter(Boolean))];
  if (list.length === 0) return result;
  const db = getSupabaseAdmin();

  const owners: { sender: string; owner_user_id: string }[] = [];
  for (let i = 0; i < list.length; i += CHUNK) {
    const { data } = await db.from("wa_chat_owner").select("sender, owner_user_id").in("sender", list.slice(i, i + CHUNK));
    owners.push(...((data || []) as { sender: string; owner_user_id: string }[]));
  }
  if (owners.length === 0) return result;

  const { data: admins } = await db.from("admins").select("user_id, display_name, email");
  const nameOf = new Map<string, string>();
  for (const a of admins || []) {
    nameOf.set(String(a.user_id), String(a.display_name || "").trim() || String(a.email || "").split("@")[0]);
  }
  for (const o of owners) {
    result.set(String(o.sender), { userId: String(o.owner_user_id), name: nameOf.get(String(o.owner_user_id)) || "(akun dihapus)" });
  }
  return result;
}
