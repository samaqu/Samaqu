/**
 * Pembagian pemilik chat WhatsApp (tahap 5a).
 *
 * Tiap nomor pelanggan punya satu admin penanggung jawab (`wa_chat_owner`). Pemilik hanya PENANDA: bot tetap membalas
 * seperti biasa, dan tahap ini belum membatasi siapa pun. Bot dan webhook Fonnte tidak membaca tabel ini.
 *
 * Aturan:
 *  - Calon pemilik = admin yang statusnya Aktif DAN online (sinyal panel < 5 menit lalu, jadi panelnya sedang terbuka).
 *  - Hanya chat yang MASIH MENUNGGU balasan yang diberi PIC, dan HANYA di jam kerja admin (Senin-Sabtu 07.30-16.40 WIB, langsung).
 *    Sore sampai pagi dan Minggu PIC-nya bot (tidak ada PIC admin); chat yang sampai pagi belum dibalas dibagi begitu jam admin mulai.
 *    Chat yang dijawab bot tidak perlu pemilik.
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
// Jam admin dipindah ke modul murni (aman dipakai tampilan); diekspor ulang di sini supaya pemanggil lama tetap jalan.
import { isAdminHours } from "@/lib/admin-hours";
export { ADMIN_HANDOFF_MIN, ADMIN_START_MIN, isAdminHours } from "@/lib/admin-hours";

/**
 * Kapan chat yang menunggu boleh diberi PIC ADMIN: HANYA saat jam kerja admin (Senin-Sabtu 07.30-16.40 WIB).
 *  - Sore sampai pagi (dan Minggu) PIC-nya BOT: tidak ada pemberian PIC admin sama sekali. Admin yang kebetulan online
 *    malam hari tidak kebanjiran chat yang sebenarnya dijawab bot (dulu: tunggu 2 menit, lalu 10 menit, tetap saja ada
 *    chat bot yang keburu diberi PIC).
 *  - Chat yang sampai pagi belum dibalas tidak hilang: begitu jam admin mulai (07.30) dan ada admin Aktif yang online,
 *    chat itu otomatis dibagi (pesan yang masuk saat jam admin tetap langsung).
 * `createdMs` dipertahankan di tanda tangan fungsi demi kompatibilitas, tidak lagi menentukan hasil.
 */
export function isReadyForPic(createdMs: number, nowMs: number): boolean {
  return Number.isFinite(createdMs) && nowMs >= createdMs && isAdminHours(nowMs);
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
  /** Akun bot: tidak pernah menerima PIC chat. */
  is_bot?: boolean | null;
}

