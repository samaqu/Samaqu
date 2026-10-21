/**
 * Jendela Open Order: tanggal mulai + tanggal tutup.
 *
 * Diatur dari menu admin "Open Order" dan disimpan di `store_settings`:
 * `open_order_start_date` + `open_order_end_date` (DATE). Kolom lama `open_order_series` sudah
 * tidak dipakai — pemilihan produk Open Order sekarang lewat kolom `products.open_order_enabled`.
 *
 * Tanggal dibandingkan sebagai teks "YYYY-MM-DD" (tanggal lokal), bukan objek Date, supaya
 * tidak bergeser gara-gara zona waktu. Dipakai halaman admin *dan* halaman publik /open-order,
 * jadi aturan buka/tutupnya cuma ada di satu tempat ini.
 */

export type OpenOrderState = "open" | "before" | "closed";

/** Selisih WIB dari UTC dalam milidetik (WIB = UTC+7). */
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Subset `store_settings` yang mengatur jendela Open Order. */
export interface OpenOrderWindow {
  open_order_start_date?: string | null;
  open_order_end_date?: string | null;
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
 * Status Open Order dari tanggalnya:
 * - `before` — hari ini masih sebelum tanggal mulai,
 * - `open`   — hari ini di dalam rentang (atau rentangnya belum diatur sama sekali),
 * - `closed` — hari ini sudah lewat tanggal tutup.
 */
export function resolveOpenOrderState(window: OpenOrderWindow, today = todayIso()): OpenOrderState {
  const start = (window.open_order_start_date ?? "").trim();
  const end = (window.open_order_end_date ?? "").trim();
  if (start && today < start) return "before";
  if (end && today > end) return "closed";
  if (start || end) return "open";
  // Tanggalnya belum diatur → ikut toggle lama supaya perilaku sebelumnya tetap jalan.
  return window.open_order_active === false ? "closed" : "open";
}

/**
 * Batas akhir jendela Open Order dalam epoch ms — 23:59:59.999 **WIB** pada tanggal tutup.
 *
 * Tanggal di `store_settings` dianggap hari lokal toko (WIB), jadi batas akhirnya dihitung
 * sebagai 16:59:59.999 UTC hari yang sama. `null` kalau tanggal tutup belum diisi — artinya
 * tidak ada hitung mundur yang bisa ditampilkan (bukan berarti sudah habis).
 */
export function openOrderDeadline(window: OpenOrderWindow): number | null {
  const end = (window.open_order_end_date ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(end);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // 23:59:59.999 WIB = 16:59:59.999 UTC pada hari yang sama.
  return Date.UTC(year, month - 1, day, 16, 59, 59, 999);
}

/**
 * Batas **mulai** jendela Open Order dalam epoch ms — 00:00:00.000 **WIB** pada tanggal mulai.
 *
 * Dipakai untuk hitung mundur "Buka dalam …" saat periode belum dibuka. `null` kalau tanggal
 * mulainya belum diisi (jadualnya belum diatur → tidak ada hitung mundur yang bisa ditampilkan).
 */
export function openOrderStartDeadline(window: OpenOrderWindow): number | null {
  const start = (window.open_order_start_date ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(start);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // 00:00:00.000 WIB = 17:00:00.000 UTC pada hari SEBELUMNYA.
  return Date.UTC(year, month - 1, day) - WIB_OFFSET_MS;
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

