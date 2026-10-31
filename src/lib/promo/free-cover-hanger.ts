/**
 * Konfigurasi landing promo "Free Cover Hanger — Pembelian Pertama".
 *
 * Semua teks, pengaturan, dan flag promo ada di SATU tempat ini supaya nanti tinggal
 * diubah tanpa menyentuh komponen. Halaman ini MOCKUP tampilan: kuota tidak membaca
 * database dan tidak ada logic promo apa pun.
 */

import { waNumber, waLink } from "@/lib/whatsapp";

/** Nomor admin SAMAQU — sumbernya dari store settings di `bio-page-content`. */
const ADMIN_WHATSAPP_RAW = "62895635965400";

/** Aset promo (sudah ada di `public/promo`). */
export const PROMO_ASSETS = {
  video: "/promo/free-cover-hanger.mp4",
  /** Poster untuk <video> — rasio 9:16 (potret), dipakai di dalam halaman. */
  poster: "/promo/free-cover-hanger-poster.jpg",
  /**
   * Gambar khusus share/OG — 1200×630 (1.91:1).
   *
   * DIPISAH dari `poster` dengan sengaja: WhatsApp hanya menerima rasio ≤ 4:1, dan
   * gambar potret 9:16 (0,56:1) dipotong jadi thumbnail jangkung sehingga judul
   * "FREE COVER HANGER" terpangkas. Versi lanskap ini menampilkan judul penuh.
   */
  ogImage: "/promo/free-cover-hanger-og.jpg",
} as const;

/**
 * Meta halaman. `noindex` dinyalakan lewat flag supaya nanti tinggal diubah.
 *
 * Karena halaman ini dipakai untuk kampanye iklan, `noindex`/`includeInSitemap`
 * dibuka (2026-10-31) — sebelumnya `nofollow` membuat crawler preview (WhatsApp,
 * Facebook) tidak mengambil kartu share-nya sama sekali.
 */
export const PROMO_META = {
  title: "Gratis Cover Hanger untuk Pelanggan Baru — SAMAQU",
  description:
    "Order pertama Thobe, Kandora, atau Koko di SAMAQU dapat Cover Hanger senilai Rp35.000 secara GRATIS. Otomatis masuk paket, tanpa kode promo.",
  ogTitle: "Gratis Cover Hanger untuk Pelanggan Baru — SAMAQU",
  ogDescription:
    "Setiap pembelian pertama Thobe, Kandora, atau Koko dapat Cover Hanger senilai Rp35.000 secara GRATIS. Otomatis masuk ke paketmu, tanpa kode promo.",
  keywords: [
    "free cover hanger",
    "cover hanger gratis",
    "promo pelanggan baru samaqu",
    "thobe premium",
    "kandora",
    "baju koko",
    "busana muslim pria",
  ],
  /** true = `robots: noindex`. */
  noindex: false,
  /** true = ikut masuk `sitemap.xml`. */
  includeInSitemap: true,
  /**
   * Dimensi `PROMO_ASSETS.ogImage` (1200×630, 1.91:1).
   *
   * Sebelumnya ditulis 1200×630 untuk poster 1080×1920 (9:16) — metadata tidak cocok
   * dengan berkasnya, dan WhatsApp tidak menerima rasio > 4:1 sehingga preview terpotong.
   */
  ogImageWidth: 1200,
  ogImageHeight: 630,
  ogImageType: "image/jpeg",
} as const;

/**
 * Flag promo. Kuota SENGAJA mati dan tidak menampilkan angka apa pun — bar kuota
 * tetap ada sebagai komponen supaya nanti tinggal dinyalakan.
 */
export const PROMO_FLAGS = {
  showQuota: false,
} as const;

export const PROMO_NAV = {
  logo: "SAMAQU",
  statusText: "Program pelanggan baru sedang berjalan",
  ctaLabel: "Katalog",
} as const;

export const PROMO_HERO = {
  headline: ["Order pertama?", "Cover Hanger-nya", "gratis."],
  description:
    "Kenalan pertama dengan SAMAQU jadi lebih istimewa. Setiap pembelian pertama Thobe, Kandora, atau Koko, kamu dapat Cover Hanger senilai Rp35.000 secara GRATIS. Otomatis masuk ke paketmu, tanpa kode promo.",
  primaryCta: "Pilih Baju & Ambil Bonus",
  secondaryCta: "Tanya Admin Dulu",
  badgeTitle: "Langsung masuk paket",
  badgeSubtitle: "Kamu nggak perlu klaim apa-apa",
} as const;

