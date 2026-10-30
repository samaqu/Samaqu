import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { resellerSession, resellerUnauthorized } from "@/lib/reseller/auth";

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
  const admin = getSupabaseAdmin();

  // Gabungkan STATUS TERKINI dari tabel sumber (penarikan & top up) — hanya
  // data tampilan; tidak ada mutasi/penulisan saldo baru di sini.
  const withdrawalIds = [
    ...new Set(
      rows
        .filter((row) => String(row.type).startsWith("withdrawal_") && row.reference)
        .map((row) => String(row.reference))
    ),
  ];
  const topupCodes = [
    ...new Set(rows.filter((row) => row.type === "topup" && row.reference).map((row) => String(row.reference))),
  ];

  const [withdrawals, topups] = await Promise.all([
    withdrawalIds.length
      ? admin
          .from("reseller_withdrawals")
          .select("id, status, bank_name, bank_number, admin_fee, transfer_amount, created_at, paid_at, reject_reason")
          .in("id", withdrawalIds)
      : Promise.resolve({ data: [] as never[] }),
    topupCodes.length
      ? admin.from("reseller_topups").select("code, status, reviewed_at").in("code", topupCodes)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const withdrawalById = new Map(
    (withdrawals.data ?? []).map((row) => [
      String(row.id),
      {
        status: String(row.status) as "pending" | "paid" | "rejected",
        bank_name: (row.bank_name as string | null) ?? null,
        bank_last4: String(row.bank_number || "").replace(/\D/g, "").slice(-4) || "????",
        transfer_amount: Number(row.transfer_amount) || 0,
        admin_fee: Number(row.admin_fee) || 0,
        created_at: row.created_at as string,
        paid_at: (row.paid_at as string | null) ?? null,
        reject_reason: (row.reject_reason as string | null) ?? null,
      },
    ])
  );
  const topupByCode = new Map(
    (topups.data ?? []).map((row) => [
      String(row.code),
      { status: String(row.status), reviewed_at: (row.reviewed_at as string | null) ?? null },
    ])
  );

  const enriched = rows.map((row) => ({
    ...row,
    withdrawal: row.reference ? withdrawalById.get(String(row.reference)) ?? null : null,
    topup: row.reference && row.type === "topup" ? topupByCode.get(String(row.reference)) ?? null : null,
  }));

  return NextResponse.json({ data: enriched, total: count ?? 0, page, pageSize });
}
