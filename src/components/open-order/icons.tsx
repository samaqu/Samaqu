/**
 * Ikon kecil khusus halaman Open Order.
 *
 * `lucide-react` versi proyek ini tidak mengekspor `Instagram` (sudah dicek lewat `tsc`),
 * jadi ikonnya digambar inline. Ditaruh di satu modul supaya StepCatalog dan Countdown
 * memakai bentuk yang sama persis.
 */

/** Akun Instagram toko — dipakai kartu "INFO BATCH BARU" dan ajakan saat periode tutup. */
export const INSTAGRAM_URL = "https://instagram.com/samaqu.id";

/** Ikon Instagram resmi: kotak membulat, lensa, dan titik lampu. */
export function InstagramGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