export const PROMO_QUOTA = {
  label: "Sisa bonus",
  note: "Bonus terbatas. Begitu kuotanya habis, program selesai.",
} as const;

export const PROMO_STORY = {
  title: "Baru kenal SAMAQU? Ini sambutan dari kami.",
  description:
    "Setiap awal perkenalan pasti punya kesan tersendiri. Kami ingin pengalaman pertamamu bersama SAMAQU terasa lebih berkesan. Karena itu, ada Cover Hanger gratis sebagai teman untuk menjaga pakaian barumu tetap rapi.",
  proofs: [
    "Berlaku untuk Thobe, Kandora, dan Koko",
    "Masuk otomatis, tanpa kode promo",
    "Order di website atau lewat admin WhatsApp",
  ],
  videoAlt: "Video program Free Cover Hanger SAMAQU",
} as const;

export const PROMO_COMPARE = {
  title: "Bukan sekadar bonus, bajumu jadi lebih terjaga.",
  description:
    "Belanja pertama Thobe, Kandora, atau Koko di SAMAQU, kamu langsung dapat Cover Hanger GRATIS senilai Rp35.000. Bajumu tetap bersih, rapi, dan siap dipakai kapan aja.",
  benefits: [
    {
      title: "Lebih terlindungi dari debu",
      description: "Simpan baju di lemari berminggu-minggu, tetap bersih saat mau dipakai.",
    },
    {
      title: "Tetap rapi saat disimpan",
      description: "Hanger menopang bahu dengan pas, jadi potongan baju nggak melar.",
    },
    {
      title: "Siap menemani perjalanan",
      description: "Tinggal tenteng saat mudik, kondangan, hingga perjalanan umrah.",
    },
  ],
  afterLabel: "Dengan Cover Hanger",
  beforeLabel: "Digantung asal",
  caption: "Ilustrasi sementara, nanti diganti foto asli",
  sliderLabel: "Geser perbandingan sebelum dan sesudah",
} as const;

export const PROMO_STEPS = {
  title: "Cara ambil bonusnya.",
  items: [
    { number: "1", title: "Pilih baju", description: "Thobe, Kandora, atau Koko di katalog. Pilih ukuran seperti biasa." },
    { number: "2", title: "Checkout atau chat admin", description: "Lewat website atau WhatsApp. Nggak ada kode yang perlu diingat." },
    { number: "3", title: "Terima paket + Cover Hanger", description: "Bonusnya sudah tercatat di pesananmu dan dikirim bareng bajunya." },
  ],
} as const;

export type PromoCollection = {
  name: string;
  description: string;
  /** Foto produk yang sudah ada di repo/storage; kosong → placeholder abu-abu. */
  image: string | null;
  badge?: string;
  featured?: boolean;
};

export type PromoCollectionsConfig = {
  title: string;
  allLabel: string;
  mobileHint: string;
  bonusLabel: string;
  items: PromoCollection[];
};

export const PROMO_COLLECTIONS: PromoCollectionsConfig = {
  title: "Pilih baju pertamamu.",
  allLabel: "Lihat semua koleksi",
  mobileHint: "Geser untuk lihat koleksi lain",
  items: [
    {
      name: "Thobe",
      description: "Potongan panjang yang bikin tampil rapi dan berwibawa.",
      // Foto produk asli dari katalog SAMAQU (Cloudinary — host yang sudah terdaftar
      // di `images.remotePatterns`, jadi tidak perlu mengubah next.config.ts).
      image: "https://res.cloudinary.com/nrti451x/image/upload/v1792485286/wjgh3ojngalwzt40ajek.png",
      badge: "Best seller",
      featured: true,
    },
    {
      name: "Kandora",
      description: "Elegan untuk kondangan, kajian, sampai acara kantor.",
      image: "https://res.cloudinary.com/nrti451x/image/upload/v1792485439/f6ioz8iv7kmntbfinsqc.png",
    },
    {
      // Katalog belum punya produk/foto Koko → sengaja null → placeholder abu-abu berlabel.
      name: "Koko",
      description: "Adem dan ringan, nyaman dipakai ibadah tiap hari.",
      image: null,
    },
  ],
  bonusLabel: "+ Gratis Cover Hanger",
};

