import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Syarat bergabung affiliate: minimal satu pembelian VALID (bukan dibatalkan/refund).
 *
 * Memakai data transaksi yang sudah ada (`orders`) — tidak ada tabel baru. Pencocokan
 * dilakukan lewat email atau nomor WhatsApp yang tersimpan di pesanan, karena akun
 * affiliate belum tentu sudah ada saat pengecekan.
 *
 * Hasil:
 *  - `eligible`          : ada minimal satu pesanan valid.
 *  - `not_eligible`      : ada riwayat pesanan, tetapi semuanya batal/refund.
 *  - `needs_verification`: belum ada riwayat yang cocok — jangan langsung tolak,
 *                          admin yang memverifikasi (status akun tetap "menunggu").
 */

export type EligibilityStatus = "eligible" | "not_eligible" | "needs_verification";

export type EligibilityResult = {
  status: EligibilityStatus;
  validOrders: number;
  totalOrders: number;
};

const INVALID_STATUS = ["dibatalkan", "pending", "refund", "refunded"];

function normalizePhone(value: string): string {
  return String(value || "").replace(/\D/g, "").replace(/^62/, "0");
}

export async function checkPurchaseEligibility(
  admin: SupabaseClient,
  input: { email?: string | null; phone?: string | null },
): Promise<EligibilityResult> {
  const email = String(input.email || "").trim().toLowerCase();
  const phone = normalizePhone(String(input.phone || ""));

  if (!email && !phone) {
    return { status: "needs_verification", validOrders: 0, totalOrders: 0 };
  }

  // Query terpisah per identifier (lebih aman daripada `or(...)` untuk nilai ber-@).
  const queries = [];
  if (email) queries.push(admin.from("orders").select("id, status, payment_status").eq("customer_email", email).limit(200));
  if (phone) {
    queries.push(admin.from("orders").select("id, status, payment_status").eq("customer_whatsapp", phone).limit(200));
    queries.push(
      admin.from("orders").select("id, status, payment_status").eq("customer_whatsapp", phone.replace(/^0/, "62")).limit(200),
    );
  }

  const results = await Promise.all(queries);
  const merged = new Map<string, any>();
  for (const result of results) {
    if (result.error) {
      console.error("[affiliate] Gagal memeriksa riwayat pembelian:", result.error.message);
      continue;
    }
    for (const row of result.data || []) merged.set(String(row.id), row);
  }

  const rows = Array.from(merged.values());
  const valid = rows.filter((order: any) => {
    const status = String(order.status || "").toLowerCase();
    const payment = String(order.payment_status || "").toLowerCase();
    if (INVALID_STATUS.includes(status)) return false;
    if (payment.includes("refund")) return false;
    // Pesanan dianggap valid kalau sudah dibayar atau sudah masuk proses pengiriman.
    return payment === "paid" || ["diproses", "dikirim", "selesai"].includes(status);
  });

  if (valid.length > 0) {
    return { status: "eligible", validOrders: valid.length, totalOrders: rows.length };
  }
  if (rows.length > 0) {
    return { status: "not_eligible", validOrders: 0, totalOrders: rows.length };
  }
  return { status: "needs_verification", validOrders: 0, totalOrders: 0 };
}
