/**
 * Blok "STATUS PROMO" untuk prompt live chat website — hanya memuat promo yang berlaku HARI INI menurut
 * pengaturan admin (menu Promo > "Promo yang disebut bot"). Bot WhatsApp (Academy) memakai teks yang sama.
 *
 * Murni (tanpa database) supaya bisa diuji; datanya dari `promoAktif()`.
 */

import type { PromoAktif } from "./ongkir-promo";

export function statusPromoText(promo: PromoAktif): string {
  const baris: string[] = [];
  const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
  if (promo.jabo) {
    baris.push(
      `- Gratis ongkir Jabodetabek s.d. ${rp(promo.jaboMax)}: BERLAKU. Potongan sebesar tarif J&T (EZ dan ECO), maksimal ${rp(promo.jaboMax)} per order; sisanya dibayar customer. Ongkir Rp0 hanya kalau tarif J&T tidak lebih dari ${rp(promo.jaboMax)}.`,
    );
  }
  if (promo.luar) {
    baris.push(
      `- Diskon ongkir ${promo.luarPercent}% s.d. ${rp(promo.luarMax)} untuk luar Jabodetabek: BERLAKU. Dipotong ${promo.luarPercent}% dari tarif J&T (EZ dan ECO), maksimal ${rp(promo.luarMax)} per order; sisanya dibayar customer.`,
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
    "Hanya sebut promo yang tertulis BERLAKU. Angka ongkir resmi selalu dari cek_ongkir; jangan menghitung sendiri. Sebut batas maksimal persis seperti tertulis di atas.",
  ].join("\n");
}
