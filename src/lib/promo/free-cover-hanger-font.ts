import { Big_Shoulders, Instrument_Sans } from "next/font/google";

/**
 * Font landing Free Cover Hanger — dimuat HANYA di halaman promo ini
 * (lihat `layout.tsx` di folder promonya), bukan di layout global.
 *
 * `next/font/google` mengunduh font saat build lalu menyajikannya dari origin
 * sendiri, jadi tidak ada request ke Google saat pengunjung membuka halaman.
 */
export const bigShoulders = Big_Shoulders({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  display: "swap",
  variable: "--font-big-shoulders",
});

export const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-instrument-sans",
});
