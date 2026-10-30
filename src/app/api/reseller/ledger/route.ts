import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { resellerSession, resellerUnauthorized } from "@/lib/reseller/auth";
import { enrichResellerLedger } from "@/lib/reseller/ledger-enrich";

/**
 * Riwayat mutasi saldo milik reseller sendiri.
 * Filter: `jenis` (tipe mutasi) dan `bulan` (YYYY-MM, WIB).
 */
export async function GET(req: NextRequest) {
  const session = await resellerSession(req);
  if (!session) return resellerUnauthorized();

  const url = new URL(req.url);
  const jenis = (url.searchParams.get("jenis") || "").trim();
  const bulan = (url.searchParams.get("bulan") || "").trim();
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("pageSize")) || 20));

  let query = getSupabaseAdmin()
    .from("reseller_ledger")
    .select("id, type, amount, balance_after, reference, note, created_by, created_at", { count: "exact" })
    .eq("reseller_id", session.reseller.id)
    .order("created_at", { ascending: false });

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
    console.error("[RESELLER-LEDGER] Gagal membaca mutasi:", error.message);
    return NextResponse.json({ error: "Gagal memuat mutasi saldo" }, { status: 500 });
  }

  const rows = data ?? [];
  const enriched = await enrichResellerLedger(rows);

  return NextResponse.json({ data: enriched, total: count ?? 0, page, pageSize });
}
