import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyResellerOtp } from "@/lib/reseller/otp";
import { issueResellerSession } from "@/lib/reseller/auth";

/**
 * Langkah 2 login reseller: verifikasi kode OTP → terbitkan token sesi.
 * Yang disimpan di database hanya hash token (tabel `reseller_sessions`).
 */
export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, "reseller-otp-verify", 20, 60 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Terlalu banyak percobaan. Coba lagi nanti." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const whatsapp = typeof body.whatsapp === "string" ? body.whatsapp.trim() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";

  if (!whatsapp || !code) {
    return NextResponse.json({ error: "Nomor dan kode wajib diisi." }, { status: 400 });
  }

  try {
    const result = await verifyResellerOtp(whatsapp, code);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, expired: result.expired, attemptsLeft: result.attemptsLeft },
        { status: 400 }
      );
    }

    const token = await issueResellerSession(result.reseller.id);
    return NextResponse.json({
      ok: true,
      token,
      reseller: {
        id: result.reseller.id,
        store_name: result.reseller.store_name,
        owner_name: result.reseller.owner_name,
        whatsapp: result.reseller.whatsapp,
        status: result.reseller.status,
      },
    });
  } catch (error) {
    console.error("[RESELLER-OTP] Verifikasi gagal:", error);
    return NextResponse.json({ error: "Gagal memverifikasi kode. Coba lagi." }, { status: 500 });
  }
}
