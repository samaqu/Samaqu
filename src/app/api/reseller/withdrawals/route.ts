import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { resellerSession, resellerUnauthorized } from "@/lib/reseller/auth";
import { isBsiBank } from "@/lib/reseller/banks";

/** Daftar penarikan milik reseller sendiri. */
export async function GET(req: NextRequest) {
  const session = await resellerSession(req);
  if (!session) return resellerUnauthorized();

  const { data, error } = await getSupabaseAdmin()
    .from("reseller_withdrawals")
    .select("id, amount, bank_name, bank_number, is_bsi, admin_fee, transfer_amount, status, reject_reason, reviewed_at, paid_at, created_at")
    .eq("reseller_id", session.reseller.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[RESELLER-WD] Gagal membaca daftar:", error.message);
    return NextResponse.json({ error: "Gagal memuat daftar penarikan" }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}

/**
 * Ajukan penarikan saldo. Rekening diambil dari profil (bukan payload),
 * biaya admin dihitung RPC dari pengaturan (gratis kalau BSI). Saldo
 * langsung ditahan saat pengajuan; ditolak admin → saldo kembali.
 */
export async function POST(req: NextRequest) {
  const session = await resellerSession(req);
  if (!session) return resellerUnauthorized();

  const { reseller } = session;
  if (!reseller.bank_name || !reseller.bank_number || !reseller.bank_holder) {
    return NextResponse.json(
      { error: "Isi rekening bank di profil sebelum mengajukan penarikan." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const amount = Math.round(Number(body.amount));
  if (!Number.isFinite(amount) || amount < 1) {
    return NextResponse.json({ error: "Jumlah penarikan tidak valid" }, { status: 400 });
  }

  const { data, error } = await getSupabaseAdmin().rpc("samaqu_reseller_ajukan_penarikan", {
    p_reseller_id: reseller.id,
    p_jumlah: amount,
    p_bank: reseller.bank_name,
    p_nomor_rekening: reseller.bank_number,
    p_nama_rekening: reseller.bank_holder,
    p_is_bsi: isBsiBank(reseller.bank_name),
    p_dibuat_oleh: "reseller",
  });

  if (error) {
    const message = error.message || "";
    if (message.includes("Saldo reseller tidak cukup")) {
      return NextResponse.json({ error: "Saldo tidak cukup untuk penarikan ini." }, { status: 400 });
    }
    console.error("[RESELLER-WD] RPC gagal:", message);
    return NextResponse.json({ error: "Gagal mengajukan penarikan" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...(data as Record<string, unknown>) });
}
