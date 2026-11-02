import { Cormorant_Garamond, DM_Sans } from "next/font/google";

/**
 * Font kampanye Create Your Price — dimuat HANYA di route `/campaign` (lihat
 * `src/app/(campaign)/layout.tsx`), bukan di layout global.
 *
 * Cormorant Garamond sebenarnya sudah tersedia global sebagai `--font-cormorant`
 * (lihat `RootDocument`), tapi di sini dimuat ulang dengan bobot yang dipakai desain
 * (500/600/700 + italic 500) supaya hasil render persis seperti mockup tanpa
 * bergantung pada set bobot halaman lain.
 *
 * `next/font/google` mengunduh font saat build lalu menyajikannya dari origin sendiri,
 * jadi tidak ada request ke Google saat pengunjung membuka halaman.
 */
export const cormorantCampaign = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-campaign-serif",
});

export const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--font-campaign-sans",
});
