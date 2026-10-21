/**
 * Jendela Open Order: tanggal mulai + jam buka, tanggal tutup + jam tutup.
 *
 * Diatur dari menu admin "Open Order" dan disimpan di `store_settings`:
 * - `open_order_start_date` + `open_order_end_date` (DATE),
 * - `open_order_start_time` + `open_order_end_time` (TEXT "HH:MM", **WIB**).
 *
 * Kolom jamnya opsional: kosong → mulai 00:00 dan tutup 23:59:59 (perilaku lama, saat
 * hanya tanggal yang dipakai). Kolomnya dibuat lewat `supabase/migrations/20261021_open_order_time.sql`
 * — selama belum dijalankan, kodenya tetap jalan dengan fallback jam kosong.
 *
 * Semua jam dihitung dalam **WIB** (toko ada di Indonesia), jadi hasilnya sama untuk
 * semua Pengunjung dan untuk adminnya, nggak bergantung zona waktu perangkat.
 */

export type OpenOrderState = "open" | "before" | "closed";

/** Selisih WIB dari UTC dalam milidetik (WIB = UTC+7). */
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Subset `store_settings` yang mengatur jendela Open Order. */
export interface OpenOrderWindow {
  open_order_start_date?: string | null;
  open_order_end_date?: string | null;
  /** Jam buka pada tanggal mulai — "HH:MM" WIB. Kosong = 00:00. */
  open_order_start_time?: string | null;
  /** Jam tutup pada tanggal tutup — "HH:MM" WIB. Kosong = 23:59. */
  open_order_end_time?: string | null;
  /** Toggle lama — dipakai sebagai fallback selama tanggalnya belum diisi. */
  open_order_active?: boolean | null;
}

const MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

/** Tanggal hari ini (lokal) sebagai "YYYY-MM-DD" — format yang sama dengan kolom DATE. */
export function todayIso(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "2026-08-08" → "8 Agustus 2026". Kosong/ngawur → "". */
export function formatDateLabel(iso?: string | null): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso ?? "").trim());
  if (!match) return "";
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return "";
  return `${Number(match[3])} ${month} ${match[1]}`;
}

/**
 * Teks periode untuk halaman /open-order, mis. "8 Agustus 2026 – 15 Agustus 2026".
 * Kalau tanggalnya belum diisi → `fallback` (nilai lama `OPEN_ORDER_PERIOD`).
 */
export function formatOpenOrderPeriod(window: OpenOrderWindow, fallback: string): string {
  const start = formatDateLabel(window.open_order_start_date);
  const end = formatDateLabel(window.open_order_end_date);
  if (start && end) return `${start} – ${end}`;
  if (start) return `Mulai ${start}`;
  if (end) return `Sampai ${end}`;
  return fallback;
}

/**
 * Rentang ringkas untuk kalimat, mis. "14–17 Oktober 2026" saat bulan & tahunnya sama.
 * Kalau rentangnya beda bulan/tahun, tetap pakai `formatOpenOrderPeriod`.
 */
export function formatOpenOrderPeriodCompact(window: OpenOrderWindow, fallback: string): string {
  const startMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec((window.open_order_start_date ?? "").trim());
  const endMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec((window.open_order_end_date ?? "").trim());
  if (!startMatch || !endMatch) return formatOpenOrderPeriod(window, fallback);

  const startYear = startMatch[1];
  const startMonth = MONTHS[Number(startMatch[2]) - 1];
  const startDay = Number(startMatch[3]);
  const endYear = endMatch[1];
  const endMonth = MONTHS[Number(endMatch[2]) - 1];
  const endDay = Number(endMatch[3]);
  if (!startMonth || !endMonth) return formatOpenOrderPeriod(window, fallback);

  if (startYear === endYear && startMonth === endMonth) {
    return `${startDay}–${endDay} ${startMonth} ${startYear}`;
  }
  if (startYear === endYear) {
    return `${startDay} ${startMonth} – ${endDay} ${endMonth} ${startYear}`;
  }
  return `${startDay} ${startMonth} ${startYear} – ${endDay} ${endMonth} ${endYear}`;
}

/**
 * Status Open Order dari tanggal + jamnya:
 * - `before` — sekarang masih sebelum (tanggal mulai + jam buka),
 * - `open`   — sekarang di dalam rentang (atau rentangnya belum diatur sama sekali),
 * - `closed` — sekarang sudah lewat (tanggal tutup + jam tutup).
 *
 * Perbandingan pakai epoch ms dalam **WIB**, jadi hasilnya sama untuk semua perangkat.
 */
