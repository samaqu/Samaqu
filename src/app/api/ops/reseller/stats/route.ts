import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";
import { getResellerBalance } from "@/lib/reseller/saldo";

/**
 * Ringkasan untuk menu Reseller (kartu atas + badge sidebar):
 * reseller aktif, total saldo (titipan), pesanan reseller bulan ini (WIB),
 * dan jumlah antrean "perlu dicek".
 */
export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const supabase = getSupabaseAdmin();

  const nowWib = new Date(Date.now() + 7 * 3600 * 1000);
  const monthKey = nowWib.toISOString().slice(0, 7);
  const start = new Date(`${monthKey}-01T00:00:00+07:00`);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);

  const [resellers, orders, topups, payments, withdrawals] = await Promise.all([
    supabase.from("resellers").select("id, status"),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .not("reseller_id", "is", null)
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString()),
    supabase.from("reseller_topups").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("reseller_order_payments").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("reseller_withdrawals").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  if (resellers.error) {
    console.error("[OPS-RESELLER] Gagal membaca stats:", resellers.error.message);
    return NextResponse.json({ error: "Gagal memuat ringkasan" }, { status: 500 });
  }

  const list = resellers.data ?? [];
  const aktif = list.filter((r) => r.status === "active").length;

  // Total saldo = jumlah saldo tersedia semua reseller. Nilai `samaqu_reseller_saldo`
  // adalah SUM(reseller_ledger.amount), jadi satu query agregat di sini menghasilkan angka
  // yang sama tanpa memanggil RPC sekali per reseller (N+1).
  let totalSaldo = 0;
  const resellerIds = list.map((row) => String(row.id));
  if (resellerIds.length > 0) {
    const { data: ledgerRows, error: ledgerError } = await supabase
      .from("reseller_ledger")
      .select("amount")
      .in("reseller_id", resellerIds);
    if (!ledgerError) {
      totalSaldo = (ledgerRows || []).reduce((sum, row) => sum + (Number((row as { amount?: number }).amount) || 0), 0);
    } else {
      // Fallback aman: perilaku lama (RPC resmi) kalau kolom/tabel tidak bisa dibaca.
      const balances = await Promise.all(list.map((row) => getResellerBalance(String(row.id))));
      totalSaldo = balances.reduce((sum, balance) => sum + (balance?.saldo_tersedia ?? 0), 0);
    }
  }

  const perluDicek = (topups.count ?? 0) + (payments.count ?? 0) + (withdrawals.count ?? 0);

  return NextResponse.json({
    aktif,
    total_saldo: totalSaldo,
    pesanan_bulan_ini: orders.count ?? 0,
    perlu_dicek: perluDicek,
    bulan: monthKey,
  });
}
