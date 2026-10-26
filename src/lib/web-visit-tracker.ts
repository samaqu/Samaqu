import type { NextFetchEvent, NextRequest } from "next/server";

/**
 * Pencatat kunjungan sisi server (dipanggil dari `src/middleware.ts`).
 *
 * Kenapa ada: Web Analytics di browser bisa diblokir ad blocker, jadi angkanya selalu lebih
 * kecil dari kenyataan. Request yang sudah sampai ke server tidak bisa diblokir.
 *
 * Aturan pencatatan (supaya angka = pengunjung publik):
 *  - hanya host produksi;
 *  - hanya halaman (bukan API/aset/internal); halaman internal /ops, /panel-admin, /admin,
 *    /affiliate tidak dihitung — staf bukan pengunjung;
 *  - hanya navigasi dokumen: RSC/prefetch Next.js dilewati supaya tidak dobel saat pindah halaman;
 *  - bot/crawler/webview preview (WhatsApp, FB, Telegram) dilewati lewat user-agent;
 *  - tidak menyimpan IP/UA mentah: hash `sha256(secret + hari + IP + UA)` = 1 visitor/hari.
 *
 * Kegagalan mencatat TIDAK pernah menggagalkan request halaman (fire-and-forget via waitUntil).
 */

const COUNTED_HOSTS = new Set(["samaqu.id", "www.samaqu.id", "samaqu-flax.vercel.app"]);

const SKIP_PREFIXES = [
  "/api",
  "/_next",
  "/_vercel",
  "/ops",
  "/panel-admin",
  "/admin",
  "/affiliate",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
];

const BOT_UA =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|headless|curl|wget|python-requests|axios|monitor|uptime|pingdom|lighthouse|pagespeed|gtmetrix/i;

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Tanggal kalender WIB (YYYY-MM-DD) — "hari ini" harus sama dengan dashboard ops. */
const wibDay = (now: Date) => new Date(now.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function deviceOf(userAgent: string): string {
  if (/ipad|tablet/i.test(userAgent)) return "tablet";
  if (/mobile|android|iphone/i.test(userAgent)) return "mobile";
  return "desktop";
}

/** Browser dari user-agent. Urutan penting: Edge/Opera/Samsung sebelum Chrome, Chrome sebelum Safari. */
function browserOf(userAgent: string): string {
  if (/edg\//i.test(userAgent)) return "Edge";
  if (/opr\/|opera mini|opera mobi/i.test(userAgent)) return "Opera";
  if (/samsungbrowser/i.test(userAgent)) return "Samsung Internet";
  if (/firefox|fxios/i.test(userAgent)) return "Firefox";
  if (/chrome|crios/i.test(userAgent)) return "Chrome";
  if (/safari/i.test(userAgent)) return "Safari";
  return "Lainnya";
}

/** OS dari user-agent. Android dicek sebelum Linux, iOS sebelum macOS (UA-nya saling mengandung). */
function osOf(userAgent: string): string {
  if (/windows/i.test(userAgent)) return "Windows";
  if (/android/i.test(userAgent)) return "Android";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "iOS";
  if (/mac os x|macintosh/i.test(userAgent)) return "macOS";
  if (/linux/i.test(userAgent)) return "Linux";
  return "Lainnya";
}

/** Bahasa utama dari `accept-language` (mis. "id-ID,id;q=0.9" → "id-id"). */
function languageOf(value: string): string | null {
  const first = value.split(",")[0]?.split(";")[0]?.trim().toLowerCase();
  return first ? first.slice(0, 24) : null;
}

const clean = (value: string | null, max = 80): string | null => {
  const trimmed = String(value || "").trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

/** Catat satu kunjungan bila request ini memang layak dihitung. */
export function trackVisit(request: NextRequest, event: NextFetchEvent): void {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = process.env.VISIT_HASH_SECRET;
  // Tanpa env, pencatatan dilewati (jangan pernah mengirim IP mentah / data tanpa hash).
  if (!supabaseUrl || !serviceKey || !secret) return;

  const host = (request.headers.get("host") || "").split(":")[0].trim().toLowerCase();
  if (!COUNTED_HOSTS.has(host)) return;

  const path = request.nextUrl.pathname || "/";
  if (SKIP_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return;

  const headers = request.headers;
  // Navigasi RSC / prefetch Next.js bukan kunjungan baru.
  if (headers.get("rsc") === "1") return;
  if (headers.get("next-router-prefetch") === "1") return;
  if ((headers.get("purpose") || headers.get("sec-purpose") || "").toLowerCase().includes("prefetch")) return;

  const dest = headers.get("sec-fetch-dest");
  if (dest && dest !== "document") return;
  const accept = headers.get("accept") || "";
  if (!dest && accept && !accept.includes("text/html")) return;

  const userAgent = headers.get("user-agent") || "";
  if (!userAgent || BOT_UA.test(userAgent)) return;

  const forwarded = headers.get("x-forwarded-for") || "";
  const ip = forwarded.split(",")[0].trim() || headers.get("x-real-ip") || "";
  const referer = headers.get("referer") || "";
  let referrerHost: string | null = null;
  if (referer) {
    try {
      const ref = new URL(referer);
      const refHost = ref.hostname.toLowerCase();
      if (refHost !== host) referrerHost = refHost;
    } catch {
      // Referer tidak valid — abaikan.
    }
  }

  const day = wibDay(new Date());
  const search = request.nextUrl.searchParams;

  // Kota dari Vercel datang dalam bentuk URL-encoded.
  const cityHeader = headers.get("x-vercel-ip-city");
  let city: string | null = null;
  if (cityHeader) {
    try {
      city = clean(decodeURIComponent(cityHeader), 60);
    } catch {
      city = clean(cityHeader, 60);
    }
  }

  const row = {
    day,
    path,
    referrer_host: referrerHost,
    country: (headers.get("x-vercel-ip-country") || "").toUpperCase() || null,
    region: clean(headers.get("x-vercel-ip-country-region"), 40),
    city,
    device: deviceOf(userAgent),
    browser: browserOf(userAgent),
    os: osOf(userAgent),
    language: languageOf(headers.get("accept-language") || ""),
    utm_source: clean(search.get("utm_source")),
    utm_medium: clean(search.get("utm_medium")),
    utm_campaign: clean(search.get("utm_campaign")),
    visitor_hash: "",
  };

  event.waitUntil(
    (async () => {
      try {
        const visitorHash = await sha256Hex(`${secret}|${day}|${ip}|${userAgent}`);
        const post = (body: Record<string, unknown>) =>
          fetch(`${supabaseUrl}/rest/v1/web_visits`, {
            method: "POST",
            headers: {
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
              "Content-Type": "application/json",
              Prefer: "return=minimal",
            },
            body: JSON.stringify([body]),
          });

        const response = await post({ ...row, visitor_hash: visitorHash });
        if (!response.ok) {
          // Kolom detail belum ada (migrasi 20261026_web_analytics_detail.sql belum dijalankan):
          // kunjungan tetap dicatat dengan kolom dasar supaya tidak ada data yang hilang.
          await post({
            day: row.day,
            path: row.path,
            referrer_host: row.referrer_host,
            country: row.country,
            device: row.device,
            visitor_hash: visitorHash,
          });
        }
      } catch {
        // Pencatatan trafik tidak boleh mengganggu halaman.
      }
    })(),
  );
}