export const PROMO_TERMS = {
  title: "Syaratnya simpel.",
  description:
    "Khusus pelanggan yang pertama kali berbelanja di SAMAQU. Selama kuota bonus masih tersedia, Cover Hanger otomatis diberikan untuk pesanan pertamamu. Satu pelanggan, satu Cover Hanger.",
  tagTitle: "Bonus pelanggan baru",
  rows: [
    { key: "Untuk", value: "Pelanggan baru" },
    { key: "Bonus", value: "1 Cover Hanger" },
    { key: "Senilai", value: "Rp35.000" },
    { key: "Berlaku di", value: "Thobe, Kandora, Koko" },
    { key: "Berlaku", value: "Selama kuota ada" },
  ],
  footnote: "Dicek dari nomor WhatsApp yang dipakai saat order",
} as const;

export const PROMO_FAQ = {
  title: "Yang sering ditanyain.",
  description: "Belum ketemu jawabannya? Admin kami balas di WhatsApp.",
  chatLabel: "Chat Admin",
  items: [
    {
      question: "Gimana caranya tahu saya pelanggan baru?",
      answer:
        "Kami cek dari nomor WhatsApp yang kamu pakai waktu order. Kalau nomor itu belum pernah belanja di SAMAQU, Cover Hanger otomatis masuk ke pesananmu dengan harga Rp0.",
    },
    {
      question: "Perlu masukin kode promo?",
      answer: "Nggak perlu. Bonusnya masuk otomatis waktu checkout, selama kuota masih ada.",
    },
    {
      question: "Beli dua baju, dapat dua Cover Hanger?",
      answer: "Bonusnya satu Cover Hanger per pelanggan, berapa pun jumlah baju di pesanan pertamamu.",
    },
    {
      question: "Kalau order lewat WhatsApp, tetap dapat?",
      answer: "Tetap dapat. Admin yang masukkan bonusnya ke pesananmu, asal ini pembelian pertamamu.",
    },
    {
      question: "Cover Hanger bisa dibeli terpisah?",
      answer: "Bisa. Cover Hanger ada di katalog seharga Rp35.000, cocok kalau mau punya lebih dari satu.",
    },
    {
      question: "Promonya sampai kapan?",
      answer: "Sampai kuota bonus habis. Begitu kuotanya habis, program ini selesai.",
    },
  ],
} as const;

export const PROMO_CLOSING = {
  headlineTop: "Jadikan pembelian pertamamu",
  headlineOutline: "lebih istimewa.",
  description: "Pilih baju favoritmu dan dapatkan Cover Hanger gratis selama kuota masih tersedia.",
  primaryCta: "Pilih Baju & Ambil Bonus",
  secondaryCta: "Order lewat WhatsApp",
} as const;

export const PROMO_FOOTER = {
  logo: "SAMAQU",
  tagline: "Untuk orang biasa yang sedang bertumbuh.",
} as const;

export const PROMO_STICKY = {
  label: "Sisa bonus",
  ctaLabel: "Ambil Bonus",
  waLabel: "Chat WhatsApp SAMAQU",
} as const;

/** Tautan WhatsApp admin (pesan siap kirim). */
export const ADMIN_WA_LINK = waLink(ADMIN_WHATSAPP_RAW, "Halo Samaqu, saya mau tanya program Free Cover Hanger");

export const ADMIN_WA_NUMBER = waNumber(ADMIN_WHATSAPP_RAW);

/** Path halaman pesan promo (wizard katalog → keranjang → data). */
export const PROMO_ORDER_PATH = "/promo/free-cover-hanger/pesan";

/**
 * Tautan CTA utama landing promo.
 *
 * Semua tombol "Pilih Baju & Ambil Bonus" / "Ambil Bonus" / kartu koleksi mengarah ke
 * **halaman pesan promo**, bukan katalog toko biasa — supaya bonus Cover Hanger ikut
 * terpasang di pesanan dan pengecekan pelanggan baru berjalan di alur yang benar.
 */
