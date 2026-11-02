import localFont from "next/font/local";

/**
 * Font landing Free Cover Hanger — dimuat HANYA di halaman promo ini
 * (lihat `layout.tsx` di folder promonya), bukan di layout global.
 *
 * CATATAN: dulu memakai `next/font/google`. Build production (Turbopack) gagal di
 * resolver font Google, jadi berkasnya sekarang disajikan dari `public/fonts/`
 * (variable font, satu file per family) — pola yang sama dengan `RootDocument`.
 * Tidak ada request ke Google saat build maupun saat pengunjung membuka halaman.
 */
export const bigShoulders = localFont({
  src: [{ path: "../../../public/fonts/bigshoulders-latin.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-big-shoulders",
  display: "swap",
});

export const instrumentSans = localFont({
  src: [{ path: "../../../public/fonts/instrumentsans-latin.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-instrument-sans",
  display: "swap",
});

/**
 * Anton — judul hero mengikuti mockup hero terbaru. Satu bobot (400) karena Anton hanya
 * punya satu ketebalan; "lebih tebal" di mockup dicapai lewat ukuran, bukan `font-weight`.
 * Disajikan dari `public/fonts` supaya tidak ada permintaan ke Google saat build.
 */
export const anton = localFont({
  src: [{ path: "../../../public/fonts/anton-latin.woff2", weight: "400", style: "normal" }],
  variable: "--font-anton",
  display: "swap",
});
