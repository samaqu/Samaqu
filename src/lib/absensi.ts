/**
 * Hitung absensi harian dari riwayat status (`admin_status_log`) dan jam terakhir terlihat per hari (`admin_seen_daily`).
 * Fungsi murni (tanpa database) supaya bisa diuji dengan data contoh. Semua "hari" memakai WIB (UTC+7, tanpa DST).
 *
 * Aturan:
 *  - Masuk   = klik Aktif PERTAMA pada hari itu.
 *  - Pulang  = klik Pulang manual TERAKHIR pada hari itu.
 *  - Jam kerja = jumlah durasi Aktif; Istirahat dihitung terpisah. Sesi berakhir saat catatan berikutnya.
 *  - Sesi tidak pernah melewati tengah malam WIB: dipotong per hari.
 *  - Lupa pulang: sesi terbuka di hari yang sudah lewat berakhir di jam terakhir terlihat hari itu
 *    (atau tidak dihitung bila tidak ada), dan hari itu ditandai. Catatan Pulang otomatis (source 'auto') juga menandai hari itu.
 *  - Hari ini yang masih berjalan dihitung sampai sekarang (ongoing).
 */

export interface StatusLogRow {
  user_id: string;
  status: string;
  at: string;
  source?: string | null;
}
export interface SeenRow {
  user_id: string;
  day: string;
  last_seen: string;
}
export interface DayRow {
  userId: string;
  day: string;
  masuk: string | null;
  pulang: string | null;
  breakMs: number;
  /** Total waktu Aktif hari itu (sudah termasuk lembur). */
  workMs: number;
  /** Bagian waktu Aktif setelah jam pulang jadwal (hanya di hari kerja). */
  overtimeMs: number;
  /** Masuk lewat jam jadwal + toleransi (hanya di hari kerja). */
  late: boolean;
  forgotPulang: boolean;
  ongoing: boolean;
}

const WIB_MS = 7 * 3600_000;
const DAY_MS = 86_400_000;

/**
 * Jadwal kerja admin panel (menit sejak 00:00 WIB). Satu tempat untuk mengubah jadwal.
 * workDays: 0 = Minggu, 1 = Senin, ..., 6 = Sabtu.
 */
export const SCHEDULE = {
  startMin: 8 * 60,
  endMin: 16 * 60 + 30,
  breakStartMin: 11 * 60 + 30,
  breakEndMin: 13 * 60,
  graceMin: 10,
  workDays: [1, 2, 3, 4, 5, 6],
} as const;

/** Hari kerja menurut jadwal? `day` = tanggal kalender YYYY-MM-DD. */
export const isWorkday = (day: string) => (SCHEDULE.workDays as readonly number[]).includes(new Date(`${day}T00:00:00Z`).getUTCDay());
/** Menit sejak 00:00 WIB dari waktu epoch ms. */
export const wibMinutes = (ms: number) => Math.floor((((ms + WIB_MS) % DAY_MS) + DAY_MS) % DAY_MS / 60_000);

/** Tanggal WIB (YYYY-MM-DD) dari waktu epoch ms. */
export const wibDay = (ms: number) => new Date(ms + WIB_MS).toISOString().slice(0, 10);
/** Epoch ms awal hari WIB (00:00) untuk tanggal YYYY-MM-DD. */
export const wibDayStart = (day: string) => Date.parse(`${day}T00:00:00Z`) - WIB_MS;

