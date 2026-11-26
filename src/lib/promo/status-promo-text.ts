/**
 * Blok "STATUS PROMO" untuk prompt live chat website — hanya memuat promo yang berlaku HARI INI menurut
 * pengaturan admin (menu Promo > "Promo yang disebut bot"). Bot WhatsApp (Academy) memakai teks yang sama.
 *
 * Murni (tanpa database) supaya bisa diuji; datanya dari `promoAktif()`.
 */

import type { PromoAktif } from "./ongkir-promo";

export function statusPromoText(promo: PromoAktif): string {
  const baris: string[] = [];
  if (promo.jabo) baris.push("- Free ongkir Jabodetabek: BERLAKU. Ongkir ke alamat Jabodetabek Rp0 (J&T EZ dan ECO).");
  if (promo.luar) {
    baris.push(
      `- Potongan ongkir luar Jabodetabek: BERLAKU. Ongkir ke alamat di luar Jabodetabek dipotong ${promo.luarPercent}% dari tarif J&T (EZ dan ECO).`,
    );
  }
  if (!promo.jabo && !promo.luar) {
    baris.push("- Promo ongkir: TIDAK ADA yang berlaku hari ini. Jangan menjanjikan gratis ongkir atau potongan ongkir.");
  }
  baris.push(
    promo.fchBot
      ? "- Free Cover Hanger (pembelian pertama): BERLAKU, ikuti aturan bonus di bagian Promo."
      : "- Free Cover Hanger (pembelian pertama): TIDAK BERLAKU hari ini. Jangan menawarkan atau menulis bonus free cover + hanger.",
  );
  return [
    `STATUS PROMO (hari ini ${promo.today}, dari pengaturan admin):`,
    ...baris,
    "Hanya sebut promo yang tertulis BERLAKU. Angka ongkir resmi selalu dari cek_ongkir; jangan menghitung sendiri.",
  ].join("\n");
}
