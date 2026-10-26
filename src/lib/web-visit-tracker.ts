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
  const row = {
    day,
    path,
    referrer_host: referrerHost,
    country: (headers.get("x-vercel-ip-country") || "").toUpperCase() || null,
    device: deviceOf(userAgent),
    visitor_hash: "",
  };

  event.waitUntil(
    (async () => {
      try {
        row.visitor_hash = await sha256Hex(`${secret}|${day}|${ip}|${userAgent}`);
        await fetch(`${supabaseUrl}/rest/v1/web_visits`, {
          method: "POST",
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify([row]),
        });
      } catch {
        // Pencatatan trafik tidak boleh mengganggu halaman.
      }
    })(),
  );
}
