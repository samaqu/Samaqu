import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { resellerSession, resellerUnauthorized } from "@/lib/reseller/auth";
import { expireOverdueTopups, topupDeadlineIso } from "@/lib/reseller/topups";

/** Kode top up: TOP-YYYYMMDD-NNN (dibuat server, unik). */
function generateTopupCode(): string {
  const d = new Date();
  return `TOP-${d.toISOString().slice(0, 10).replace(/-/g, "")}-${String(Math.floor(Math.random() * 900) + 100)}`;
}

/** Daftar top up milik reseller sendiri. */
export async function GET(req: NextRequest) {
  const session = await resellerSession(req);
  if (!session) return resellerUnauthorized();

  // Tandai yang lewat batas waktu sebagai kedaluwarsa sebelum dibaca (tanpa mutasi saldo).
  await expireOverdueTopups(session.reseller.id);

  const { data, error } = await getSupabaseAdmin()
    .from("reseller_topups")
    .select("id, code, amount, proof_url, payment_method, status, reject_reason, reviewed_at, pay_deadline, created_at")
    .eq("reseller_id", session.reseller.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[RESELLER-TOPUP] Gagal membaca daftar:", error.message);
    return NextResponse.json({ error: "Gagal memuat daftar top up" }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}

/**
 * Ajukan top up — langkah 1 alur baru: buat data `menunggu_bayar` dengan batas
 * waktu 60 menit. Bukti diupload di halaman bayar (`/reseller/top-up/[kode]`).
 * Kiriman lama yang menyertakan `proof_url` langsung berstatus `pending`.
 */
export async function POST(req: NextRequest) {
  const session = await resellerSession(req);
  if (!session) return resellerUnauthorized();

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const amount = Math.round(Number(body.amount));
  const proofUrl = typeof body.proof_url === "string" ? body.proof_url.trim() : "";
  // Metode pembayaran yang dipilih reseller: transfer BSI (default) atau QRIS.
  const paymentMethod = body.payment_method === "qris" ? "qris" : "bsi";

  if (!Number.isFinite(amount) || amount < 1) {
    return NextResponse.json({ error: "Jumlah top up tidak valid" }, { status: 400 });
  }

  // Kiriman lama (dengan bukti) tetap berperilaku `pending`; alur baru tidak
  // membawa bukti dan dibuat `menunggu_bayar` dengan batas waktu.
  const hasProof = /^https?:\/\/\S+$/i.test(proofUrl);
  const supabase = getSupabaseAdmin();
  let lastError: string | null = null;

  // Percobaan ulang sekali kalau kode bentrok (unik).
  for (let attempt = 0; attempt < 2; attempt++) {
    const code = generateTopupCode();
    const { error } = await supabase.from("reseller_topups").insert({
      code,
      reseller_id: session.reseller.id,
      amount,
      proof_url: hasProof ? proofUrl : null,
      payment_method: paymentMethod,
      status: hasProof ? "pending" : "menunggu_bayar",
      pay_deadline: hasProof ? null : topupDeadlineIso(),
    });
    if (!error) {
      return NextResponse.json({ ok: true, code, status: hasProof ? "pending" : "menunggu_bayar" });
    }
    lastError = error.message;
    if (error.code !== "23505") break;
  }

  console.error("[RESELLER-TOPUP] Gagal menyimpan:", lastError);
  return NextResponse.json({ error: "Gagal menyimpan top up" }, { status: 500 });
}