export function computeAbsensi(input: { logs: StatusLogRow[]; seen: SeenRow[]; month: string; nowMs: number }): DayRow[] {
  const { logs, seen, month, nowMs } = input;
  const today = wibDay(nowMs);

  const seenMap = new Map<string, number>();
  for (const s of seen) {
    const ms = Date.parse(s.last_seen);
    if (Number.isFinite(ms)) seenMap.set(`${s.user_id}|${s.day}`, ms);
  }

  const byUser = new Map<string, StatusLogRow[]>();
  for (const l of logs) {
    if (!Number.isFinite(Date.parse(l.at))) continue;
    const list = byUser.get(l.user_id) || [];
    list.push(l);
    byUser.set(l.user_id, list);
  }

  const rows = new Map<string, DayRow>();
  const rowOf = (userId: string, day: string): DayRow => {
    const key = `${userId}|${day}`;
    let r = rows.get(key);
    if (!r) {
      r = { userId, day, masuk: null, pulang: null, breakMs: 0, workMs: 0, overtimeMs: 0, late: false, forgotPulang: false, ongoing: false };
      rows.set(key, r);
    }
    return r;
  };

  for (const [userId, list] of byUser) {
    list.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    for (let i = 0; i < list.length; i++) {
      const cur = list[i];
      const start = Date.parse(cur.at);
      const startDay = wibDay(start);

      if (cur.status === "pulang") {
        const r = rowOf(userId, startDay);
        if (cur.source === "auto") r.forgotPulang = true;
        else r.pulang = cur.at;
        continue;
      }
      if (cur.status !== "aktif" && cur.status !== "istirahat") continue;

      const r0 = rowOf(userId, startDay);
      if (cur.status === "aktif" && !r0.masuk) r0.masuk = cur.at;
      // Bekerja lagi setelah klik Pulang: hari itu belum selesai, jam Pulang sebelumnya tidak berlaku.
      r0.pulang = null;

      const next = list[i + 1];
      let end: number;
      if (next) {
        end = Date.parse(next.at);
      } else if (startDay === today) {
        end = nowMs;
        r0.ongoing = true;
      } else {
        // Sesi terbuka di hari yang sudah lewat = lupa pulang.
        const last = seenMap.get(`${userId}|${startDay}`);
        end = last && last > start ? Math.min(last, wibDayStart(startDay) + DAY_MS) : start;
        r0.forgotPulang = true;
      }

      // Potong per hari WIB.
      let cursor = start;
      while (cursor < end) {
        const d = wibDay(cursor);
        const segEnd = Math.min(end, wibDayStart(d) + DAY_MS);
        const r = rowOf(userId, d);
        if (cur.status === "aktif") {
          r.workMs += segEnd - cursor;
          if (isWorkday(d)) {
            const overtimeFrom = Math.max(cursor, wibDayStart(d) + SCHEDULE.endMin * 60_000);
            if (segEnd > overtimeFrom) r.overtimeMs += segEnd - overtimeFrom;
          }
        } else {
          r.breakMs += segEnd - cursor;
        }
        cursor = segEnd;
      }
    }
  }

  for (const r of rows.values()) {
    r.late = Boolean(r.masuk) && isWorkday(r.day) && wibMinutes(Date.parse(r.masuk as string)) > SCHEDULE.startMin + SCHEDULE.graceMin;
  }

  return [...rows.values()]
    .filter((r) => r.day.startsWith(month))
    .sort((a, b) => (a.day === b.day ? a.userId.localeCompare(b.userId) : a.day < b.day ? 1 : -1));
}

export interface AbsensiSummary {
  /** Hari kerja yang sudah berjalan di bulan itu (hari ini ikut dihitung hanya bila sudah absen masuk atau harinya sudah lewat jam pulang). */
  workdays: number;
  /** Hari ada catatan masuk (hari apa pun). */
  hadir: number;
  /** Hari hadir yang jatuh di hari kerja (dasar persen). */
  hadirWorkdays: number;
  late: number;
  forgot: number;
  workMs: number;
  overtimeMs: number;
  /** 0–100, atau null bila belum ada hari kerja yang berjalan. */
  kehadiran: number | null;
}

/** Rekap satu admin untuk satu bulan dari baris harian miliknya. */
export function summarize(days: DayRow[], month: string, nowMs: number): AbsensiSummary {
  const today = wibDay(nowMs);
  const nowMin = wibMinutes(nowMs);
  const todayRow = days.find((d) => d.day === today);

  let workdays = 0;
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  for (let i = 1; i <= last; i++) {
    const day = `${month}-${String(i).padStart(2, "0")}`;
    if (day > today || !isWorkday(day)) continue;
    if (day === today && !todayRow?.masuk && nowMin < SCHEDULE.endMin) continue;
    workdays += 1;
  }

  let hadir = 0;
  let hadirWorkdays = 0;
  let late = 0;
  let forgot = 0;
  let workMs = 0;
  let overtimeMs = 0;
  for (const d of days) {
    if (d.masuk) {
      hadir += 1;
      if (isWorkday(d.day)) hadirWorkdays += 1;
    }
    if (d.late) late += 1;
    if (d.forgotPulang) forgot += 1;
    workMs += d.workMs;
    overtimeMs += d.overtimeMs;
  }
  const kehadiran = workdays > 0 ? Math.min(100, Math.round((hadirWorkdays / workdays) * 100)) : null;
  return { workdays, hadir, hadirWorkdays, late, forgot, workMs, overtimeMs, kehadiran };
}
