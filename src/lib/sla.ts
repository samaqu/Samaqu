/**
 * Rumus kecepatan respons chat WhatsApp (halaman Performa Admin + PDF Bot vs Admin).
 * MODUL MURNI: tidak membaca database, jadi bisa diuji dengan data buatan. Waktu dihitung di WIB (UTC+7, tanpa DST).
 *
 * Istilah:
 *  - EPISODE: satu rangkaian pesan pelanggan yang menunggu balasan. Dimulai pada pesan pelanggan pertama yang belum
 *    terjawab, selesai pada balasan pertama berikutnya (admin, bot, atau penandaan "Sudah dibalas di HP").
 *    Beberapa pesan beruntun dari pelanggan yang sama = SATU episode (bot pun membalas sekali).
 *  - Waktu tunggu ADMIN dihitung dalam MENIT KERJA: hanya menit yang jatuh di jam dan hari operasional.
 *    Chat yang MASUK di luar jam/hari operasional tidak dihitung dalam SLA (malam dijawab bot), kecuali saklar
 *    `countOutsideHours` hidup; bila admin membalasnya tetap tampil di "selesai".
 *  - Episode yang belum terjawab lebih dari STALE_HOURS dianggap kedaluwarsa (kebanyakan tidak perlu dibalas, atau
 *    sudah dijawab di luar sistem sebelum tombol "dibalas di HP" ada) dan tidak dihitung menunggu/terlambat.
 *  - Waktu tunggu BOT dihitung MENIT BIASA (bot bekerja malam dan Minggu).
 *  - Balasan dari HP ("dibalas di HP") dihitung ke "selesai" admin yang menekan tombol, tetapi TIDAK masuk rata-rata
 *    respons dan SLA%, karena jam balasan aslinya tidak diketahui (jam penandaan bisa jauh lebih lambat).
 */

const WIB_MS = 7 * 3600_000;
const DAY_MS = 86_400_000;
const MAX_DAYS_LOOP = 400;

export interface SlaConfig {
  name: string;
  targetResponseMin: number;
  warningMin: number;
  lateMin: number;
  /** "HH:MM" (WIB). */
  openTime: string;
  closeTime: string;
  /** 0 = Minggu ... 6 = Sabtu. */
  opDays: number[];
  queueAlertThreshold: number;
  countOutsideHours: boolean;
  /** "YYYY-MM-DD" (WIB): chat yang MULAI sebelum tanggal ini tidak dihitung dalam performa admin (aturan baru berlaku mulai tanggal ini). */
  effectiveFrom: string;
}

export const DEFAULT_SLA: SlaConfig = {
  name: "Standar SAMAQU",
  targetResponseMin: 5,
  warningMin: 5,
  lateMin: 10,
  openTime: "08:00",
  closeTime: "16:30",
  opDays: [1, 2, 3, 4, 5, 6],
  queueAlertThreshold: 3,
  countOutsideHours: false,
  effectiveFrom: "2026-11-24",
};

