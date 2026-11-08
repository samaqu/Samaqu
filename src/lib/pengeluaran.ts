/**
 * Helper bersama modul Pengeluaran (/ops/pengeluaran).
 *
 * Dipakai route `api/ops/pengeluaran` (transaksi) dan `api/ops/pengeluaran/barang`
 * (master barang packing) supaya validasi, jendela bulan WIB, dan pesan error
 * tidak ditulis dua kali.
 */

export type PengeluaranTipe = "packing" | "operasional";

export const PENGELUARAN_TIPE: PengeluaranTipe[] = ["packing", "operasional"];

/** Pesan jelas kalau migration belum dijalankan di Supabase. */
export const PENGELUARAN_TABLE_HINT =
  "Tabel pengeluaran belum dibuat. Jalankan supabase/migrations/20261109_pengeluaran.sql di Supabase SQL Editor.";

const DAY_MS = 86_400_000;

type DbError = { code?: string; message?: string } | null | undefined;

/** Terjemahkan error Supabase/PostgREST jadi pesan bahasa Indonesia yang bisa dibaca admin. */
export function pengeluaranDbError(error: DbError, action: string): string {
  const code = String(error?.code || "");
  const message = String(error?.message || "");

  if (code === "42P01" || code === "PGRST205" || /could not find the table|relation .* does not exist/i.test(message)) {
    return PENGELUARAN_TABLE_HINT;
  }
  if (code === "42703") return "Struktur tabel pengeluaran belum lengkap. Jalankan migration 20261109_pengeluaran.sql.";
  if (code === "23505") return "Data ini sudah tersimpan (request_id sama), tidak disimpan dua kali.";
  if (code === "23503") return "Barang yang dipilih tidak ditemukan. Muat ulang halaman lalu coba lagi.";
  if (code === "23514") return "Data pengeluaran tidak lolos validasi database.";
  return `Gagal ${action} pengeluaran`;
}

export function asText(value: unknown, max = 500): string | null {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, max) : null;
}

/** Angka rupiah/qty (selalu positif). Menerima "12.500" / "12500" / 12500. */
export function asInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value).replace(/[^\d]/g, "");
  if (!raw) return null;
  const number = Number(raw);
  return Number.isFinite(number) ? Math.round(number) : null;
}

export function asDateKey(value: unknown): string | null {
  const key = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const date = new Date(`${key}T00:00:00+07:00`);
  return Number.isNaN(date.getTime()) ? null : key;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

/**
 * Bulan/tahun yang diminta (default bulan berjalan WIB) + batas tanggalnya.
 *
 * Batas dihitung dari tengah malam WIB lalu dikembalikan sebagai kunci `YYYY-MM-DD`
 * untuk kolom `expenses.tanggal` (date), jadi tidak pernah bergeser zona waktu.
 */
export function readPengeluaranPeriod(bulanParam?: unknown, tahunParam?: unknown, offsetMs = 0) {
  const nowWib = new Date(Date.now() + offsetMs);
  const bulan = clampInt(bulanParam, 1, 12, nowWib.getUTCMonth() + 1);
  const tahun = clampInt(tahunParam, 2000, 2100, nowWib.getUTCFullYear());

  const startUtc = Date.UTC(tahun, bulan - 1, 1) - offsetMs;
  const endUtc = Date.UTC(tahun, bulan, 1) - offsetMs;
  const toKey = (ms: number) => new Date(ms + offsetMs).toISOString().slice(0, 10);

  return {
    bulan,
    tahun,
    from: toKey(startUtc),
    to: toKey(endUtc - DAY_MS),
  };
}

type ExpenseRow = {
  tipe?: string | null;
  qty?: number | null;
  jumlah?: number | null;
  kategori?: string | null;
};

export type PengeluaranSummary = {
  jumlah_transaksi: number;
  total_kuantitas: number;
  total_biaya: number;
  kategori_terbesar: { kategori: string; jumlah: number } | null;
};

/** Ringkasan satu tipe pengeluaran (dipakai kartu ringkasan di halaman). */
export function buildPengeluaranSummary(rows: ExpenseRow[]): PengeluaranSummary {
  let totalBiaya = 0;
  let totalKuantitas = 0;
  const perKategori = new Map<string, number>();

  for (const row of rows) {
    const jumlah = Number(row.jumlah) || 0;
    totalBiaya += jumlah;
    totalKuantitas += Number(row.qty) || 0;

    const kategori = String(row.kategori || "").trim();
    if (!kategori) continue;
    perKategori.set(kategori, (perKategori.get(kategori) || 0) + jumlah);
  }

  let kategoriTerbesar: { kategori: string; jumlah: number } | null = null;
  for (const [kategori, jumlah] of perKategori.entries()) {
    if (!kategoriTerbesar || jumlah > kategoriTerbesar.jumlah) kategoriTerbesar = { kategori, jumlah };
  }

  return {
    jumlah_transaksi: rows.length,
    total_kuantitas: totalKuantitas,
    total_biaya: totalBiaya,
    kategori_terbesar: kategoriTerbesar,
  };
}
