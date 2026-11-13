/**
 * Level reseller (Silver / Gold / Platinum) — murni TAMPILAN motivasi, tidak mengubah harga.
 *
 * Dasar: rata-rata belanja modal (harga beli) per bulan dalam 90 hari terakhir. Memakai jendela
 * 90 hari berjalan (bukan bulan kalender) supaya level tidak anjlok di tanggal 1 hanya karena
 * awal bulan masih sepi. Reseller yang baru bergabung dibagi jumlah bulan sejak bergabung
 * (minimal 1, maksimal 3), jadi tidak dirugikan karena belum punya 3 bulan riwayat.
 * Pesanan `dibatalkan` tidak dihitung — sama seperti kartu "Belanja modal".
 *
 * Batas STANDAR level ada di LEVELS (di sini). Admin bisa menggantinya dari menu Reseller > Pengaturan
 * (tersimpan di store_settings.reseller_levels, divalidasi `validateLevels`); admin juga bisa menetapkan level
 * manual per reseller (resellers.level_override). Tanpa pengaturan, LEVELS dipakai apa adanya.
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
  /** true = level ditetapkan manual oleh admin (bukan dari belanja). */
  manual?: boolean;
  /** Level menurut belanja, dipertahankan saat level manual dipakai (untuk tampilan admin). */
  computed_key?: LevelKey;
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
export function hitungLevel(
  belanjaJendela: number,
  bulan: number = MAX_MONTHS,
  tiers: readonly LevelTier[] = LEVELS
): LevelSummary {
  const total = Math.max(0, Number(belanjaJendela) || 0);
  const pembagi = Math.min(MAX_MONTHS, Math.max(1, Number(bulan) || MAX_MONTHS));
  const rataRata = Math.round(total / pembagi);

  let index = 0;
  for (let i = 0; i < tiers.length; i += 1) {
    if (rataRata >= tiers[i].min) index = i;
  }
  const current = tiers[index];
  const next = tiers[index + 1] ?? null;

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
    tiers,
  };
}

export function isLevelKey(value: unknown): value is LevelKey {
  return value === "silver" || value === "gold" || value === "platinum";
}

/** Batas atas wajar (Rp per bulan) supaya salah ketik tidak menghasilkan level yang mustahil. */
export const MAX_LEVEL_MIN = 1_000_000_000;
export const MAX_LEVEL_LABEL = 16;

/**
 * Validasi pengaturan level dari admin: tiga level berurutan silver/gold/platinum, nama 1–16 huruf,
 * batas rupiah bulat; Silver SELALU mulai Rp0 dan batasnya harus naik (Gold > 0, Platinum > Gold).
 */
export function validateLevels(input: unknown): { ok: true; value: LevelTier[] } | { ok: false; error: string } {
  if (!Array.isArray(input) || input.length !== 3) return { ok: false, error: "Level harus tepat tiga: Silver, Gold, Platinum." };
  const keys: LevelKey[] = ["silver", "gold", "platinum"];
  const out: LevelTier[] = [];
  for (let i = 0; i < 3; i += 1) {
    const raw = input[i] as { key?: unknown; label?: unknown; min?: unknown } | null;
    if (!raw || raw.key !== keys[i]) return { ok: false, error: "Urutan level harus Silver, Gold, Platinum." };
    const label = String(raw.label ?? "").trim();
    if (!label || label.length > MAX_LEVEL_LABEL) return { ok: false, error: `Nama level wajib diisi (maksimal ${MAX_LEVEL_LABEL} huruf).` };
    const min = Number(raw.min);
    if (!Number.isFinite(min) || min < 0 || min > MAX_LEVEL_MIN || Math.round(min) !== min) {
      return { ok: false, error: "Batas level harus angka rupiah bulat, 0 sampai 1 miliar." };
    }
    out.push({ key: keys[i], label, min });
  }
  if (out[0].min !== 0) return { ok: false, error: "Level pertama (Silver) selalu mulai dari Rp0." };
  if (!(out[1].min > out[0].min)) return { ok: false, error: `Batas ${out[1].label} harus lebih besar dari Rp0.` };
  if (!(out[2].min > out[1].min)) return { ok: false, error: `Batas ${out[2].label} harus lebih besar dari batas ${out[1].label}.` };
  const names = new Set(out.map((tier) => tier.label.toLowerCase()));
  if (names.size !== 3) return { ok: false, error: "Nama level tidak boleh sama." };
  return { ok: true, value: out };
}

/** Pengaturan tersimpan -> tiga level; apa pun yang tidak valid jatuh ke LEVELS standar (tidak pernah melempar). */
export function normalizeLevels(raw: unknown): LevelTier[] {
  const checked = validateLevels(raw);
  return checked.ok ? checked.value : LEVELS.map((tier) => ({ ...tier }));
}

/**
 * Terapkan level manual admin pada hasil hitungan. Bila `override` bukan salah satu dari tiga key, hasil
 * dikembalikan apa adanya. Progres/sisa dihitung dari belanja NYATA terhadap level manual itu.
 */
export function applyLevelOverride(summary: LevelSummary, override: unknown): LevelSummary {
  if (!isLevelKey(override)) return summary;
  const index = summary.tiers.findIndex((tier) => tier.key === override);
  if (index < 0) return summary;
  const current = summary.tiers[index];
  const next = summary.tiers[index + 1] ?? null;
  const sisa = next ? Math.max(0, next.min - summary.rata_rata) : 0;
  const progress = next
    ? Math.min(100, Math.max(0, Math.round(((summary.rata_rata - current.min) / (next.min - current.min)) * 100)))
    : 100;
  return { ...summary, key: current.key, label: current.label, next, sisa, progress, manual: true, computed_key: summary.key };
}