export function resolveOpenOrderState(window: OpenOrderWindow, now = Date.now()): OpenOrderState {
  const start = openOrderStartDeadline(window);
  const end = openOrderDeadline(window);
  if (start != null && now < start) return "before";
  if (end != null && now > end) return "closed";
  if (start != null || end != null) return "open";
  // Tanggalnya belum diatur → ikut toggle lama supaya perilaku sebelumnya tetap jalan.
  return window.open_order_active === false ? "closed" : "open";
}

/** "HH:MM" → { jam, menit }. `null` kalau kosong atau formatnya nggak valid. */
export function parseHhMm(value?: string | null): { h: number; m: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec((value ?? "").trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/**
 * Label momen jendela untuk ditampilkan: "21 Oktober 2026 · 10.00 WIB".
 *
 * `short` → bulan disingkat ("22 Okt 2026 · 23.59 WIB"), dipakai buat pesan "Berakhir …".
 * Jamnya kosong → tanggalnya saja (tanpa jam).
 */
export function formatOpenOrderMoment(
  dateIso?: string | null,
  time?: string | null,
  short = false,
): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((dateIso ?? "").trim());
  if (!match) return "";
  const day = Number(match[3]);
  const year = match[1];
  const month = short ? MONTHS_SHORT[Number(match[2]) - 1] : MONTHS[Number(match[2]) - 1];
  if (!month) return "";
  const datePart = `${day} ${month} ${year}`;
  const parsed = parseHhMm(time);
  if (!parsed) return datePart;
  const hh = String(parsed.h).padStart(2, "0");
  const mm = String(parsed.m).padStart(2, "0");
  return `${datePart} · ${hh}.${mm} WIB`;
}

/**
 * Epoch ms untuk "YYYY-MM-DD" + jam "HH:MM" dalam **WIB**.
 * - `time` kosong → jamnya pakai default: 00:00 (buka) atau 23:59:59.999 (tutup).
 * - `null` kalau tanggalnya kosong/ngawur → artinya tidak ada batas yang bisa dihitung.
 */
function wibTimestamp(
  date: string | null | undefined,
  time: string | null | undefined,
  defaultHour: number,
  defaultMinute: number,
  defaultSecond: number,
  defaultMs: number,
): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((date ?? "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = parseHhMm(time);
  const hour = parsed ? parsed.h : defaultHour;
  const minute = parsed ? parsed.m : defaultMinute;
  // Kalau jamnya diisi eksplisit → detik/milidetik 0 (batasnya tepat di menit itu).
  // Kalau kosong → pakai default (mis. 23:59:59.999 untuk batas tutup).
  const second = parsed ? 0 : defaultSecond;
  const ms = parsed ? 0 : defaultMs;
  // WIB = UTC+7 → epoch UTC = waktu WIB - 7 jam.
  return Date.UTC(year, month - 1, day, hour, minute, second, ms) - WIB_OFFSET_MS;
}

/**
 * Batas akhir jendela Open Order dalam epoch ms — jam tutup **WIB** pada tanggal tutup.
 *
 * Kalau `open_order_end_time` kosong, batasnya jatuh di 23:59:59.999 WIB (perilaku lama
 * saat jendelanya cuma pakai tanggal). `null` kalau tanggal tuturnya belum diisi — artinya
 * tidak ada hitung mundur yang bisa ditampilkan (bukan berarti sudah habis).
 */
export function openOrderDeadline(window: OpenOrderWindow): number | null {
  return wibTimestamp(window.open_order_end_date, window.open_order_end_time, 23, 59, 59, 999);
}

/**
 * Batas **mulai** jendela Open Order dalam epoch ms — jam buka **WIB** pada tanggal mulai.
 *
 * Kalau `open_order_start_time` kosong, batasnya jatuh di 00:00.000 WIB (perilaku lama).
 * Dipakai untuk hitung mundur "Dibuka dalam …" saat periode belum dibuka. `null` kalau
 * tanggal mulainya belum diisi (jadualnya belum diatur → tidak ada hitung mundur).
 */
export function openOrderStartDeadline(window: OpenOrderWindow): number | null {
  return wibTimestamp(window.open_order_start_date, window.open_order_start_time, 0, 0, 0, 0);
}

/** Pecahan sisa waktu (ms) untuk countdown: hari / jam / menit / detik. */
export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/**
 * Pecah sisa waktu (ms) jadi satuan countdown. Nilai negatif → 0 semua (waktu habis).
 * Fungsi murni, tanpa akses jam sistem, jadi bisa diuji tanpa browser.
 */
export function splitCountdown(remainingMs: number): CountdownParts {
  const total = Math.max(0, Math.floor(remainingMs / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

