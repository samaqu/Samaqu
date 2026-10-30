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

const nextConfig: NextConfig = {
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
    ],
  },
  experimental: {
    optimizePackageImports: ["framer-motion", "lucide-react"],
  },
  // Font laporan PDF dibaca dari filesystem saat request (bukan lewat import), jadi
  // perlu didaftarkan eksplisit supaya ikut ter-bundle di deploy serverless.
  outputFileTracingIncludes: {
    "/api/ops/leads/report": ["./src/assets/fonts/**"],
  },
  ...(allowedDevOrigins ? { allowedDevOrigins } : {}),
};

export default withNextIntl(nextConfig);
