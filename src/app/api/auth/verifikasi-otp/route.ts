import { NextRequest, NextResponse } from "next/server";
import {
  PasswordResetNotReadyError,
  verifyPasswordResetOtp,
} from "@/lib/password-reset";
import { checkRateLimit } from "@/lib/rate-limit";

/** Langkah 2 reset password: cocokkan kode OTP, terbitkan token reset sekali pakai. */

export async function POST(req: NextRequest) {
  // OTP 6 digit bisa ditebak kalau tidak dibatasi. Batasnya per IP, di luar batas
  // percobaan per-email yang sudah ada di `verifyPasswordResetOtp`.
  const limit = await checkRateLimit(req, "otp-verify", 20, 15 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Terlalu banyak percobaan. Coba lagi nanti." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";

  if (!email || !code) {
    return NextResponse.json({ error: "Email dan kode wajib diisi." }, { status: 400 });
  }

  try {
    const result = await verifyPasswordResetOtp(email, code);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    if (error instanceof PasswordResetNotReadyError) {
      return NextResponse.json(
        { error: "Fitur reset password belum aktif. Hubungi admin SAMAQU." },
        { status: 503 },
      );
    }

    console.error("[RESET-OTP] Verifikasi kode gagal:", error);
    return NextResponse.json(
      { error: "Gagal memverifikasi kode. Coba lagi." },
      { status: 500 },
    );
  }
}
