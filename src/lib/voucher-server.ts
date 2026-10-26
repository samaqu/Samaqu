import { getSupabaseAdmin } from "./supabase-admin";

/**
 * Validasi voucher di server (service role).
 *
 * Dipakai endpoint /api/vouchers/validate (tampilan checkout) DAN /api/orders saat membuat
 * pesanan. Yang menentukan nominal akhir selalu pemanggilan di /api/orders dengan subtotal
 * hasil hitung server — subtotal dari browser hanya untuk pratinjau.
 */
export interface ServerVoucher {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  max_discount: number;
  min_purchase: number;
  limit_per_wa: boolean;
  used_count: number;
}

export type VoucherServerResult =
  | { valid: true; voucher: ServerVoucher; discount: number }
  | { valid: false; error: string };

function normalizePhone(value: string | null | undefined): string {
  return String(value || "").replace(/[^0-9]/g, "");
}

export async function validateVoucherServer(
  rawCode: string,
  subtotal: number,
  whatsapp?: string | null,
): Promise<VoucherServerResult> {
  const code = String(rawCode || "").trim().toUpperCase();
  if (!code) return { valid: false, error: "Masukkan kode promo" };

  const safeSubtotal = Math.max(0, Math.round(Number(subtotal) || 0));
  const admin = getSupabaseAdmin();
  const { data: voucher, error } = await admin
    .from("vouchers")
    .select("*")
    .eq("code", code)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("[VOUCHER] Gagal membaca voucher:", error.message);
    return { valid: false, error: "Gagal memeriksa kode promo. Coba lagi." };
  }
  if (!voucher) return { valid: false, error: "Kode promo tidak valid" };

  const now = Date.now();
  if (voucher.start_date && new Date(voucher.start_date).getTime() > now) {
    return { valid: false, error: "Kode promo belum berlaku" };
  }
  if (voucher.end_date && new Date(voucher.end_date).getTime() < now) {
    return { valid: false, error: "Kode promo sudah kadaluarsa" };
  }
  if (Number(voucher.usage_limit) > 0 && Number(voucher.used_count) >= Number(voucher.usage_limit)) {
    return { valid: false, error: "Kode promo sudah habis digunakan" };
  }
  if (Number(voucher.min_purchase) > 0 && safeSubtotal < Number(voucher.min_purchase)) {
    return {
      valid: false,
      error: `Minimal belanja Rp ${Number(voucher.min_purchase).toLocaleString("id-ID")} untuk kode ini`,
    };
  }

  if (voucher.limit_per_wa) {
    const phone = normalizePhone(whatsapp);
    if (phone) {
      const { data: usage } = await admin
        .from("voucher_usages")
        .select("id")
        .eq("voucher_id", voucher.id)
        .eq("whatsapp_number", phone)
        .limit(1);
      if (usage && usage.length > 0) {
        return { valid: false, error: "Kode voucher ini sudah pernah Anda gunakan" };
      }
    }
  }

  let discount = 0;
  if (voucher.discount_type === "percentage") {
    discount = Math.round((safeSubtotal * Number(voucher.discount_value)) / 100);
    if (Number(voucher.max_discount) > 0) {
      discount = Math.min(discount, Number(voucher.max_discount));
    }
  } else {
    discount = Math.min(Number(voucher.discount_value) || 0, safeSubtotal);
  }
  discount = Math.max(0, Math.min(Math.round(discount), safeSubtotal));

  return {
    valid: true,
    voucher: {
      id: String(voucher.id),
      code: String(voucher.code),
      discount_type: String(voucher.discount_type),
      discount_value: Number(voucher.discount_value) || 0,
      max_discount: Number(voucher.max_discount) || 0,
      min_purchase: Number(voucher.min_purchase) || 0,
      limit_per_wa: voucher.limit_per_wa === true,
      used_count: Number(voucher.used_count) || 0,
    },
    discount,
  };
}
