/**
 * Hitungan kartu "Promo Ongkir" di Laporan Office.
 *
 * Murni (tanpa jaringan/database) supaya bisa diuji. Aturan:
 *  - Hanya pesanan sah (diproses/dikirim/selesai) yang dihitung — disaring pemanggil (`isValidSaleOrder`).
 *  - Pesanan berpromo = `shipping_discount` > 0 dan `shipping_promo_kind` jabo/luar. Pesanan lama/tanpa promo
 *    (kolom kosong) otomatis tidak ikut, jadi saklar OFF = kartu kosong yang rapi.
 *  - "Uang yang benar-benar keluar dari SAMAQU" = potongan dikurangi diskon akun VIP J&T (lihat `pecahPotongan`).
 *    Kalau hasilnya minus (potongan lebih kecil dari diskon J&T karena batas maksimal), TIDAK dihitung subsidi:
 *    dicatat terpisah sebagai "selisih untuk SAMAQU".
 *  - Angka utama adalah yang diberikan ke customer; angka "uang keluar" hanya pelengkap.
 * Tidak menyentuh rumus omset/laba (omset = total - ongkir yang dibayar, tidak berubah).
 */

import { pecahPotongan, type PromoJenis } from "./promo/ongkir-promo";

export type PromoOngkirOrigin = "bot" | "admin" | "website";
export const ORIGIN_LABEL_ONGKIR: Record<PromoOngkirOrigin, string> = {
  bot: "Bot WA",
  admin: "Input admin",
  website: "Website",
};

export interface PromoOngkirOrder {
  id: string;
  order_number?: string | null;
  status?: string | null;
  customer_name?: string | null;
  created_at: string;
  shipping_cost?: number | null;
  shipping_cost_original?: number | null;
  shipping_discount?: number | null;
  shipping_promo_kind?: string | null;
  shipping_city?: string | null;
}

export interface PromoOngkirRow {
  tanggal: string;
  nomorPesanan: string;
  pelanggan: string;
  tujuan: string;
  jenis: PromoJenis;
  asal: PromoOngkirOrigin;
  ongkirJnt: number;
  potongan: number;
  dibayar: number;
  status: string;
}

export interface PromoOngkirReport {
  jabodetabek: { pesanan: number; rupiah: number };
  luar: { pesanan: number; rupiah: number };
  total: { pesanan: number; diberikan: number; dibayarCustomer: number };
  /**
   * Bagian potongan yang ditanggung SAMAQU (di luar diskon akun VIP J&T) = uang yang benar-benar keluar.
   * `selisihSamaqu`: pesanan yang potongannya LEBIH KECIL dari diskon J&T (karena batas maksimal); itu selisih untuk
   * SAMAQU, bukan subsidi, jadi tidak ikut `samaqu`.
   */
  uangKeluar: { samaqu: number; ditanggungJnt: number; selisihSamaqu: number };
  perAsal: Record<PromoOngkirOrigin, number>;
  perHari: Array<{ hari: string; pesanan: number }>;
  rinci: PromoOngkirRow[];
}

export interface BuildPromoOngkirInput {
  /** HANYA pesanan sah. */
  orders: PromoOngkirOrder[];
  originOf: (order: PromoOngkirOrder) => PromoOngkirOrigin;
  dayKeys: string[];
  /** Diskon akun VIP J&T (persen), dari pengaturan promo. */
  jntDiscountPercent: number;
  offsetMs?: number;
  statusLabel?: (status: string | null | undefined) => string;
}

const WIB_MS = 7 * 60 * 60 * 1000;

const int = (value: unknown) => Math.max(0, Math.round(Number(value) || 0));

export function buildPromoOngkirReport(input: BuildPromoOngkirInput): PromoOngkirReport {
  const offset = input.offsetMs ?? WIB_MS;
  const wibDay = (iso: string) => new Date(new Date(iso).getTime() + offset).toISOString().slice(0, 10);
  const label = input.statusLabel ?? ((status) => String(status ?? "-"));

  const report: PromoOngkirReport = {
    jabodetabek: { pesanan: 0, rupiah: 0 },
    luar: { pesanan: 0, rupiah: 0 },
    total: { pesanan: 0, diberikan: 0, dibayarCustomer: 0 },
    uangKeluar: { samaqu: 0, ditanggungJnt: 0, selisihSamaqu: 0 },
    perAsal: { bot: 0, admin: 0, website: 0 },
    perHari: [],
    rinci: [],
  };
  const perHari = new Map<string, number>(input.dayKeys.map((day) => [day, 0]));

  for (const order of input.orders || []) {
    const potongan = int(order.shipping_discount);
    const kind = order.shipping_promo_kind;
    if (potongan <= 0 || (kind !== "jabo" && kind !== "luar")) continue;

    const dibayar = int(order.shipping_cost);
    // Tarif J&T: kolom asli kalau ada; kalau kosong dihitung dari dibayar + potongan.
    const asli = int(order.shipping_cost_original) || dibayar + potongan;
    const asal = input.originOf(order);
    const { jnt, samaqu, selisih } = pecahPotongan(asli, potongan, input.jntDiscountPercent);

    const grup = kind === "jabo" ? report.jabodetabek : report.luar;
    grup.pesanan += 1;
    grup.rupiah += potongan;
    report.total.pesanan += 1;
    report.total.diberikan += potongan;
    report.total.dibayarCustomer += dibayar;
    report.uangKeluar.samaqu += samaqu;
    report.uangKeluar.ditanggungJnt += jnt;
    report.uangKeluar.selisihSamaqu += selisih;
    report.perAsal[asal] += 1;

    const day = wibDay(order.created_at);
    perHari.set(day, (perHari.get(day) || 0) + 1);
    report.rinci.push({
      tanggal: order.created_at,
      nomorPesanan: String(order.order_number || "-"),
      pelanggan: String(order.customer_name || "-"),
      tujuan: String(order.shipping_city || "-"),
      jenis: kind,
      asal,
      ongkirJnt: asli,
      potongan,
      dibayar,
      status: label(order.status),
    });
  }

  report.perHari = [...perHari.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([hari, pesanan]) => ({ hari, pesanan }));
  report.rinci.sort((a, b) => b.tanggal.localeCompare(a.tanggal));
  return report;
}
