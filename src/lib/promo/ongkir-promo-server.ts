/**
 * Pembaca pengaturan promo ongkir/bot dari `store_settings` (server saja) + penentuan promo untuk satu tujuan.
 *
 * Dibaca TIAP permintaan (satu query kecil, tanpa cache) supaya saklar dan tanggal dari panel admin langsung
 * berlaku di checkout, draft, dan bot. Gagal membaca / kolom belum ada → semua promo ongkir MATI dan bonus
 * cover bot NYALA (= perilaku sebelum fitur ini), tidak pernah error ke customer.
 */

import "server-only";
import { getSupabaseAdmin } from "../supabase-admin";
import { resolveAreaRow } from "../jnt/area-mapping";
import {
  DEFAULT_PROMO_SETTINGS,
  PROMO_ONGKIR_COLUMNS,
  hitungPromoOngkir,
  parsePromoSettings,
  promoAktif,
  type HasilPromoOngkir,
  type PromoAktif,
  type PromoOngkirSettings,
} from "./ongkir-promo";

export async function readPromoSettings(): Promise<PromoOngkirSettings> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("store_settings")
      .select(PROMO_ONGKIR_COLUMNS)
      .eq("id", 1)
      .maybeSingle();
    if (error) {
      console.warn("[PROMO-ONGKIR] kolom pengaturan belum ada / gagal dibaca, promo ongkir mati:", error.message);
      return DEFAULT_PROMO_SETTINGS;
    }
    return parsePromoSettings(data as Record<string, unknown> | null);
  } catch (error) {
    console.error("[PROMO-ONGKIR] gagal membaca pengaturan:", error);
    return DEFAULT_PROMO_SETTINGS;
  }
}

/** Promo yang berlaku hari ini (WIB). */
export async function readPromoAktif(): Promise<PromoAktif> {
  return promoAktif(await readPromoSettings());
}

/** Kota resmi (dataset area J&T) untuk pasangan kota + kecamatan; null kalau tidak dikenali. */
export function kotaResmiTujuan(city: string, district: string): string | null {
  return resolveAreaRow(city, district)?.localCity ?? null;
}

/**
 * Hitung promo untuk satu tarif yang SUDAH diverifikasi server. Dipakai route pesanan customer
 * (checkout, Open Order, promo FCH). Reseller TIDAK memanggil ini.
 */
export async function hitungPromoUntukPesanan(input: {
  tarif: number;
  city: string | null | undefined;
  district: string | null | undefined;
}): Promise<HasilPromoOngkir> {
  const promo = await readPromoAktif();
  if (!promo.jabo && !promo.luar) {
    const original = Math.max(0, Math.round(Number(input.tarif) || 0));
    return { original, discount: 0, pay: original, kind: null, label: null };
  }
  return hitungPromoOngkir({
    tarif: input.tarif,
    kotaResmi: kotaResmiTujuan(String(input.city ?? ""), String(input.district ?? "")),
    promo,
  });
}
