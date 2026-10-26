export interface VoucherResult {
  valid: true;
  voucher: {
    id: string;
    code: string;
    discount_type: string;
    discount_value: number;
    max_discount: number;
    min_purchase: number;
    limit_per_wa: boolean;
  };
  discount: number;
}

export interface VoucherError {
  valid: false;
  error: string;
}

/**
 * Validasi kode promo lewat server.
 *
 * Tabel `vouchers` tidak lagi dapat dibaca publik. Nominal yang tampil di sini hanya pratinjau;
 * /api/orders menghitung ulang diskon dari subtotal server sebelum pesanan dibuat.
 */
export async function validateVoucher(
  code: string,
  subtotal: number,
  whatsapp?: string
): Promise<VoucherResult | VoucherError> {
  try {
    const res = await fetch("/api/vouchers/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, subtotal, whatsapp: whatsapp || "" }),
    });
    const json = (await res.json().catch(() => null)) as VoucherResult | VoucherError | null;
    if (!json) return { valid: false, error: "Gagal memeriksa kode promo. Coba lagi." };
    return json;
  } catch {
    return { valid: false, error: "Gagal memeriksa kode promo. Coba lagi." };
  }
}
