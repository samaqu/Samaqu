/**
 * Bulan periode (WIB) — satu sumber untuk pemilih periode dashboard admin.
 *
 * Semua batas bulan di app ini memakai **WIB**, bukan zona waktu browser/perangkat:
 * 00:00 WIB tanggal 1 = 17:00 UTC hari terakhir bulan sebelumnya. Dashboard admin dulu
 * menghitungnya sendiri di `src/app/admin/page.tsx` (`currentMonthValue`, `monthLabelParts`,
 * `monthRangeUTC`, pergeseran bulan di `shiftDashMonth`); semuanya sekarang memanggil modul ini
 * supaya rentang query, label periode, dan label sumbu grafik tidak bisa saling berbeda.
 */

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

export const MONTH_NAMES_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export const MONTH_SHORT_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** Tahun + indeks bulan (0-11) WIB sekarang. */
function nowPartsWIB(): { year: number; month: number } {
  const wib = new Date(Date.now() + WIB_OFFSET_MS);
  return { year: wib.getUTCFullYear(), month: wib.getUTCMonth() };
}

/**
 * Baca "YYYY-MM"; nilai kosong/tidak dikenal jatuh ke bulan WIB sekarang supaya pemilih
 * periode tidak pernah menampilkan rentang kosong.
 */
function parseMonth(value: string): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(String(value || "").trim());
  if (!m) return nowPartsWIB();
  return { year: Number(m[1]), month: Number(m[2]) - 1 };
}

function formatMonth(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

/** Bulan WIB sekarang, "YYYY-MM". */
export function currentMonthWIB(): string {
  const { year, month } = nowPartsWIB();
  return formatMonth(year, month);
}

/** "YYYY-MM" digeser `delta` bulan (boleh negatif), mis. `monthShift("2026-01", -1)` → `"2025-12"`. */
export function monthShift(value: string, delta: number): string {
  const { year, month } = parseMonth(value);
  const d = new Date(Date.UTC(year, month + delta, 1));
  return formatMonth(d.getUTCFullYear(), d.getUTCMonth());
}

/** "2026-10" → "Oktober 2026". */
export function monthLabelID(value: string): string {
  const { year, month } = parseMonth(value);
  return `${MONTH_NAMES_ID[month]} ${year}`;
}

/** "2026-10" → "Okt" (label chip tren & sumbu grafik). */
export function monthShortID(value: string): string {
  const { month } = parseMonth(value);
  return MONTH_SHORT_ID[month];
}

/** Timestamp ISO → bulan WIB "YYYY-MM" (pesanan jam 00:30 WIB tetap masuk bulan itu). */
export function monthKeyWIB(iso: string | null | undefined): string {
  const t = new Date(String(iso || "")).getTime();
  if (!Number.isFinite(t)) return "";
  const wib = new Date(t + WIB_OFFSET_MS);
  return formatMonth(wib.getUTCFullYear(), wib.getUTCMonth());
}

/**
 * Rentang UTC `[awal, akhir)` untuk satu bulan WIB — dipakai membandingkan `orders.created_at`
 * (PostgREST membandingkan dalam UTC), jadi awal bulan WIB = 17:00 UTC hari terakhir bulan
 * sebelumnya.
 */
export function monthRangeWIB(value: string): { startISO: string; endISO: string } {
  const { year, month } = parseMonth(value);
  return {
    startISO: new Date(Date.UTC(year, month, 1) - WIB_OFFSET_MS).toISOString(),
    endISO: new Date(Date.UTC(year, month + 1, 1) - WIB_OFFSET_MS).toISOString(),
  };
}
