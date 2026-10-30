import { MetadataRoute } from "next";
import { SITE_URL, SITE_LOCALES } from "@/lib/site-config";

/**
 * Agen AI yang kita izinkan masuk (SEO + GEO).
 * OAI-SearchBot penting untuk ChatGPT Search, Google-CloudVertexBot untuk Vertex AI Agent.
 * Crawler "user-triggered" (ChatGPT-User, Google-Agent, dll) memang tidak menghiraukan
 * robots.txt — didaftarkan tetap supaya niat kita eksplisit.
 */
const AI_AGENTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "anthropic-ai",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Google-CloudVertexBot",
  "Applebot",
  "Applebot-Extended",
  "CCBot",
  "Bytespider",
  "cohere-ai",
  "Meta-ExternalAgent",
  "Amazonbot",
  "YouBot",
  "DuckAssistBot",
  "MistralAI-User",
];

/**
 * Path privat. Ditulis TANPA locale, lalu diperluas otomatis ke setiap locale.
 *
 * Penting: halaman toko memakai prefix bahasa (`/id/akun`, `/en/checkout`, …), bukan
 * `/akun`. Kalau daftar ini hanya berisi `/akun`, Google tetap bisa merayapi
 * `/id/akun` — itulah yang dulu memunculkan "Indexed, though blocked by robots.txt"
 * di Search Console. Sekarang versi ber-locale ikut ditutup.
 */
const PRIVATE_PATHS = [
  "/admin",
  "/panel-admin",
  "/ops",
  "/api/",
  "/checkout",
  "/cart",
  "/akun",
  "/open-order",
  "/reseller",
  "/affiliate",
];

/** Semua varian path privat: versi polos + setiap prefix locale. */
function privateRules(): string[] {
  const rules = new Set<string>();
  for (const base of PRIVATE_PATHS) {
    rules.add(base);
    for (const locale of SITE_LOCALES) {
      rules.add(`/${locale}${base}`);
    }
  }
  return [...rules];
}

export default function robots(): MetadataRoute.Robots {
  const disallow = privateRules();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow,
      },
      {
        userAgent: AI_AGENTS,
        allow: "/",
        disallow,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