/** Admin boleh menerima chat baru: bukan akun bot, akun aktif, status Aktif, dan panel terbuka (sinyal < 5 menit). */
export function isEligible(admin: AdminRow, nowMs: number): boolean {
  if (admin.is_bot === true) return false;
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
let lastRelease = 0;
const RELEASE_GAP_MS = 60_000;

/**
 * Lepas PIC otomatis yang SALAH: chat diberi PIC lalu ternyata bot yang menjawab (tanpa balasan admin, tanpa penandaan
 * "dibalas di HP", tanpa pesan menunggu atau gagal). Satu fungsi SQL atomik (`wa_release_bot_answered_owners`), dibatasi
 * sekali per menit per instance. Gagal = dicatat saja, tidak pernah menghalangi pembagian.
 */
export async function releaseBotAnsweredOwners(db = getSupabaseAdmin(), nowMs = Date.now()): Promise<number> {
  if (nowMs - lastRelease < RELEASE_GAP_MS) return 0;
  lastRelease = nowMs;
  try {
    const { data, error } = await db.rpc("wa_release_bot_answered_owners");
    if (error) {
      console.error("[WA-ASSIGN] gagal melepas PIC yang dijawab bot:", error.message);
      return 0;
    }
    return Number(data) || 0;
  } catch (e) {
    console.error("[WA-ASSIGN] gagal melepas PIC yang dijawab bot:", e);
    return 0;
  }
}

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

    // Dijalankan SEBELUM pengecekan admin online: PIC yang salah tetap harus dilepas walau tidak ada admin yang bisa menerima chat.
    await releaseBotAnsweredOwners(db, nowMs);

    const { data: admins, error: adminError } = await db.from("admins").select("user_id, active, status, last_seen_at, is_bot");
    if (adminError) return { assigned: 0, reason: adminError.message };
    const eligibleAdmins = (admins || []).filter((a) => isEligible(a as AdminRow, nowMs));
    if (eligibleAdmins.length === 0) return { assigned: 0, reason: "tidak ada admin Aktif dan online" };

    const since = new Date(nowMs - CANDIDATE_WINDOW_MS).toISOString();
    // Hanya chat yang MASIH MENUNGGU balasan (pending/processing). Waktu tunggunya mengikuti jam masuk pesan
    // (`isReadyForPic`): hanya saat jam kerja admin berjalan; di luar jam itu PIC-nya bot dan tidak ada pembagian.
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

/* ───────────── Tahap 5b-2: gembok PIC di server ───────────── */

/** Owner dan Leader boleh menangani chat milik admin lain, tapi HARUS lewat "Ambil alih dari [nama]" (PIC berpindah dan tercatat). */
export const canManageAllChats = (role: string): boolean => role === "owner" || role === "leader";

/** Saklar darurat: `WA_PIC_RESTRICT=off` di Vercel mematikan semua gembok dan klaim PIC (tanpa deploy ulang kode). */
export const picRestrictionOff = (): boolean => (process.env.WA_PIC_RESTRICT || "").trim().toLowerCase() === "off";

export type PicDecision = "allow" | "claim" | "deny";

/**
 * Putusan untuk aksi pada satu chat (murni, diuji):
 *  - belum ada PIC: boleh; bila `claim`, yang bertindak otomatis jadi PIC ("klaim");
 *  - PIC = saya: boleh;
 *  - PIC orang lain: ditolak untuk SEMUA peran. Owner/Leader harus mengambil alih dulu (take-pic), supaya perpindahannya tercatat.
 */
export function decidePic(input: { ownerId: string | null; userId: string; claim: boolean }): PicDecision {
  if (!input.ownerId) return input.claim ? "claim" : "allow";
  return input.ownerId === input.userId ? "allow" : "deny";
}

/** Penutupan massal: admin biasa hanya chat miliknya atau yang belum ada PIC; Owner/Leader boleh semua (hanya merapikan daftar, tidak membalas pelanggan). */
export function filterBulkSenders(senders: string[], ownerOf: Map<string, string>, userId: string, role: string): { allowed: string[]; skipped: number } {
  if (canManageAllChats(role)) return { allowed: senders, skipped: 0 };
  const allowed = senders.filter((s) => {
    const owner = ownerOf.get(s);
    return !owner || owner === userId;
  });
  return { allowed, skipped: senders.length - allowed.length };
}

async function nameOfAdmin(userId: string): Promise<string> {
  const { data } = await getSupabaseAdmin().from("admins").select("display_name, email").eq("user_id", userId).maybeSingle();
  return String(data?.display_name || "").trim() || String(data?.email || "").split("@")[0] || "admin lain";
}

async function writePicLog(sender: string, fromUserId: string | null, toUserId: string, reason: string, byUserId: string) {
  const { error } = await getSupabaseAdmin()
    .from("wa_chat_owner_log")
    .insert({ sender, from_user_id: fromUserId, to_user_id: toUserId, reason, by_user_id: byUserId });
  if (error) console.error("[WA-PIC] gagal menulis riwayat:", error.message);
}

export type PicGuard = { ok: true; claimed?: boolean } | { ok: false; error: string };

/**
 * Gembok PIC untuk satu chat: dipanggil route wa-panel SEBELUM aksi yang mengubah sesuatu (reply, takeover, release,
 * mark-replied). `claim` = aksi ini membuat yang bertindak jadi PIC bila chat belum bertuan.
 * Gagal membaca tabel = DIIZINKAN (fail-open): masalah di tabel PIC tidak boleh mengunci admin dari pekerjaannya.
 */
export async function guardPic(sender: string, userId: string, role: string, opts: { claim: boolean }): Promise<PicGuard> {
  if (picRestrictionOff()) return { ok: true };
  try {
    const db = getSupabaseAdmin();
    const read = async () => {
      const { data, error } = await db.from("wa_chat_owner").select("owner_user_id").eq("sender", sender).maybeSingle();
      if (error) throw new Error(error.message);
      return data?.owner_user_id ? String(data.owner_user_id) : null;
    };
    let ownerId = await read();
    let decision = decidePic({ ownerId, userId, claim: opts.claim });

    if (decision === "claim") {
      const { data: inserted, error } = await db
        .from("wa_chat_owner")
        .upsert({ sender, owner_user_id: userId, assigned_by: "manual" }, { onConflict: "sender", ignoreDuplicates: true })
        .select("owner_user_id");
      if (error) throw new Error(error.message);
      if (inserted && inserted.length > 0) {
        await writePicLog(sender, null, userId, "diklaim saat menangani chat", userId);
        return { ok: true, claimed: true };
      }
      // Admin lain lebih dulu mengklaim: baca ulang pemiliknya.
      ownerId = await read();
      decision = decidePic({ ownerId, userId, claim: false });
    }

    if (decision === "deny") {
      const name = await nameOfAdmin(String(ownerId));
      return {
        ok: false,
        error: canManageAllChats(role)
          ? `Chat ini PIC-nya ${name}. Klik "Ambil alih dari ${name}" dulu supaya perpindahannya tercatat.`
          : `Chat ini PIC-nya ${name}. Hanya ${name} (atau Owner dan Leader) yang bisa menanganinya.`,
      };
    }
    return { ok: true };
  } catch (error) {
    console.error("[WA-PIC] gembok gagal dibaca, diizinkan:", error);
    return { ok: true };
  }
}

export type TakePicResult = { ok: true; from: string | null } | { ok: false; error: string };

/**
 * "Ambil alih dari [nama]": PIC pindah ke pemanggil dan tercatat. Hanya Owner dan Leader untuk chat milik orang lain;
 * chat yang belum bertuan boleh diambil siapa saja (klaim). Memakai perubahan bersyarat (pemilik lama harus masih sama)
 * supaya dua orang yang menekan bersamaan tidak saling menimpa.
 */
export async function takePic(sender: string, userId: string, role: string): Promise<TakePicResult> {
  const db = getSupabaseAdmin();
  const { data: row, error } = await db.from("wa_chat_owner").select("owner_user_id").eq("sender", sender).maybeSingle();
  if (error) return { ok: false, error: "Gagal membaca PIC chat ini. Coba lagi." };
  const oldOwner = row?.owner_user_id ? String(row.owner_user_id) : null;

  if (oldOwner === userId) return { ok: true, from: null };
  if (!oldOwner) {
    const { data: inserted, error: insertError } = await db
      .from("wa_chat_owner")
      .upsert({ sender, owner_user_id: userId, assigned_by: "manual" }, { onConflict: "sender", ignoreDuplicates: true })
      .select("sender");
    if (insertError) return { ok: false, error: "Gagal menjadi PIC chat ini. Coba lagi." };
    if (inserted && inserted.length > 0) {
      await writePicLog(sender, null, userId, "diklaim", userId);
      return { ok: true, from: null };
    }
    return { ok: false, error: "Chat ini baru saja mendapat PIC. Muat ulang daftar." };
  }
  if (!canManageAllChats(role)) {
    return { ok: false, error: `Hanya Owner dan Leader yang bisa mengambil alih chat milik ${await nameOfAdmin(oldOwner)}.` };
  }
  const { data: updated, error: updateError } = await db
    .from("wa_chat_owner")
    .update({ owner_user_id: userId, assigned_by: "takeover", assigned_at: new Date().toISOString() })
    .eq("sender", sender)
    .eq("owner_user_id", oldOwner)
    .select("sender");
  if (updateError) return { ok: false, error: "Gagal mengambil alih. Coba lagi." };
  if (!updated || updated.length === 0) return { ok: false, error: "PIC chat ini baru saja berubah. Muat ulang daftar." };
  const fromName = await nameOfAdmin(oldOwner);
  await writePicLog(sender, oldOwner, userId, `diambil alih dari ${fromName}`, userId);
  return { ok: true, from: fromName };
}
