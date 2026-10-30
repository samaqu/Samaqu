import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";

/**
 * Antrean "perlu dicek": top up pending, pembayaran kekurangan pending,
 * dan penarikan pending — satu endpoint supaya badge & halaman antrean
 * memakai angka yang sama.
 */
export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const supabase = getSupabaseAdmin();
  const [topups, orderPayments, withdrawals] = await Promise.all([
    supabase
      .from("reseller_topups")
      .select("id, code, amount, proof_url, payment_method, status, created_at, reseller_id, resellers(store_name, owner_name, whatsapp)")
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    supabase
      .from("reseller_order_payments")
      .select("id, order_id, amount, proof_url, payment_method, status, created_at, reseller_id, resellers(store_name, owner_name, whatsapp), orders(order_number, total, status, reseller_shortfall_status)")
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    supabase
      .from("reseller_withdrawals")
      .select("id, amount, bank_name, bank_number, bank_holder, is_bsi, admin_fee, transfer_amount, status, created_at, reseller_id, resellers(store_name, owner_name, whatsapp)")
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
  ]);

  const firstError = topups.error || orderPayments.error || withdrawals.error;
  if (firstError) {
    console.error("[OPS-RESELLER] Gagal membaca antrean:", firstError.message);
    return NextResponse.json({ error: "Gagal memuat antrean" }, { status: 500 });
  }

  return NextResponse.json({
    topups: topups.data ?? [],
    order_payments: orderPayments.data ?? [],
    withdrawals: withdrawals.data ?? [],
  });
}
