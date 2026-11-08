import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// The Base44 sandbox preview proxies the dev server through `3000-<suffix>`, so the
// browser's Origin differs from localhost and Next blocks dev assets/HMR for it.
// Sandbox-only: enabled just when BASE44_PREVIEW_MODE === "1" (unset ⇒ original config).
const previewHostSuffix = process.env.BASE44_PUBLIC_HOST_SUFFIX;
const allowedDevOrigins =
  process.env.BASE44_PREVIEW_MODE === "1" && previewHostSuffix
    ? [`3000-${previewHostSuffix}`]
    : undefined;

/**
 * Header keamanan untuk semua respons.
 *
 * Sengaja tanpa `Content-Security-Policy` yang memblokir: aplikasi memuat Meta Pixel,
 * Vercel Analytics, Supabase Storage, Cloudinary, dan iframe embed. CSP ketat akan
 * memutus salah satunya. Rekomendasi CSP ada di laporan audit (mode report-only dulu).
 *
 * `X-Frame-Options: SAMEORIGIN` + `frame-ancestors 'self'` menjaga klikjacking tanpa
 * memblokir embed internal. Kalau suatu saat butuh embed lintas domain, ubah di sini.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    // Kamera hanya untuk pengunjung biasa; kamera/mikrofon tidak dipakai fitur lain.
    value: "camera=(self), microphone=(), geolocation=(self), payment=(), usb=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    // 2 tahun, berlaku untuk subdomain. Domain produksi selalu HTTPS (Vercel).
    value: "max-age=63072000; includeSubDomains",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

/**
 * Redirect permanen (301) URL lama WordPress → halaman padanan di situs sekarang.
 *
 * Aturannya:
 *  - Hanya path yang memang SUDAH TIDAK ADA route-nya. `/cart`, `/akun`, `/akun/login`,
 *    `/akun/register`, dan `/feed/meta.csv` adalah route aktif sekarang → sengaja TIDAK
 *    di-redirect (aturan hanya menyasar path lama tanpa prefix locale seperti `/register`).
 *  - Query string tidak ditangani di sini, jadi `/?p=123` / `/?page_id=…` tidak tersentuh.
 *  - Versi ber-locale dibuat eksplisit: `/id/...` → `/id/...`, `/en/...` → `/en/...`.
 *  - Dipasang di `next.config.ts` (bukan middleware) supaya dievaluasi SEBELUM locale
 *    routing, sehingga `/contact` tidak sempat di-rewrite jadi `/<locale>/contact`.
 *
 * Catatan: file ini tidak bisa memakai alias `@/…`, jadi daftar locale ditulis di sini.
 */
const LOCALES = ["id", "en"] as const;

/**
 * Host media publik R2 (foto Instagram & katalog). Dibaca dari `R2_PUBLIC_BASE_URL`
 * supaya host tidak ditulis dua kali; `next/image` menolak host yang tidak terdaftar
 * (`Invalid src prop … is not configured under images`) dan mematikan seluruh halaman.
 * Kalau variabel kosong/tidak valid, host ini tidak ditambahkan (perilaku lama).
 */
function r2ImageHostname(): string | null {
  const base = process.env.R2_PUBLIC_BASE_URL;
  if (!base) return null;
  try {
    return new URL(base).hostname || null;
  } catch {
    return null;
  }
}