/** Tanggal "YYYY-MM-DD" yang nyata di kalender? */
export function isRealDay(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

const hhmm = (v: unknown, fallback: string): string => {
  const m = String(v ?? "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return fallback;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return fallback;
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
};

const num = (v: unknown, fallback: number, min: number, max: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : fallback;
};

/** Baris `wa_sla_config` → SlaConfig. Nilai yang rusak/kosong jatuh ke default (tidak pernah melempar). */
export function parseSlaConfig(row: any): SlaConfig {
  if (!row || typeof row !== "object") return { ...DEFAULT_SLA, opDays: [...DEFAULT_SLA.opDays] };
  const warning = num(row.warning_min, DEFAULT_SLA.warningMin, 1, 240);
  const days = Array.isArray(row.op_days) ? [...new Set(row.op_days.map(Number).filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6))] : [];
  const open = hhmm(row.open_time, DEFAULT_SLA.openTime);
  const close = hhmm(row.close_time, DEFAULT_SLA.closeTime);
  return {
    name: String(row.name || DEFAULT_SLA.name).slice(0, 60),
    targetResponseMin: num(row.target_response_min, DEFAULT_SLA.targetResponseMin, 1, 240),
    warningMin: warning,
    lateMin: Math.max(warning, num(row.late_min, DEFAULT_SLA.lateMin, 1, 480)),
    openTime: open < close ? open : DEFAULT_SLA.openTime,
    closeTime: open < close ? close : DEFAULT_SLA.closeTime,
    opDays: days.length ? (days as number[]).sort((a, b) => a - b) : [...DEFAULT_SLA.opDays],
    queueAlertThreshold: num(row.queue_alert_threshold, DEFAULT_SLA.queueAlertThreshold, 1, 100),
    countOutsideHours: row.count_outside_hours === true,
    effectiveFrom: isRealDay(String(row.effective_from ?? "").slice(0, 10)) ? String(row.effective_from).slice(0, 10) : DEFAULT_SLA.effectiveFrom,
  };
}

const toMin = (hm: string): number => {
  const [h, m] = hm.split(":");
  return Number(h) * 60 + Number(m);
};

/** Apakah waktu ini (ms epoch) jatuh di jam dan hari operasional? */
export function isOperatingTime(ms: number, cfg: SlaConfig): boolean {
  const local = new Date(ms + WIB_MS);
  if (!cfg.opDays.includes(local.getUTCDay())) return false;
  const minOfDay = local.getUTCHours() * 60 + local.getUTCMinutes();
  return minOfDay >= toMin(cfg.openTime) && minOfDay < toMin(cfg.closeTime);
}

/** Menit kerja di antara dua waktu (hanya menit di jam/hari operasional). Saklar countOutsideHours = menit biasa. */
export function businessMinutes(startMs: number, endMs: number, cfg: SlaConfig): number {
  if (!(endMs > startMs)) return 0;
  if (cfg.countOutsideHours) return (endMs - startMs) / 60_000;
  const open = toMin(cfg.openTime);
  const close = toMin(cfg.closeTime);
  let total = 0;
  let dayStart = Math.floor((startMs + WIB_MS) / DAY_MS) * DAY_MS - WIB_MS; // 00:00 WIB hari mulai
  for (let i = 0; dayStart < endMs && i < MAX_DAYS_LOOP; i++, dayStart += DAY_MS) {
    const dow = new Date(dayStart + WIB_MS).getUTCDay();
    if (!cfg.opDays.includes(dow)) continue;
    const s = Math.max(dayStart + open * 60_000, startMs);
    const e = Math.min(dayStart + close * 60_000, endMs);
    if (e > s) total += (e - s) / 60_000;
  }
  return total;
}

/* ───────────────────────────── episode ───────────────────────────── */

export interface InboundRow {
  sender: string;
  /** ms epoch pesan masuk (wa_inbox.created_at). */
  createdAt: number;
  status: string;
  error?: string | null;
  /** ms epoch balasan bot (wa_inbox.replied_at). */
  repliedAt?: number | null;
  /** ms epoch pembaruan baris (dipakai sebagai jam penandaan "dibalas di HP"). */
  updatedAt?: number | null;
}

export interface AdminReplyRow {
  sender: string;
  adminEmail: string;
  /** ms epoch (wa_admin_replies.sent_at). */
  sentAt: number;
}

export type Responder =
  | { kind: "admin"; email: string }
  | { kind: "phone"; name: string }
  | { kind: "bot" }
  | { kind: "none" };

export interface Episode {
  sender: string;
  startAt: number;
  endAt: number | null;
  responder: Responder;
  /** Menit biasa dari mulai sampai selesai (atau sampai `nowMs` bila belum terjawab). */
  rawMin: number;
  /** Menit kerja (aturan SLA admin). */
  bizMin: number;
  /** Pesan pertama masuk di dalam jam/hari operasional? Chat di luar jam tidak dihitung dalam SLA (kecuali saklar hidup). */
  startedInHours: boolean;
  /** Belum terjawab dan umurnya lewat STALE_HOURS: dianggap tidak perlu dibalas / sudah dijawab di luar sistem. */
  stale: boolean;
}

/** Episode yang belum terjawab lebih lama dari ini (jam biasa) tidak dihitung menunggu/terlambat. */
export const STALE_HOURS = 24;

const PHONE_MARK = /^dibalas di HP \((.*)\)$/;

type Ev = { at: number; kind: "in" | "admin" | "bot" | "phone"; who?: string };

export function buildEpisodes(inbound: InboundRow[], adminReplies: AdminReplyRow[], cfg: SlaConfig, nowMs: number): Episode[] {
  const bySender = new Map<string, Ev[]>();
  const push = (sender: string, ev: Ev) => {
    const list = bySender.get(sender);
    if (list) list.push(ev);
    else bySender.set(sender, [ev]);
  };
  for (const m of inbound) {
    push(m.sender, { at: m.createdAt, kind: "in" });
    if (m.status === "sent" && m.repliedAt) push(m.sender, { at: m.repliedAt, kind: "bot" });
    const mark = m.status === "skipped" && m.error ? PHONE_MARK.exec(String(m.error)) : null;
    if (mark && m.updatedAt) push(m.sender, { at: m.updatedAt, kind: "phone", who: mark[1] });
  }
  for (const r of adminReplies) push(r.sender, { at: r.sentAt, kind: "admin", who: r.adminEmail });

  const rank = { admin: 0, bot: 0, phone: 0, in: 1 } as const; // pada waktu yang sama, balasan diproses sebelum pesan baru
  const out: Episode[] = [];
  for (const [sender, events] of bySender) {
    events.sort((a, b) => a.at - b.at || rank[a.kind] - rank[b.kind]);
    let open: number | null = null;
    for (const ev of events) {
      if (ev.kind === "in") {
        if (open === null) open = ev.at;
        continue;
      }
      if (open === null) continue; // balasan tanpa pesan menunggu (mis. admin menulis duluan)
      const responder: Responder = ev.kind === "admin" ? { kind: "admin", email: String(ev.who) } : ev.kind === "phone" ? { kind: "phone", name: String(ev.who) } : { kind: "bot" };
      out.push({
        sender,
        startAt: open,
        endAt: ev.at,
        responder,
        rawMin: (ev.at - open) / 60_000,
        bizMin: businessMinutes(open, ev.at, cfg),
        startedInHours: cfg.countOutsideHours || isOperatingTime(open, cfg),
        stale: false,
      });
      open = null;
    }
    if (open !== null) {
      out.push({
        sender,
        startAt: open,
        endAt: null,
        responder: { kind: "none" },
        rawMin: Math.max(0, (nowMs - open) / 60_000),
        bizMin: businessMinutes(open, nowMs, cfg),
        startedInHours: cfg.countOutsideHours || isOperatingTime(open, cfg),
        stale: nowMs - open > STALE_HOURS * 3600_000,
      });
    }
  }
  return out.sort((a, b) => a.startAt - b.startAt);
}

/* ───────────────────────────── ringkasan ───────────────────────────── */

export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

const mean = (v: number[]): number | null => (v.length ? v.reduce((t, x) => t + x, 0) / v.length : null);

export interface AdminIdentity {
  email: string;
  /** Nama tampilan: dipakai mencocokkan penandaan "dibalas di HP (nama)". */
  name: string;
  userId: string;
}

export interface AdminPerf {
  /** Chat yang ditangani: sudah dibalas admin ini (panel atau HP) + yang masih menunggu dan PIC-nya admin ini. */
  handled: number;
  /** Selesai = sudah dibalas admin ini (panel + HP). */
  finished: number;
  /** Dibalas lewat HP (bagian dari selesai, tidak ikut rata-rata/SLA). */
  viaPhone: number;
  /** Masih menunggu dan PIC-nya admin ini. */
  pending: number;
  /** Rata-rata menit kerja balasan pertama, hanya balasan lewat panel. null bila belum ada. */
  avgResponseMin: number | null;
  /** Lewat batas terlambat (termasuk yang masih menunggu dan sudah lewat). */
  late: number;
  /** Di atas batas warning tapi belum terlambat. */
  warning: number;
  /** Persen yang tercapai target; null bila belum ada yang bisa diukur. */
  slaPct: number | null;
  /** Jumlah episode yang masuk perhitungan SLA. */
  measured: number;
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Ringkasan SATU admin. `picOf(sender)` mengembalikan user id PIC chat itu (atau null).
 * Episode yang dijawab bot tidak pernah masuk ringkasan admin.
 */
export function summarizeAdmin(episodes: Episode[], cfg: SlaConfig, me: AdminIdentity, picOf: (sender: string) => string | null): AdminPerf {
  let finished = 0;
  let viaPhone = 0;
  let pending = 0;
  let late = 0;
  let warning = 0;
  let hit = 0;
  let measured = 0;
  const waits: number[] = [];

  for (const ep of episodes) {
    const r = ep.responder;
    const mine = (r.kind === "admin" && r.email.toLowerCase() === me.email.toLowerCase()) || (r.kind === "phone" && sameName(r.name, me.name));
    // Yang kedaluwarsa (menunggu > STALE_HOURS) tidak dihitung menunggu/terlambat: kemungkinan tidak perlu dibalas.
    const waiting = r.kind === "none" && !ep.stale && picOf(ep.sender) === me.userId;
    if (!mine && !waiting) continue;

    if (r.kind === "phone") {
      finished++;
      viaPhone++;
      continue; // jam balasan tidak diketahui → tidak diukur
    }
    // Chat yang MASUK di luar jam/hari operasional tidak dihitung dalam SLA (tetap dihitung "selesai" bila dibalas).
    if (!ep.startedInHours) {
      if (waiting) pending++;
      else finished++;
      continue;
    }
    if (waiting) {
      pending++;
      // Yang masih menunggu hanya dihitung ke SLA bila SUDAH melewati target (kalau belum, belum bisa dinilai).
      if (ep.bizMin > cfg.targetResponseMin) {
        measured++;
        if (ep.bizMin > cfg.lateMin) late++;
        else if (ep.bizMin > cfg.warningMin) warning++;
      }
      continue;
    }
    finished++;
    measured++;
    waits.push(ep.bizMin);
    if (ep.bizMin <= cfg.targetResponseMin) hit++;
    if (ep.bizMin > cfg.lateMin) late++;
    else if (ep.bizMin > cfg.warningMin) warning++;
  }

  return {
    handled: finished + pending,
    finished,
    viaPhone,
    pending,
    avgResponseMin: mean(waits),
    late,
    warning,
    slaPct: measured ? Math.round((hit / measured) * 1000) / 10 : null,
    measured,
  };
}

export interface SpeedStats {
  count: number;
  /** Menit biasa. */
  medianMin: number | null;
  p90Min: number | null;
  avgMin: number | null;
}

const speed = (values: number[]): SpeedStats => ({ count: values.length, medianMin: percentile(values, 50), p90Min: percentile(values, 90), avgMin: mean(values) });

/** Kecepatan BOT: episode yang dijawab bot, menit biasa (bot bekerja malam dan Minggu). */
export function summarizeBot(episodes: Episode[]): SpeedStats {
  return speed(episodes.filter((e) => e.responder.kind === "bot").map((e) => e.rawMin));
}

export interface TeamSpeed extends SpeedStats {
  /** Episode yang dibalas admin lewat HP (tidak diukur). */
  viaPhone: number;
  /** Persen tercapai target (balasan lewat panel). */
  slaPct: number | null;
}

/** Kecepatan GABUNGAN semua admin (tanpa nama per orang): menit kerja, hanya balasan lewat panel. */
export function summarizeTeam(episodes: Episode[], cfg: SlaConfig): TeamSpeed {
  const panel = episodes.filter((e) => e.responder.kind === "admin" && e.startedInHours);
  const waits = panel.map((e) => e.bizMin);
  const hit = panel.filter((e) => e.bizMin <= cfg.targetResponseMin).length;
  return {
    ...speed(waits),
    viaPhone: episodes.filter((e) => e.responder.kind === "phone").length,
    slaPct: panel.length ? Math.round((hit / panel.length) * 1000) / 10 : null,
  };
}

/* ───────────────────────────── validasi pengaturan ───────────────────────────── */

export interface SlaDbValue {
  name: string;
  target_response_min: number;
  warning_min: number;
  late_min: number;
  open_time: string;
  close_time: string;
  op_days: number[];
  queue_alert_threshold: number;
  count_outside_hours: boolean;
  /** Hanya ada bila dikirim form; kalau tidak, kolom di database tidak diubah. */
  effective_from?: string;
}

const strictInt = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= min && n <= max ? n : null;
};

/** Validasi ketat input form pengaturan SLA. Mengembalikan nilai siap simpan (nama kolom database) atau pesan galat. */
export function validateSlaInput(body: any): { ok: true; value: SlaDbValue } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Data pengaturan tidak valid." };
  const name = String(body.name ?? "").trim();
  if (name.length < 1 || name.length > 60) return { ok: false, error: "Nama konfigurasi harus 1–60 karakter." };
  const target = strictInt(body.targetResponseMin, 1, 240);
  if (target === null) return { ok: false, error: "Target respons harus angka 1–240 menit." };
  const warning = strictInt(body.warningMin, 1, 240);
  if (warning === null) return { ok: false, error: "Batas warning harus angka 1–240 menit." };
  const late = strictInt(body.lateMin, 1, 480);
  if (late === null) return { ok: false, error: "Batas terlambat harus angka 1–480 menit." };
  if (late < warning) return { ok: false, error: "Batas terlambat tidak boleh lebih kecil dari batas warning." };
  const open = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(body.openTime ?? "")) ? String(body.openTime) : null;
  const close = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(body.closeTime ?? "")) ? String(body.closeTime) : null;
  if (!open || !close) return { ok: false, error: "Jam operasional harus berformat JJ:MM." };
  if (open >= close) return { ok: false, error: "Jam buka harus lebih awal dari jam tutup." };
  const rawDays: unknown[] = Array.isArray(body.opDays) ? body.opDays : [];
  const days = [...new Set(rawDays.map((d) => Number(d)))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b);
  if (days.length === 0 || days.length !== new Set(rawDays.map((d) => Number(d))).size) return { ok: false, error: "Pilih minimal satu hari operasional (Min–Sab)." };
  const queue = strictInt(body.queueAlertThreshold, 1, 100);
  if (queue === null) return { ok: false, error: "Ambang alert antrean harus angka 1–100." };
  if (typeof body.countOutsideHours !== "boolean") return { ok: false, error: "Pilihan hitung di luar jam operasional tidak valid." };
  if (body.effectiveFrom !== undefined && !isRealDay(body.effectiveFrom)) return { ok: false, error: "Tanggal mulai berlaku tidak valid." };
  return {
    ok: true,
    value: {
      name,
      target_response_min: target,
      warning_min: warning,
      late_min: late,
      open_time: open,
      close_time: close,
      op_days: days,
      queue_alert_threshold: queue,
      count_outside_hours: body.countOutsideHours,
      ...(body.effectiveFrom !== undefined ? { effective_from: body.effectiveFrom } : {}),
    },
  };
}
