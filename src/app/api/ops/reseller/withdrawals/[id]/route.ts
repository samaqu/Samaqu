import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, opsIdentity, unauthorized } from "@/lib/ops-auth";
import {
  notifyResellerWithdrawalPaid,
  notifyResellerWithdrawalRejected,
} from "@/lib/reseller/notify";

/**
 * Putuskan penarikan: "sudah ditransfer" (paid) atau tolak + alasan.
 * Memakai RPC tahap 1 `samaqu_reseller_putuskan_penarikan` — tolak
 * mengembalikan saldo yang ditahan ke ledger dalam transaksi yang sama.
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  const identity = await opsIdentity(req);
  const actor = identity?.email || "admin";

  const { id } = await context.params;
  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const action = String(body.action ?? "").trim();
  const reason = String(body.reason ?? "").trim();

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "Aksi tidak dikenal" }, { status: 400 });
  }
  if (action === "reject" && !reason) {
    return NextResponse.json({ error: "Alasan penolakan wajib diisi" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: withdrawal } = await supabase
    .from("reseller_withdrawals")
    .select("id, reseller_id, amount, transfer_amount, bank_name, bank_number, status")
    .eq("id", id)
    .maybeSingle();

  if (!withdrawal) return NextResponse.json({ error: "Penarikan tidak ditemukan" }, { status: 404 });
  if (withdrawal.status !== "pending") {
    return NextResponse.json({ error: "Penarikan sudah diproses sebelumnya" }, { status: 400 });
  }

  const { error } = await supabase.rpc("samaqu_reseller_putuskan_penarikan", {
    p_withdrawal_id: id,
    p_disetujui: action === "approve",
    p_dibuat_oleh: actor,
    p_alasan_tolak: action === "reject" ? reason : null,
  });

  if (error) {
    console.error("[OPS-RESELLER] Putuskan penarikan gagal:", error.message);
    return NextResponse.json({ error: "Gagal memproses penarikan" }, { status: 500 });
  }

  if (action === "approve") {
    await notifyResellerWithdrawalPaid(
      String(withdrawal.reseller_id),
      String(withdrawal.id),
      Number(withdrawal.amount) || 0,
      Number(withdrawal.transfer_amount) || 0,
      String(withdrawal.bank_name || ""),
      String(withdrawal.bank_number || "")
    );
  } else {
    await notifyResellerWithdrawalRejected(
      String(withdrawal.reseller_id),
      String(withdrawal.id),
      Number(withdrawal.amount) || 0,
      reason
    );
  }

  return NextResponse.json({ ok: true });
}
