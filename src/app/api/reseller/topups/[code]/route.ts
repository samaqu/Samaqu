import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { resellerSession, resellerUnauthorized } from "@/lib/reseller/auth";
import { expireOverdueTopups, isPastDeadline } from "@/lib/reseller/topups";
import { validateProofUrl } from "@/lib/upload-url";

/**
 * Detail & aksi satu top up milik reseller (alur 3 langkah).
 *
 *   GET   → status terkini (yang lewat batas waktu otomatis jadi `kedaluwarsa`)
 *   PATCH { action: "submit_proof", proof_url, payment_method }
 *         → bukti masuk, status `pending` (antrean admin). Ditolak 410 kalau lewat batas waktu.
 *   PATCH { action: "cancel" } → `dibatalkan` (hanya saat menunggu_bayar).
 *
 * Tidak ada perubahan saldo di sini — saldo hanya berubah saat admin konfirmasi.
 */

const TOPUP_COLUMNS =
  "id, code, amount, proof_url, payment_method, status, reject_reason, reviewed_at, pay_deadline, created_at";

export async function GET(req: NextRequest, context: { params: Promise<{ code: string }> }) {
  const session = await resellerSession(req);
  if (!session) return resellerUnauthorized();

  const { code } = await context.params;
  const supabase = getSupabaseAdmin();

  // Kedaluwarsa diproses saat data dibaca (aman, tanpa mutasi saldo).
  await expireOverdueTopups(session.reseller.id);

  const { data, error } = await supabase
    .from("reseller_topups")
    .select(TOPUP_COLUMNS)
    .eq("reseller_id", session.reseller.id)
    .eq("code", code)
    .maybeSingle();

  if (error) {
    console.error("[RESELLER-TOPUP] Gagal membaca top up:", error.message);
    return NextResponse.json({ error: "Gagal memuat top up" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Top up tidak ditemukan" }, { status: 404 });

  return NextResponse.json({ data });
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ code: string }> }) {
  const session = await resellerSession(req);
  if (!session) return resellerUnauthorized();

  const { code } = await context.params;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const action = String(body.action || "").trim();

  const supabase = getSupabaseAdmin();
  const { data: topup, error: readError } = await supabase
    .from("reseller_topups")
    .select("id, status, pay_deadline")
    .eq("reseller_id", session.reseller.id)
    .eq("code", code)
    .maybeSingle();

  if (readError) {
    console.error("[RESELLER-TOPUP] Gagal membaca top up:", readError.message);
    return NextResponse.json({ error: "Gagal memproses top up" }, { status: 500 });
  }
  if (!topup) return NextResponse.json({ error: "Top up tidak ditemukan" }, { status: 404 });

  if (action === "cancel") {
    if (topup.status !== "menunggu_bayar") {
      return NextResponse.json({ error: "Top up ini tidak bisa dibatalkan" }, { status: 409 });
    }
    const { error } = await supabase
      .from("reseller_topups")
      .update({ status: "dibatalkan" })
      .eq("id", topup.id);
    if (error) {
      console.error("[RESELLER-TOPUP] Gagal membatalkan:", error.message);
      return NextResponse.json({ error: "Gagal membatalkan top up" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, status: "dibatalkan" });
  }

  if (action === "submit_proof") {
    if (topup.status === "pending") return NextResponse.json({ ok: true, status: "pending" });
    if (topup.status !== "menunggu_bayar") {
      return NextResponse.json({ error: "Top up ini sudah tidak bisa dibayar" }, { status: 409 });
    }

    if (isPastDeadline(topup.pay_deadline as string | null)) {
      await supabase.from("reseller_topups").update({ status: "kedaluwarsa" }).eq("id", topup.id);
      return NextResponse.json(
        { error: "Waktu pembayaran habis. Buat top up baru ya.", status: "kedaluwarsa" },
        { status: 410 }
      );
    }

    const checked = validateProofUrl(body.proof_url);
    if (!checked.ok) {
      return NextResponse.json(
        { error: checked.error === "URL bukti harus dari Cloudinary" ? "Upload bukti pembayaran dulu" : checked.error },
        { status: 400 }
      );
    }
    const proofUrl = checked.url;
    const paymentMethod = body.payment_method === "qris" ? "qris" : "bsi";

    const { error } = await supabase
      .from("reseller_topups")
      .update({ proof_url: proofUrl, payment_method: paymentMethod, status: "pending" })
      .eq("id", topup.id);
    if (error) {
      console.error("[RESELLER-TOPUP] Gagal menyimpan bukti:", error.message);
      return NextResponse.json({ error: "Gagal menyimpan bukti" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, status: "pending" });
  }

  return NextResponse.json({ error: "Aksi tidak dikenal" }, { status: 400 });
}
