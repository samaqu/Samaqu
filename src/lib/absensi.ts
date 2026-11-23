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
  workMs: number;
  forgotPulang: boolean;
  ongoing: boolean;
}

const WIB_MS = 7 * 3600_000;
const DAY_MS = 86_400_000;

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
      r = { userId, day, masuk: null, pulang: null, breakMs: 0, workMs: 0, forgotPulang: false, ongoing: false };
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
        if (cur.status === "aktif") r.workMs += segEnd - cursor;
        else r.breakMs += segEnd - cursor;
        cursor = segEnd;
      }
    }
  }

  return [...rows.values()]
    .filter((r) => r.day.startsWith(month))
    .sort((a, b) => (a.day === b.day ? a.userId.localeCompare(b.userId) : a.day < b.day ? 1 : -1));
}
