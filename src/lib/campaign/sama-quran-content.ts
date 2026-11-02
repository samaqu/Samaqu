/**
 * Konten halaman kampanye Sama Quran (`/campaign/sama-quran`).
 *
 * Semua teks, media, dan path aset dikumpulkan di satu tempat supaya gampang diubah
 * tanpa menyentuh komponen — pola yang sama dengan kampanye Create Your Price.
 *
 * Halaman ini TAMBAHAN dan berdiri sendiri: tidak menyentuh halaman /id/sama-quran,
 * navbar, footer, maupun layout global.
 */

const BASE = "/campaign/sama-quran";

/** Aset halaman (hasil export desain, disalin ke folder public khusus kampanye). */
export const SQ_ASSETS = {
  logo: `${BASE}/c0878af321d9470f6395072cb73d131e.png`,
  heroVideo: `${BASE}/141febaa6c9a70850e3fba8b5aa35573.mp4`,
  heroPoster: `${BASE}/ca5cf2e5bd262808c1ee509e7908219c.jpg`,
  storyVideo: `${BASE}/0282fafe3a7f01212fc5834cebe77b9f.mp4`,
  storyPoster: `${BASE}/a6ac6ede053b38f9ec87353cecae5171.jpg`,
  maknaVideo: `${BASE}/902271b2b070f245733396b081ab9ecd.mp4`,
  maknaPoster: `${BASE}/6259842218e99ff9cabcb2a7dbda68a6.jpg`,
  jalanVideo: `${BASE}/8be3fcd9f00ed24fbcfafb15af7e599f.mp4`,
  jalanPoster: `${BASE}/fb3f970a06d0dcde356e745ada072e3b.jpg`,
  stitchVideo: `${BASE}/9c0d22017d064ac5c2a5791d61fac10f.mp4`,
  stitchPoster: `${BASE}/c7dd4e958da8308499967e55cf90b893.jpg`,
} as const;

/** Video 3 kartu perjalanan. */
export const JOURNEY = [
  {
    number: "01",
    video: `${BASE}/3acb31148520a6fdf9e20b292dbb1bb2.mp4`,
    poster: `${BASE}/1087be048f48a44170d7fae721436fb5.jpg`,
    alt: "Pria belajar di meja dengan mushaf di sudut meja",
    caption: "Ada yang sedang",
    captionEm: "belajar.",
    dark: false,
  },
  {
    number: "02",
    video: `${BASE}/5c47f3f7d38e2644cc4e0f8a1a5f1f01.mp4`,
    poster: `${BASE}/3d02e3bce825c236b432668ad452a24f.jpg`,
    alt: "Pria bekerja dengan laptop, mushaf di dalam tas",
    caption: "Ada yang sedang",
    captionEm: "bekerja.",
    dark: false,
  },
  {
    number: "03",
    video: `${BASE}/f394c248dae9a0538a3427474d7b6762.mp4`,
    poster: `${BASE}/97358235a3d970d58eeab915527abfa3.jpg`,
    alt: "Pria duduk memeluk mushaf saat hujan",
    caption: "Ada yang sedang",
    captionEm: "melewati masa sulit.",
    dark: true,
  },
] as const;

/** Enam nilai (kartu ikon). `dark` = kartu terakhir yang berlatar hitam. */
export const NILAI = [
  {
    title: "Membaca",
    desc: "Satu ayat hari ini lebih baik daripada menunggu waktu yang pas.",
    path: "M3 5.5C5.5 4.5 9 4.5 12 6.5c3-2 6.5-2 9-1v13c-2.5-1-6-1-9 1-3-2-6.5-2-9-1z",
    extra: "M12 6.5v13",
  },
  {
    title: "Menghafal",
    desc: "Sedikit demi sedikit, sampai ayat-ayatnya menetap di hati.",
    path: "M12 3a6 6 0 0 0-6 6c0 2.5 1.5 4 2.5 5v3h7v-3c1-1 2.5-2.5 2.5-5a6 6 0 0 0-6-6z",
    extra: "M9.5 20h5",
  },
  {
    title: "Mengkaji",
    desc: "Memahami maknanya, bukan hanya melafalkannya.",
    circle: { cx: 11, cy: 11, r: 6 },
    path: "M20 20l-4.5-4.5",
  },
  {
    title: "Mengajarkan",
    desc: "Berbagi yang kita tahu, sekecil apa pun itu.",
    circles: [
      { cx: 8, cy: 8, r: 3 },
      { cx: 17, cy: 10, r: 2.5 },
    ],
    path: "M3 20c0-3 2.5-5 5-5s5 2 5 5",
    extra: "M13.5 20c0-2.5 1.5-4 3.5-4s3.5 1.5 3.5 4",
  },
  {
    title: "Mengamalkan",
    desc: "Menghadirkannya dalam sikap dan keputusan sehari-hari.",
    path: "M5 12l4.5 4.5L19 7",
  },
  {
    title: "Mencintai",
    desc: "Ujung dari semuanya: Quran jadi bagian hidup, bukan kewajiban.",
    path: "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z",
    dark: true,
  },
] as const;

/** Timeline vertikal di section gelap. */
export const TIMELINE = ["Belajar", "Bekerja", "Mengejar mimpi", "Memperbaiki diri", "Melewati masa sulit"] as const;

/** Empat harapan (Dari nilai ke karya). */
export const HARAPAN = [
  {
    title: "Sama Quran",
    path: "M3 5.5C5.5 4.5 9 4.5 12 6.5c3-2 6.5-2 9-1v13c-2.5-1-6-1-9 1-3-2-6.5-2-9-1z",
    extra: "M12 6.5v13",
  },
  {
    title: "Orang Biasa",
    circle: { cx: 12, cy: 8, r: 3.5 },
    path: "M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7",
  },
  {
    title: "Tumbuh Bersama",
    path: "M12 20v-8",
    extra: "M12 12c0-3-2-5-6-5 0 3 2 5 6 5zM12 10c0-3 2-5 6-5 0 3-2 5-6 5zM8 20h8",
  },
  {
    title: "Bermanfaat untuk Sesama",
    path: "M3 14h3l3 2h4a1.5 1.5 0 0 1 0 3H9M6 14v6H3v-6M13 19l5-2.5a1.5 1.5 0 0 1 1.5 2.6L13 22H9",
    extra: "M15 11.5s-3.5-2-3.5-4.5a2 2 0 0 1 3.5-1.3A2 2 0 0 1 18.5 7c0 2.5-3.5 4.5-3.5 4.5z",
  },
] as const;

/**
 * Koleksi Samaqu (4 kategori).
 *
 * Fotonya memakai aset kategori yang SUDAH dipakai section "Koleksi" di homepage
 * (`src/components/Koleksi.tsx` → `public/images/...`), bukan placeholder.
 */
export const KOLEKSI = [
  { name: "Thobe", image: "/images/5616b4f5-b494-4940-808b-343520d0782e.webp" },
  { name: "Kandora", image: "/images/8b1f2100-01e0-41cc-a77c-96dde3e2b290.webp" },
  { name: "Koko", image: "/images/44dc4804-7c64-4276-9e9d-374d0905f8ba.webp" },
  { name: "Vest", image: "/images/819b1d90-d58e-4670-bfbd-2883bd685f63.webp" },
] as const;

/** Pesan WhatsApp otomatis. */
export const SQ_WA_MESSAGE =
  "Halo Samaqu, saya mau tanya soal Sama Quran dan koleksinya.";

/** Anchor section cerita (tombol "Tonton ceritanya"). */
export const STORY_ANCHOR = "cerita";
