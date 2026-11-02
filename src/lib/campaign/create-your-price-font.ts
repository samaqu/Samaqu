import localFont from "next/font/local";

/**
 * Font kampanye Create Your Price — dimuat HANYA di route `/campaign` (lihat
 * `src/app/(campaign)/layout.tsx`), bukan di layout global.
 *
 * CATATAN: sebelumnya memakai `next/font/google`, dan BUILD PRODUCTION GAGAL di
 * Turbopack ("Module not found: @vercel/turbopack-next/internal/font/google/font").
 * Karena itu keduanya sekarang dilayani dari file lokal di `public/fonts/`, pola yang
 * sama dengan `RootDocument` — tidak ada request ke Google saat build maupun saat
 * pengunjung membuka halaman.
 */
export const cormorantCampaign = localFont({
  src: [
    { path: "../../../public/fonts/cormorantgaramond-wght--medium.woff2", weight: "500", style: "normal" },
    { path: "../../../public/fonts/cormorantgaramond-wght--mediumitalic.woff2", weight: "500", style: "italic" },
    { path: "../../../public/fonts/cormorantgaramond-wght--semibold.woff2", weight: "600", style: "normal" },
    { path: "../../../public/fonts/cormorantgaramond-wght--semibolditalic.woff2", weight: "600", style: "italic" },
    { path: "../../../public/fonts/cormorantgaramond-wght--bold.woff2", weight: "700", style: "normal" },
    { path: "../../../public/fonts/cormorantgaramond-wght--bolditalic.woff2", weight: "700", style: "italic" },
  ],
  variable: "--font-campaign-serif",
  display: "swap",
});

export const dmSans = localFont({
  // DM Sans dari Google disajikan sebagai variable font: satu file untuk bobot
  // 400–700, jadi `weight` ditulis sebagai rentang.
  src: [{ path: "../../../public/fonts/dmsans-latin.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-campaign-sans",
  display: "swap",
});
