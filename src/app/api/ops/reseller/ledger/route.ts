import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, opsIdentity, unauthorized } from "@/lib/ops-auth";

/**
 * Mutasi saldo SEMUA reseller (filter reseller/jenis/bulan) + koreksi
 * manual (adjustment) yang WAJIB memakai catatan. Adjustment memakai RPC
 * `samaqu_reseller_adjust` supaya `balance_after` dihitung atomik.
 */
export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const url = new URL(req.url);
  const resellerId = (url.searchParams.get("reseller_id") || "").trim();
  const jenis = (url.searchParams.get("jenis") || "").trim();
  const bulan = (url.searchParams.get("bulan") || "").trim();
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize")) || 30));

  let query = getSupabaseAdmin()
    .from("reseller_ledger")
    .select("id, reseller_id, type, amount, balance_after, reference, note, created_by, created_at, resellers(store_name, owner_name)", { count: "exact" })
    .order("created_at", { ascending: false });

  if (resellerId) query = query.eq("reseller_id", resellerId);
  if (jenis) query = query.eq("type", jenis);
  if (/^\d{4}-\d{2}$/.test(bulan)) {
    const start = new Date(`${bulan}-01T00:00:00+07:00`);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    query = query.gte("created_at", start.toISOString()).lt("created_at", end.toISOString());
  }

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);

  if (error) {
    console.error("[OPS-RESELLER] Gagal membaca mutasi:", error.message);
    return NextResponse.json({ error: "Gagal memuat mutasi saldo" }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [], total: count ?? 0, page, pageSize });
}

/** Koreksi saldo manual — catatan wajib, pelaku & waktu tercatat. */
export async function POST(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  const identity = await opsIdentity(req);
  const actor = identity?.email || "admin";

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const resellerId = String(body.reseller_id ?? "").trim();
  const amount = Math.round(Number(body.amount));
  const note = String(body.note ?? "").trim();

  if (!resellerId) return NextResponse.json({ error: "Reseller wajib dipilih" }, { status: 400 });
  if (!Number.isFinite(amount) || amount === 0) {
    return NextResponse.json({ error: "Jumlah koreksi tidak boleh 0" }, { status: 400 });
  }
  if (!note) return NextResponse.json({ error: "Catatan koreksi wajib diisi" }, { status: 400 });

  const { data, error } = await getSupabaseAdmin().rpc("samaqu_reseller_adjust", {
    p_reseller_id: resellerId,
    p_jumlah: amount,
    p_catatan: note,
    p_dibuat_oleh: actor,
  });

  if (error) {
    console.error("[OPS-RESELLER] Adjustment gagal:", error.message);
    return NextResponse.json({ error: "Gagal menyimpan koreksi saldo" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...(data as Record<string, unknown>) });
}
