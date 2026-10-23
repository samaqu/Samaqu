import { NextRequest, NextResponse } from "next/server";
import {
  buildFbc,
  checkCapiRateLimit,
  CLIENT_CAPI_EVENTS,
  getClientIp,
  getMetaCookies,
  sendMetaCapiEvent,
} from "@/lib/meta-capi";

/**
 * Endpoint CAPI untuk event yang dipicu dari browser (ViewContent, AddToCart,
 * InitiateCheckout, CompleteRegistration, dst).
 *
 * Purchase TIDAK dilayani di sini — Purchase dikirim server-side sekali saat order dibuat
 * (/api/orders & /api/open-order) supaya tidak bisa dipalsukan dan tidak dobel.
 *
 * Keamanan: token akses tidak pernah dikirim balik; hanya event yang dikenal yang diteruskan;
 * origin harus sama; ada rate limit dasar per IP; custom_data dibersihkan oleh `sanitizeCustomData`.
 */

const MAX_BODY_BYTES = 32 * 1024;
const EVENT_ID_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function sameOrigin(request: NextRequest): boolean {
  // Browser fetch selalu membawa Origin + Sec-Fetch-Site. Form lintas situs tidak bisa
  // mengirim Content-Type JSON tanpa preflight CORS, jadi kombinasi ini memblokir spam dasar.
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site" && fetchSite !== "none") {
    return false;
  }

  const origin = request.headers.get("origin");
  if (!origin) return true; // request same-origin lama / non-browser tanpa Origin
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

function cleanUserString(value: unknown, max = 200): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
}

export async function POST(request: NextRequest) {
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_BODY_BYTES) return bad("Payload terlalu besar", 413);

    if (!sameOrigin(request)) return bad("Origin tidak dikenal", 403);

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return bad("Content-Type harus application/json", 415);
    }

    const clientIp = getClientIp(request);
    if (!checkCapiRateLimit(clientIp)) return bad("Terlalu banyak event", 429);

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return bad("Body tidak valid");

    const eventName = cleanUserString(body.eventName, 64);
    const eventId = cleanUserString(body.eventId, 200);

    if (!eventName || !eventId) return bad("eventName/eventId wajib");
    if (!EVENT_ID_PATTERN.test(eventId)) return bad("eventId tidak valid");
    if (!CLIENT_CAPI_EVENTS.has(eventName)) {
      // Termasuk Purchase: jangan izinkan publik mengirim Purchase.
      return bad("Event tidak diizinkan", 403);
    }

    const rawUser = body.userData && typeof body.userData === "object" ? body.userData : {};
    const cookies = getMetaCookies(request);

    // fbp/fbc dari body (dibaca browser) → fallback cookie request. fbc bisa dibentuk dari fbclid.
    const fbp = cleanUserString(body.fbp, 200) || cookies.fbp;
    const fbc = cleanUserString(body.fbc, 400) || cookies.fbc || buildFbc(cleanUserString(body.fbclid, 500));

    const eventSourceUrl =
      cleanUserString(body.eventSourceUrl, 1000) ||
      cleanUserString(request.headers.get("referer"), 1000);

    const result = await sendMetaCapiEvent({
      eventName,
      eventId,
      eventSourceUrl,
      userData: {
        email: cleanUserString(rawUser.email, 320),
        phone: cleanUserString(rawUser.phone, 40),
        name: cleanUserString(rawUser.name, 120),
        city: cleanUserString(rawUser.city, 120),
        externalId: cleanUserString(rawUser.externalId, 200),
        fbp,
        fbc,
        clientIp,
        clientUserAgent: cleanUserString(request.headers.get("user-agent"), 1000),
      },
      customData: body.customData,
    });

    // Gagal kirim ke Meta bukan error untuk client (fire-and-forget).
    return NextResponse.json({ ok: result.ok, skipped: result.skipped === true });
  } catch (error) {
    // Jangan log body/payload — bisa berisi data pribadi.
    console.warn("[Meta CAPI] request gagal:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
