/**
 * Konten halaman kampanye Create Your Price (`/campaign/create-your-price`).
 *
 * Semua teks, angka contoh, dan path aset dikumpulkan di satu tempat supaya gampang
 * diubah tanpa menyentuh komponen — sama seperti `lib/promo/free-cover-hanger.ts`.
 *
 * Catatan: halaman ini adalah TAMBAHAN dan berdiri sendiri. Tidak ada data pesanan,
 * tidak mengubah katalog, dan tidak dipakai halaman lain.
 */

/** Folder aset halaman ini (di `public/`, dikecualikan middleware lewat aturan `.*\..*`). */
const BASE = "/campaign/create-your-price";

export const CYP_ASSETS = {
  logo: `${BASE}/c0878af321d9470f6395072cb73d131e.png`,
  heroPhoto: `${BASE}/cb9d6fba5ccad38d593cad95efe83adf.jpg`,
  storyVideo: `${BASE}/26b77bd25b2e9422fe7f103be5991134.mp4`,
  storyPoster: `${BASE}/fcf2e5f3dc85e5f1fa32d5afe747f942.jpg`,
  stitchVideo: `${BASE}/9c0d22017d064ac5c2a5791d61fac10f.mp4`,
  stitchPoster: `${BASE}/c7dd4e958da8308499967e55cf90b893.jpg`,
} as const;

/**
 * Data STATIS kartu demo harga di hero.
 *
 * Dipakai hanya sebagai FALLBACK: kalau tidak ada produk Create Your Price yang aktif,
 * hero tetap tampil dengan angka ini supaya tidak pernah kosong.
 * Kalau ada produk aktif, kartu & harga diturunkan dari produk aslinya
 * (lihat `heroFromProducts()` di `_data/products.ts`).
 */
export const HERO_PRODUCT = {
  name: "Thobe Superblack",
  photoAlt: "Model memakai Thobe Superblack",
  minimumPrice: 300000,
  /** Pilihan harga yang bisa diklik; `short` dipakai di tombol, `price` di baris "Kamu bayar". */
  options: [
    { label: "MINIMUM", price: "Rp300.000", short: "Rp300rb" },
    { label: "PILIHAN", price: "Rp320.000", short: "Rp320rb" },
    { label: "PILIHAN", price: "Rp350.000", short: "Rp350rb" },
  ],
} as const;

/** Selisih pilihan harga ke-2 dan ke-3 terhadap harga minimum produk. */
export const HERO_PRICE_STEPS = [0, 20000, 50000] as const;

/** Harga pembuka FALLBACK ("MULAI DARI") bila tidak ada produk aktif. */
export const HERO_FROM_PRICE = "Rp300rb";

export const INFO_BAR = [
  "Program tetap, bukan promo",
  "Produk pilihan berganti tiap periode",
] as const;

/** Tiga alasan dengan pola jahitan (dashed line) di samping video. */
export const REASONS = [
  {
    title: "Kualitas tetap dibanggakan",
    body: "Tanpa harga yang memberatkan.",
  },
  {
    title: "Kemampuan tiap orang beda",
    body: "Yang ringan bagi satu orang, bisa berat bagi yang lain.",
  },
  {
    title: "Bukan penghalang",
    body: "Perbedaan itu tidak boleh membuat siapa pun mundur.",
  },
] as const;

/** Cara kerja — 3 langkah. */
export const STEPS = [
  {
    title: "Lihat harga minimum",
    body: "Tertera jelas di setiap produk Create Your Price di Open Order.",
  },
  {
    title: "Pilih hargamu",
    body: "Bebas, asal tidak di bawah harga minimum.",
  },
  {
    title: "Produk tetap sama",
    body: "Berapa pun yang kamu pilih, kualitas terbaiknya sama.",
  },
] as const;

/** Empat kartu jaminan. */
export const GUARANTEES = [
  "Garansi Kualitas Produk",
  "Garansi Uang Kembali",
  "Garansi Tukar Ukuran",
  "Pelayanan yang Ramah",
] as const;

/** FAQ accordion. */
export const FAQS = [
  {
    q: "Kalau bayar minimum, produknya beda?",
    a: "Tidak. Bahan, jahitan, dan ukurannya sama persis dengan yang membayar lebih.",
  },
  {
    q: "Produk apa saja yang bisa Create Your Price?",
    a: "Produk yang berlabel Create Your Price di halaman Open Order.",
  },
  {
    q: "Apakah ini promo atau diskon?",
    a: "Bukan. Create Your Price adalah cara Samaqu untuk seterusnya, bukan program sementara.",
  },
  {
    q: "Kenapa produknya berganti?",
    a: "Programnya tetap, yang berganti hanya produk pilihannya tiap periode. Kalau sebuah produk sudah tidak masuk periode, harganya kembali normal, termasuk yang masih di keranjang dan belum di-checkout.",
  },
] as const;

/** Pesan WhatsApp otomatis tombol "Tanya Admin" & ikon WA. */
export const CYP_WA_MESSAGE =
  "Halo Samaqu, saya mau tanya soal program Create Your Price (pilih harga sendiri).";

/** Anchor section video (tombol "Tonton videonya" di hero). */
export const VIDEO_ANCHOR = "video";

/** Jumlah maksimal kartu produk yang tampil di section "Produk pilihan periode ini". */
export const CYP_MAX_PRODUCTS = 4;
