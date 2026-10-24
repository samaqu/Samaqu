import { NextRequest, NextResponse } from "next/server";
import {
  PasswordResetNotReadyError,
  requestIp,
  requestPasswordResetOtp,
} from "@/lib/password-reset";

/**
 * Langkah 1 reset password: minta kode OTP ke WhatsApp yang terdaftar pada email.
 *
 * Respons SELALU generik saat email tidak ditemukan / tidak punya nomor, supaya tidak
 * membocorkan akun mana yang terdaftar. Pesan WhatsApp dikirim lewat jalur customer
 * (`src/lib/fonnte.ts`).
 */

const GENERIC_MESSAGE =
  "Kalau email ini terdaftar, kode 6 digit sudah dikirim ke WhatsApp yang terdaftar.";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const email = typeof body.email === "string" ? body.email.trim() : "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Format email tidak valid." }, { status: 400 });
  }

  try {
    await requestPasswordResetOtp(email, requestIp(req.headers));
    return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
  } catch (error) {
    if (error instanceof PasswordResetNotReadyError) {
      console.error("[RESET-OTP] Migrasi belum dijalankan:", error.message);
      return NextResponse.json(
        { error: "Fitur reset password belum aktif. Hubungi admin SAMAQU." },
        { status: 503 },
      );
    }

    console.error("[RESET-OTP] Permintaan kode gagal:", error);
    // Kegagalan internal tidak perlu membocorkan detail ke browser.
    return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
  }
}