/** Pasangan path lama → tujuan (tanpa prefix locale). "/" berarti beranda. */
const LEGACY_PATHS: { source: string; destination: string }[] = [
  { source: "/contact", destination: "/faq#hubungi" },
  { source: "/contact-us", destination: "/faq#hubungi" },
  { source: "/hubungi-kami", destination: "/faq#hubungi" },
  { source: "/about", destination: "/tentang-kami" },
  { source: "/about-us", destination: "/tentang-kami" },
  { source: "/shop", destination: "/katalog" },
  { source: "/product/:path*", destination: "/katalog" },
  { source: "/category/:path*", destination: "/katalog" },
  { source: "/tag/:path*", destination: "/katalog" },
  { source: "/my-account", destination: "/akun" },
  // `/register` lama (WordPress) → daftar akun. Route sekarang hidup di `/akun/register`,
  // jadi `/register` sendiri memang 404 tanpa aturan ini.
  { source: "/register", destination: "/akun/register" },
  { source: "/login", destination: "/akun/login" },
  { source: "/wp-login.php", destination: "/" },
  { source: "/wp-admin/:path*", destination: "/" },
  { source: "/xmlrpc.php", destination: "/" },
];

function legacyRedirects() {
  const rules: { source: string; destination: string; permanent: boolean }[] = [];
  const localize = (locale: string, path: string) => (path === "/" ? `/${locale}` : `/${locale}${path}`);

  for (const rule of LEGACY_PATHS) {
    rules.push({ ...rule, permanent: true });
  }

  // /feed: route aktif hanya "/feed/meta.csv". Sisanya (feed WordPress) diarahkan ke beranda.
  rules.push({ source: "/feed", destination: "/", permanent: true });
  rules.push({ source: "/feed/:path((?!meta\\.csv$).*)", destination: "/", permanent: true });

  // Sitemap WordPress → sitemap Next.
  rules.push({ source: "/sitemap_index.xml", destination: "/sitemap.xml", permanent: true });
  rules.push({ source: "/wp-sitemap.xml", destination: "/sitemap.xml", permanent: true });

  for (const locale of LOCALES) {
    for (const rule of LEGACY_PATHS) {
      rules.push({
        source: `/${locale}${rule.source}`,
        destination: localize(locale, rule.destination),
        permanent: true,
      });
    }
    rules.push({ source: `/${locale}/feed`, destination: `/${locale}`, permanent: true });
    rules.push({ source: `/${locale}/feed/:path((?!meta\\.csv$).*)`, destination: `/${locale}`, permanent: true });
    rules.push({ source: `/${locale}/sitemap_index.xml`, destination: "/sitemap.xml", permanent: true });
    rules.push({ source: `/${locale}/wp-sitemap.xml`, destination: "/sitemap.xml", permanent: true });
  }

  return rules;
}

const nextConfig: NextConfig = {
  async redirects() {
    return legacyRedirects();
  },
  async headers() {
    return [
      {
        // Semua route, termasuk API dan aset statis.
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      // Media katalog sudah dimigrasi ke Supabase Storage (bucket publik
      // `media-backup`, URL *.supabase.co) — lihat AGENTS.md. Foto Instagram
      // BUKAN di sini: diunggah ke Cloudinary (lihat InstagramPhotosManager).
      { protocol: "https", hostname: "**.supabase.co" },
      // Foto Instagram & sebagian media katalog sekarang disajikan dari R2.
      // Tanpa host ini `next/image` melempar "Invalid src prop" dan halaman mati.
      ...(r2ImageHostname() ? [{ protocol: "https" as const, hostname: r2ImageHostname()! }] : []),
    ],
  },
  experimental: {
    // Didaftarkan supaya resolusi import tetap eksplisit kalau ada penambahan ikon baru.
    // Catatan: paket ini sudah `sideEffects: false`, jadi tree-shaking tetap bekerja
    // tanpanya — daftar ini bukan penghematan ukuran bundle.
    optimizePackageImports: ["framer-motion", "lucide-react", "@phosphor-icons/react"],
  },
  // Font laporan PDF dibaca dari filesystem saat request (bukan lewat import), jadi
  // perlu didaftarkan eksplisit supaya ikut ter-bundle di deploy serverless.
  outputFileTracingIncludes: {
    "/api/ops/leads/report": ["./src/assets/fonts/**"],
  },
  ...(allowedDevOrigins ? { allowedDevOrigins } : {}),
};

export default withNextIntl(nextConfig);
