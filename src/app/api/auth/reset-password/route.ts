import { NextRequest, NextResponse } from "next/server";
import { PasswordResetNotReadyError, resetCustomerPassword } from "@/lib/password-reset";

/** Langkah 3 reset password: set password baru memakai token hasil verifikasi OTP. */

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const resetToken = typeof body.resetToken === "string" ? body.resetToken : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!resetToken || !password) {
    return NextResponse.json({ error: "Data reset tidak lengkap." }, { status: 400 });
  }

  try {
    const result = await resetCustomerPassword(resetToken, password);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    if (error instanceof PasswordResetNotReadyError) {
      return NextResponse.json(
        { error: "Fitur reset password belum aktif. Hubungi admin SAMAQU." },
        { status: 503 },
      );
    }

    console.error("[RESET-OTP] Gagal mengganti password:", error);
    return NextResponse.json(
      { error: "Gagal menyimpan password baru. Coba lagi." },
      { status: 500 },
    );
  }
}
