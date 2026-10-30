import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, opsIdentity, unauthorized } from "@/lib/ops-auth";
import {
  notifyResellerTopupApproved,
  notifyResellerTopupRejected,
} from "@/lib/reseller/notify";
import { getResellerBalance } from "@/lib/reseller/saldo";

/**
 * Konfirmasi / tolak top up. Approve memakai RPC tahap 1
 * (`samaqu_reseller_konfirmasi_topup`) yang menulis status + ledger dalam
 * satu transaksi; tolak hanya mengubah status + alasan.
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
  const { data: topup } = await supabase
    .from("reseller_topups")
    .select("id, code, amount, reseller_id, status")
    .eq("id", id)
    .maybeSingle();

  if (!topup) return NextResponse.json({ error: "Top up tidak ditemukan" }, { status: 404 });
  if (topup.status !== "pending") {
    return NextResponse.json({ error: "Top up sudah diproses sebelumnya" }, { status: 400 });
  }

  const { error } = await supabase.rpc("samaqu_reseller_konfirmasi_topup", {
    p_topup_id: id,
    p_disetujui: action === "approve",
    p_dibuat_oleh: actor,
    p_alasan_tolak: action === "reject" ? reason : null,
  });

  if (error) {
    console.error("[OPS-RESELLER] Konfirmasi top up gagal:", error.message);
    return NextResponse.json({ error: "Gagal memproses top up" }, { status: 500 });
  }

  if (action === "approve") {
    const balance = await getResellerBalance(String(topup.reseller_id));
    await notifyResellerTopupApproved(
      String(topup.reseller_id),
      String(topup.id),
      Number(topup.amount) || 0,
      balance?.saldo_tersedia ?? 0
    );
  } else {
    await notifyResellerTopupRejected(
      String(topup.reseller_id),
      String(topup.id),
      Number(topup.amount) || 0,
      reason
    );
  }

  return NextResponse.json({ ok: true });
}
