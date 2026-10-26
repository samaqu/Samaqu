import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import type { EligibilityStatus } from "@/lib/affiliate/eligibility";

/**
 * Cek syarat bergabung affiliate.
 *
 * Respons SELALU generik: endpoint publik tidak boleh membocorkan apakah sebuah email/nomor
 * pernah membeli. Pemeriksaan riwayat yang sebenarnya tetap dilakukan di /api/affiliate/register
 * (server) dan oleh admin sebelum menyetujui pendaftaran.
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
  const limited = await checkRateLimit(req, "affiliate-eligibility", 20, 60 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { status: "needs_verification", message: MESSAGE.needs_verification },
      { status: 429 },
    );
  }

  return NextResponse.json({
    status: "needs_verification",
    message: MESSAGE.needs_verification,
  });
}
