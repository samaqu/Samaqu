import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, opsIdentity, unauthorized } from "@/lib/ops-auth";
import { normalizeWhatsappTarget } from "@/lib/fonnte";
import { getResellerBalance } from "@/lib/reseller/saldo";
import { normalizeBankValue } from "@/lib/reseller/banks";
import { enrichResellerLedger } from "@/lib/reseller/ledger-enrich";

/**
 * Detail satu reseller untuk drawer admin: profil + saldo + mutasi terakhir
 * (status terkini penarikan/top up/kekurangan, nomor rekening lengkap)
 * + total penarikan yang sudah ditransfer. Semua dibaca dengan service role.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const { id } = await context.params;
  const supabase = getSupabaseAdmin();

  const { data: reseller, error } = await supabase
    .from("resellers")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[OPS-RESELLER] Gagal membaca reseller:", error.message);
    return NextResponse.json({ error: "Gagal memuat reseller" }, { status: 500 });
  }
  if (!reseller) return NextResponse.json({ error: "Reseller tidak ditemukan" }, { status: 404 });

  const [balance, ledger, orders, paidWithdrawals] = await Promise.all([
    getResellerBalance(id),
    supabase
      .from("reseller_ledger")
      .select("id, type, amount, balance_after, reference, note, created_by, created_at")
      .eq("reseller_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("orders")
      .select("id, order_number, status, total, customer_name, created_at")
      .eq("reseller_id", id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("reseller_withdrawals")
      .select("amount")
      .eq("reseller_id", id)
      .eq("status", "paid"),
  ]);

  const enrichedLedger = await enrichResellerLedger(ledger.data ?? [], { revealAccount: true });
  const totalWithdrawn = (paidWithdrawals.data ?? []).reduce(
    (sum, row) => sum + (Number(row.amount) || 0),
    0
  );

  return NextResponse.json({
    reseller,
    saldo: balance ?? { saldo_tersedia: 0, saldo_ditahan: 0, saldo_total: 0 },
    total_withdrawn: totalWithdrawn,
    ledger: enrichedLedger,
    orders: orders.data ?? [],
  });
}

/**
 * Ubah data reseller / aktif-nonaktifkan. Setiap perubahan status mencatat
 * siapa & kapan. Menonaktifkan reseller otomatis mematikan sesi login-nya
 * (guard sesi hanya menerima status active).
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

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  const textFields = ["store_name", "owner_name", "city", "store_info", "social_media", "bank_number", "bank_holder"] as const;
  for (const field of textFields) {
    if (typeof body[field] === "string") patch[field] = String(body[field]).trim() || null;
  }
  if (typeof body.bank_name === "string") {
    patch.bank_name = normalizeBankValue(body.bank_name) || null;
  }
  if (typeof body.whatsapp === "string") {
    const target = normalizeWhatsappTarget(body.whatsapp);
    if (target.replace(/\D/g, "").length < 9) {
      return NextResponse.json({ error: "Nomor WhatsApp tidak valid." }, { status: 400 });
    }
    patch.whatsapp = target;
  }

  const status = typeof body.status === "string" ? body.status.trim() : "";
  if (status) {
    if (!["active", "suspended", "rejected"].includes(status)) {
      return NextResponse.json({ error: "Status tidak dikenal." }, { status: 400 });
    }
    patch.status = status;
    const now = new Date().toISOString();
    if (status === "active") {
      patch.approved_at = now;
      patch.approved_by = actor;
    } else {
      patch.rejected_at = now;
      patch.rejected_by = actor;
      patch.reject_reason = typeof body.reason === "string" ? body.reason.trim() || null : null;
    }
  }

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: "Tidak ada perubahan." }, { status: 400 });
  }

  const { error } = await getSupabaseAdmin().from("resellers").update(patch).eq("id", id);
  if (error) {
    console.error("[OPS-RESELLER] Gagal update:", error.message);
    return NextResponse.json({ error: "Gagal menyimpan perubahan" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
