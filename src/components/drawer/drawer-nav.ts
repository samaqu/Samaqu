"use client";

/**
 * Konfigurasi menu drawer mobile — SATU sumber data.
 *
 * Untuk menambah item: tambahkan satu entri di sini + key terjemahannya di
 * `src/i18n/messages/{id,en}.json` (namespace `nav`). Komponen tidak perlu diubah.
 */

/** Satu link di menu utama. */
export interface DrawerNavItem {
  /** Path internal tanpa prefix bahasa. */
  path: string;
  /** Key terjemahan namespace `nav`. */
  labelKey: string;
}

/** Menu utama (urutan render). */
export const DRAWER_NAV: DrawerNavItem[] = [
  { path: "", labelKey: "nav.home" }, // "" = beranda (homeHref dihitung pemanggil)
  { path: "/katalog", labelKey: "nav.katalog" },
  { path: "/testimoni", labelKey: "nav.testimoni" },
  { path: "/sama-quran", labelKey: "nav.sama_quran" },
  { path: "/tentang-kami", labelKey: "nav.tentang" },
];

/** Satu tombol di grid Bantuan. */
export interface DrawerHelpItem {
  path: string;
  labelKey: string;
  /** true = tautan luar, buka di tab baru. */
  external?: boolean;
}

/**
 * Grid Bantuan 3 kolom × 2 baris (6 item). "Affiliate" pindah ke sini dari
 * baris terpisah di versi sebelumnya.
 */
export const DRAWER_HELP: DrawerHelpItem[] = [
  { path: "/panduan-ukuran", labelKey: "nav.panduan" },
  { path: "/cara-pesan", labelKey: "nav.cara_pesan" },
  { path: "/faq", labelKey: "nav.faq" },
  { path: "/cek-resi", labelKey: "nav.cek_resi" },
  { path: "/garansi-retur", labelKey: "nav.garansi_retur" },
  { path: "https://affiliate.samaqu.id/", labelKey: "nav.affiliate_short", external: true },
];

/** Path halaman promo Free Cover Hanger (relatif ke locale). */
export const FCH_PATH = "/promo/free-cover-hanger";
