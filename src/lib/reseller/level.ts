/**
 * Level reseller (Silver / Gold / Platinum) — murni TAMPILAN motivasi, tidak mengubah harga.
 *
 * Dasar: rata-rata belanja modal (harga beli) per bulan dalam 90 hari terakhir. Memakai jendela
 * 90 hari berjalan (bukan bulan kalender) supaya level tidak anjlok di tanggal 1 hanya karena
 * awal bulan masih sepi. Reseller yang baru bergabung dibagi jumlah bulan sejak bergabung
 * (minimal 1, maksimal 3), jadi tidak dirugikan karena belum punya 3 bulan riwayat.
 * Pesanan `dibatalkan` tidak dihitung — sama seperti kartu "Belanja modal".
 *
 * Batas level ada di SATU tempat ini (LEVELS). Ubah angkanya di sini saja.
 */

export type LevelKey = "silver" | "gold" | "platinum";

export interface LevelTier {
  key: LevelKey;
  label: string;
  /** Rata-rata belanja per bulan (Rp) minimal untuk level ini. */
  min: number;
}

export const LEVELS: readonly LevelTier[] = [
  { key: "silver", label: "Silver", min: 0 },
  { key: "gold", label: "Gold", min: 2_500_000 },
  { key: "platinum", label: "Platinum", min: 7_500_000 },
];

/** Jendela hitung (hari) dan batas bulan pembagi. */
export const LEVEL_WINDOW_DAYS = 90;
const DAYS_PER_MONTH = 30;
const MAX_MONTHS = 3;

export interface LevelSummary {
  key: LevelKey;
  label: string;
  /** Rata-rata belanja per bulan (Rp, dibulatkan). */
  rata_rata: number;
  /** Pembagi bulan yang dipakai (1–3); kurang dari 3 berarti reseller masih baru. */
  bulan_dihitung: number;
  /** Level berikutnya, atau null kalau sudah tertinggi. */
  next: LevelTier | null;
  /** Kekurangan rata-rata belanja per bulan untuk naik level (0 kalau sudah tertinggi). */
  sisa: number;
  /** Progres 0–100 di dalam level sekarang menuju level berikutnya. */
  progress: number;
  /** Semua level (untuk menggambar tangga di UI tanpa menulis ulang angkanya). */
  tiers: readonly LevelTier[];
}

/** Pembagi bulan: umur akun dalam 30 harian, dijepit 1..3. */
export function bulanDihitung(createdAt: string | Date | null | undefined, now: Date = new Date()): number {
  if (!createdAt) return MAX_MONTHS;
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(created.getTime())) return MAX_MONTHS;
  const months = (now.getTime() - created.getTime()) / (DAYS_PER_MONTH * 24 * 3600 * 1000);
  return Math.min(MAX_MONTHS, Math.max(1, months));
}

/** Hitung level dari total belanja modal dalam jendela 90 hari dan pembagi bulannya. */
export function hitungLevel(belanjaJendela: number, bulan: number = MAX_MONTHS): LevelSummary {
  const total = Math.max(0, Number(belanjaJendela) || 0);
  const pembagi = Math.min(MAX_MONTHS, Math.max(1, Number(bulan) || MAX_MONTHS));
  const rataRata = Math.round(total / pembagi);

  let index = 0;
  for (let i = 0; i < LEVELS.length; i += 1) {
    if (rataRata >= LEVELS[i].min) index = i;
  }
  const current = LEVELS[index];
  const next = LEVELS[index + 1] ?? null;

  const sisa = next ? Math.max(0, next.min - rataRata) : 0;
  const progress = next
    ? Math.min(100, Math.max(0, Math.round(((rataRata - current.min) / (next.min - current.min)) * 100)))
    : 100;

  return {
    key: current.key,
    label: current.label,
    rata_rata: rataRata,
    bulan_dihitung: Math.round(pembagi * 10) / 10,
    next,
    sisa,
    progress,
    tiers: LEVELS,
  };
}
