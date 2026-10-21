import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { checkPurchaseEligibility, type EligibilityStatus } from "@/lib/affiliate/eligibility";

/**
 * Cek syarat bergabung affiliate (minimal 1 pembelian valid).
 *
 * Publik (tanpa login) karena dipakai di halaman pendaftaran sebelum akun dibuat.
 * Hanya membaca riwayat pesanan lewat email/nomor WhatsApp; tidak mengubah data.
 */

const MESSAGE: Record<EligibilityStatus, string> = {
  eligible:
    "Syarat terpenuhi. Kamu pernah membeli produk SAMAQU, silakan lanjutkan pendaftaran.",
  not_eligible:
    "Riwayat pembelianmu belum valid (pesanan dibatalkan/refund). Silakan lakukan pembelian pertama dulu.",
  needs_verification:
    "Pembelian belum bisa diverifikasi otomatis. Kamu tetap bisa mendaftar — admin akan memverifikasi riwayat pembelianmu.",
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = String(body?.email || "").trim();
  const phone = String(body?.phone || "").trim();

  if (!email && !phone) {
    return NextResponse.json(
      { status: "needs_verification", message: MESSAGE.needs_verification },
      { status: 200 },
    );
  }

  const admin = getSupabaseAdmin();
  const result = await checkPurchaseEligibility(admin, { email, phone });

  return NextResponse.json({
    ...result,
    message: MESSAGE[result.status],
  });
}
