import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { requestIp } from "@/lib/password-reset";
import { requestResellerOtp } from "@/lib/reseller/otp";

/**
 * Langkah 1 login reseller: minta OTP ke WhatsApp.
 *
 * Hanya dikirim kalau nomor terdaftar sebagai reseller active — tetapi
 * respons SELALU generik supaya nomor tidak bisa dienumerasi. Rate limit
 * per IP memakai tabel `api_rate_limits` yang sudah ada.
 */
const GENERIC_MESSAGE =
  "Kalau nomor ini terdaftar sebagai reseller aktif, kode 6 digit sudah dikirim lewat WhatsApp.";

export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, "reseller-otp-request", 10, 60 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan. Coba lagi nanti." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const whatsapp = typeof body.whatsapp === "string" ? body.whatsapp.trim() : "";

  if (!whatsapp || whatsapp.replace(/\D/g, "").length < 9) {
    return NextResponse.json({ error: "Nomor WhatsApp tidak valid." }, { status: 400 });
  }

  try {
    await requestResellerOtp(whatsapp, requestIp(req.headers));
    return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
  } catch (error) {
    console.error("[RESELLER-OTP] Permintaan kode gagal:", error);
    // Kegagalan internal tidak membocorkan detail.
    return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
  }
}