export function katalogHref(locale: string) {
  return `/${locale}${PROMO_ORDER_PATH}`;
}

/**
 * ── Timer harian promo ──
 *
 * Countdown promo memakai siklus **24 jam yang reset tiap tengah malam WIB**, bukan tanggal
 * berakhir. Alasannya: promo dikunci oleh sisa kuota, bukan oleh waktu; timer ini hanya
 * pengingat "hari ini" yang jujur — setiap pengunjung melihat sisa hari yang sama.
 *
 * Dihitung murni dari waktu, tanpa state per pengunjung dan tanpa data tambahan.
 */

/** WIB = UTC+7. Sama dengan konstanta di `lib/open-order-window.ts`. */
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Epoch ms tengah malam WIB **berikutnya** (00:00:00.000) untuk waktu `now`.
 *
 * Contoh: sekarang 31 Okt 2026 14:30 WIB → hasilnya 1 Nov 2026 00:00 WIB.
 * Tepat tengah malam (00:00:00.000) hasilnya adalah tengah malam hari berikutnya.
 */
export function nextWibMidnight(now: number = Date.now()): number {
  const wibNow = now + WIB_OFFSET_MS;
  const dayMs = 24 * 60 * 60 * 1000;
  const startOfWibDay = Math.floor(wibNow / dayMs) * dayMs;
  // +1 hari WIB, lalu dikembalikan ke epoch UTC.
  return startOfWibDay + dayMs - WIB_OFFSET_MS;
}

/**
 * Teks tengah malam WIB berikutnya, mis. "malam ini · 24.00 WIB".
 * Dipakai sebagai keterangan di bawah timer supaya tidak terasa mengambang.
 */
export function nextWibMidnightLabel(now: number = Date.now()): string {
  const target = new Date(nextWibMidnight(now) + WIB_OFFSET_MS);
  const hh = String(target.getUTCHours()).padStart(2, "0");
  const mm = String(target.getUTCMinutes()).padStart(2, "0");
  return `Berakhir malam ini · ${hh}.${mm} WIB`;
}

/**
 * ── Meta Pixel untuk landing promo ──
 *
 * Aturan yang dipegang supaya data bersih dan tidak dobel:
 *
 * 1. **`event_id` deterministik**, bukan acak. ID dibentuk dari `event_source` + elemen
 *    (`${source}-${event}-${suffix}`), jadi refresh halaman / re-render React / klik ganda
 *    menghasilkan `event_id` yang SAMA → Meta men-dedupe dalam window 48 jam. `generateEventId()`
 *    yang acak tidak bisa dipakai di sini karena setiap render akan membuat ID baru.
 * 2. **Purchase TIDAK ditembak dari halaman ini.** Pembelian tetap ditangani flow normal
 *    (`/checkout/success` & `/api/orders` & `/api/open-order`) dengan `event_id` = nomor pesanan
 *    (`CYO-…` / `OPS-…`), yang juga identik dengan CAPI server-side. Menembak Purchase di landing
 *    akan menghasilkan revenue ganda — landing ini hanya mengantar ke katalog/WhatsApp.
 * 3. Tidak ada data pribadi di sini: hanya nama promo, kategori, dan sumber klik.
 */
export const PROMO_PIXEL = {
  /** Nama sumber untuk membedakan event landing ini dari halaman lain. */
  eventSource: "promo_free_cover_hanger",
  contentCategory: "Promo",
  contentName: "Free Cover Hanger — Pembelian Pertama",
} as const;

/**
 * `event_id` stabil untuk satu jenis interaksi. Dipakai bersama oleh Pixel (browser) dan,
 * bila nanti ditambahkan, CAPI supaya keduanya bisa dipasangkan.
 *
 * @param action  nama aksi singkat, mis. `view_content`, `cta_katalog`, `wa_click`
 * @param suffix  pembeda opsional (mis. nama tombol/koleksi)
 */
export function promoEventId(action: string, suffix = ""): string {
  const parts = [PROMO_PIXEL.eventSource, action, suffix].filter(Boolean);
  // Hanya karakter yang lolos pola eventId CAPI (`/^[A-Za-z0-9._:-]{1,200}$/`).
  return parts.join("-").replace(/[^A-Za-z0-9._:-]+/g, "_").slice(0, 200);
}
