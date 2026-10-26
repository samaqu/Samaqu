import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { validateVoucherServer } from "@/lib/voucher-server";

/**
 * Validasi kode promo untuk halaman checkout.
 *
 * Tabel `vouchers` tidak lagi bisa dibaca publik; browser hanya melihat hasil validasi ini.
 * Nominal akhir tetap dihitung ULANG di /api/orders memakai subtotal server.
 */
export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, "voucher-validate", 30, 60 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { valid: false, error: "Terlalu banyak percobaan kode promo. Coba lagi nanti." },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code : "";
  const subtotal = Number(body?.subtotal) || 0;
  const whatsapp = typeof body?.whatsapp === "string" ? body.whatsapp : "";

  const result = await validateVoucherServer(code, subtotal, whatsapp);
  return NextResponse.json(result, { status: result.valid ? 200 : 400 });
}
