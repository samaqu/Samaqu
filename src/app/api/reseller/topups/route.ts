import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { resellerSession, resellerUnauthorized } from "@/lib/reseller/auth";

/** Kode top up: TOP-YYYYMMDD-NNN (dibuat server, unik). */
function generateTopupCode(): string {
  const d = new Date();
  return `TOP-${d.toISOString().slice(0, 10).replace(/-/g, "")}-${String(Math.floor(Math.random() * 900) + 100)}`;
}

/** Daftar top up milik reseller sendiri. */
export async function GET(req: NextRequest) {
  const session = await resellerSession(req);
  if (!session) return resellerUnauthorized();

  const { data, error } = await getSupabaseAdmin()
    .from("reseller_topups")
    .select("id, code, amount, proof_url, status, reject_reason, reviewed_at, created_at")
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
 * Ajukan top up: jumlah + URL bukti transfer. Saldo baru bertambah setelah
 * admin mengonfirmasi (RPC `samaqu_reseller_konfirmasi_topup`).
 */
export async function POST(req: NextRequest) {
  const session = await resellerSession(req);
  if (!session) return resellerUnauthorized();

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const amount = Math.round(Number(body.amount));
  const proofUrl = typeof body.proof_url === "string" ? body.proof_url.trim() : "";

  if (!Number.isFinite(amount) || amount < 1) {
    return NextResponse.json({ error: "Jumlah top up tidak valid" }, { status: 400 });
  }
  if (!/^https?:\/\/\S+$/i.test(proofUrl)) {
    return NextResponse.json({ error: "Bukti transfer wajib diunggah" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  let lastError: string | null = null;

  // Percobaan ulang sekali kalau kode bentrok (unik).
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await supabase.from("reseller_topups").insert({
      code: generateTopupCode(),
      reseller_id: session.reseller.id,
      amount,
      proof_url: proofUrl,
      status: "pending",
    });
    if (!error) {
      return NextResponse.json({ ok: true });
    }
    lastError = error.message;
    if (error.code !== "23505") break;
  }

  console.error("[RESELLER-TOPUP] Gagal menyimpan:", lastError);
  return NextResponse.json({ error: "Gagal menyimpan top up" }, { status: 500 });
}
