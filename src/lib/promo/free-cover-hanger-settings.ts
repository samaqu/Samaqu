/**
 * Pengaturan promo "Free Cover Hanger" — dibaca dari `store_settings` (id = 1).
 *
 * Semua nilai punya default yang aman, jadi halaman promo tetap tampil walau kolomnya
 * belum dibuat (`supabase/migrations/20261031_promo_free_cover_hanger.sql`). Pola
 * pembacaan mengikuti `open-order-settings.ts`: coba kolom lengkap dulu, kalau error
 * (kolom belum ada) jatuh ke nilai bawaan.
 */

import { supabase } from "../supabase";
import { PROMO_COLLECTIONS, PROMO_QUOTA } from "./free-cover-hanger";

export interface PromoFchSettings {
  active: boolean;
  /** Judul besar di katalog promo. */
  title: string;
  eyebrow: string;
  description: string;
  /** Total bonus program. */
  quotaTotal: number;
  /** Sisa bonus — angka di bar. */
  quotaLeft: number;
  quotaNote: string;
  startDate: string | null;
  endDate: string | null;
  /**
   * Bonus masih bisa ditawarkan (kuota > 0, promo aktif, dalam periode).
   * Dipakai halaman pesan untuk menyembunyikan bar bonus dan menampilkan "Bonus sudah habis".
   */
  bonusAvailable: boolean;
}

/** Nilai bawaan = teks yang sekarang dipakai katalog promo & landing. */
export const DEFAULT_PROMO_FCH: PromoFchSettings = {
  active: true,
  title: "Free Cover Hanger",
  eyebrow: "Pembelian Pertama",
  description:
    "Beli Thobe, Kandora, atau Koko pertamamu dan Cover Hanger senilai Rp35.000 masuk otomatis ke paket — tanpa kode promo.",
  quotaTotal: 100,
  quotaLeft: 100,
  quotaNote: PROMO_QUOTA.note,
  startDate: null,
  endDate: null,
  bonusAvailable: true,
};

const COLUMNS =
  "promo_fch_active, promo_fch_title, promo_fch_eyebrow, promo_fch_description, promo_fch_quota_total, promo_fch_quota_left, promo_fch_quota_note, promo_fch_start_date, promo_fch_end_date";

function toInt(value: unknown, fallback: number): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function mapRow(row: Record<string, unknown> | null): PromoFchSettings {
  if (!row) return DEFAULT_PROMO_FCH;
  const total = Math.max(1, toInt(row.promo_fch_quota_total, DEFAULT_PROMO_FCH.quotaTotal));
  const left = Math.min(total, toInt(row.promo_fch_quota_left, DEFAULT_PROMO_FCH.quotaLeft));
  const active = row.promo_fch_active !== false;
  const startDate = (row.promo_fch_start_date as string | null) ?? null;
  const endDate = (row.promo_fch_end_date as string | null) ?? null;

  // Tanggal WIB — sama dengan tanggal yang diisi admin (YYYY-MM-DD).
  const todayWib = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const inPeriod = (!startDate || todayWib >= startDate) && (!endDate || todayWib <= endDate);

  return {
    active,
    title: String(row.promo_fch_title ?? "").trim() || DEFAULT_PROMO_FCH.title,
    eyebrow: String(row.promo_fch_eyebrow ?? "").trim() || DEFAULT_PROMO_FCH.eyebrow,
    description: String(row.promo_fch_description ?? "").trim() || DEFAULT_PROMO_FCH.description,
    quotaTotal: total,
    // Sisa tidak boleh melebihi total.
    quotaLeft: left,
    quotaNote: String(row.promo_fch_quota_note ?? "").trim() || DEFAULT_PROMO_FCH.quotaNote,
    startDate,
    endDate,
    // Bonus hanya ditawarkan bila kuota masih ada, promo aktif, dan dalam periode.
    bonusAvailable: active && inPeriod && left > 0,
  };
}

/** Pengaturan promo aktif. Gagal / kolom belum ada → nilai bawaan, halaman tetap jalan. */
export async function readPromoFchSettings(): Promise<PromoFchSettings> {
  try {
    const { data, error } = await supabase.from("store_settings").select(COLUMNS).eq("id", 1).maybeSingle();
    if (error) {
      // Kolom belum dibuat → pakai bawaan (jangan sampai halaman promo kosong).
      console.warn("[PROMO-FCH] kolom pengaturan belum ada, memakai bawaan:", error.message);
      return DEFAULT_PROMO_FCH;
    }
    return mapRow(data as Record<string, unknown> | null);
  } catch (error) {
    console.error("[PROMO-FCH] gagal membaca pengaturan:", error);
    return DEFAULT_PROMO_FCH;
  }
}

/** Koleksi yang tampil di landing tetap sama dengan config promo. */
export { PROMO_COLLECTIONS };
