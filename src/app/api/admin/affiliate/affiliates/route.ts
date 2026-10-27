import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";
import { syncCommissionStatus } from "@/lib/affiliate/commission";
import { getAffiliateSettings } from "@/lib/affiliate/settings";

/**
 * Admin → Affiliate → Data Affiliate.
 *
 * Daftar affiliate + status pendaftaran/akun, kode referral, dan performa
 * (pesanan, omzet, komisi). Semua angka dihitung dari ledger.
 */

export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const supabase = getSupabaseAdmin();
  const settings = await getAffiliateSettings(supabase);

  const { data: affiliateRows } = await supabase
    .from("affiliates")
    .select("*")
    .order("created_at", { ascending: false });

  const affiliates = (affiliateRows || []) as {
    id: string;
    affiliate_code: string;
    full_name: string;
    display_name: string | null;
    email: string;
    phone: string | null;
    status: string;
    reject_reason: string | null;
    approved_at: string | null;
    created_at: string;
    primary_channel: string | null;
    channel_handle: string | null;
    content_description: string | null;
  }[];

  if (affiliates.length === 0) {
    return NextResponse.json({ affiliates: [], totals: emptyTotals() });
  }

  const ids = affiliates.map((a) => a.id);

  const { data: commissionRows } = await supabase
    .from("affiliate_commissions")
    .select("affiliate_id, status, amount, paid_amount")
    .in("affiliate_id", ids);

  const { data: orderRows } = await supabase
    .from("orders")
    .select("affiliate_id, status, subtotal")
    .in("affiliate_id", ids);

  const { data: linkRows } = await supabase
    .from("affiliate_links")
    .select("affiliate_id, id")
    .in("affiliate_id", ids);

  const { data: clickRows } = await supabase
    .from("affiliate_clicks")
    .select("affiliate_id")
    .in("affiliate_id", ids);

  const commissionMap = new Map<string, { pending: number; approved: number; paid: number; rejected: number; total: number }>();
  for (const c of (commissionRows || []) as { affiliate_id: string; status: string; amount: number; paid_amount: number }[]) {
    const acc = commissionMap.get(c.affiliate_id) || { pending: 0, approved: 0, paid: 0, rejected: 0, total: 0 };
    const amount = Number(c.amount || 0);
    acc.total += amount;
    if (c.status === "menunggu") acc.pending += amount;
    else if (c.status === "disetujui") acc.approved += amount - Number(c.paid_amount || 0);
    else if (c.status === "dibayarkan") acc.paid += Number(c.paid_amount || 0);
    else if (c.status === "ditolak") acc.rejected += amount;
    commissionMap.set(c.affiliate_id, acc);
  }

  const orderMap = new Map<string, { orders: number; sales: number; completed: number }>();
  for (const o of (orderRows || []) as { affiliate_id: string; status: string; subtotal: number }[]) {
    const acc = orderMap.get(o.affiliate_id) || { orders: 0, sales: 0, completed: 0 };
    acc.orders += 1;
    if (o.status === "selesai") acc.completed += 1;
    if (!["dibatalkan", "pending"].includes(o.status)) acc.sales += Number(o.subtotal || 0);
    orderMap.set(o.affiliate_id, acc);
  }

  const linkMap = new Map<string, number>();
  for (const l of (linkRows || []) as { affiliate_id: string; id: string }[]) {
    linkMap.set(l.affiliate_id, (linkMap.get(l.affiliate_id) || 0) + 1);
  }

  const clickMap = new Map<string, number>();
  for (const c of (clickRows || []) as { affiliate_id: string }[]) {
    clickMap.set(c.affiliate_id, (clickMap.get(c.affiliate_id) || 0) + 1);
  }

  const result = affiliates.map((a) => ({
    id: a.id,
    affiliateCode: a.affiliate_code,
    fullName: a.full_name,
    displayName: a.display_name,
    email: a.email,
    phone: a.phone,
    status: a.status,
    rejectReason: a.reject_reason,
    primaryChannel: a.primary_channel,
    channelHandle: a.channel_handle,
    contentDescription: a.content_description,
    approvedAt: a.approved_at,
    createdAt: a.created_at,
    links: linkMap.get(a.id) || 0,
    clicks: clickMap.get(a.id) || 0,
    orders: orderMap.get(a.id)?.orders || 0,
    completedOrders: orderMap.get(a.id)?.completed || 0,
    sales: orderMap.get(a.id)?.sales || 0,
    commission: commissionMap.get(a.id) || { pending: 0, approved: 0, paid: 0, rejected: 0, total: 0 },
  }));

  return NextResponse.json({ affiliates: result, totals: totalsOf(result), settings: settingsSummary(settings) });
}

function emptyTotals() {
  return { affiliates: 0, active: 0, pending: 0, clicks: 0, orders: 0, sales: 0, commission: 0, paid: 0 };
}

function totalsOf(rows: {
  status: string;
  clicks: number;
  orders: number;
  sales: number;
  commission: { total: number; paid: number };
}[]) {
  return {
    affiliates: rows.length,
    active: rows.filter((r) => r.status === "aktif").length,
    pending: rows.filter((r) => r.status === "menunggu").length,
    clicks: rows.reduce((s, r) => s + r.clicks, 0),
    orders: rows.reduce((s, r) => s + r.orders, 0),
    sales: rows.reduce((s, r) => s + r.sales, 0),
    commission: rows.reduce((s, r) => s + r.commission.total, 0),
    paid: rows.reduce((s, r) => s + r.commission.paid, 0),
  };
}

function settingsSummary(settings: {
  enabled: boolean;
  commission_mode: string;
  commission_percent: number;
  fixed_commission: number | null;
  min_withdrawal: number;
  validation_days: number;
}) {
  return {
    enabled: settings.enabled,
    commission_mode: settings.commission_mode,
    commission_percent: settings.commission_percent,
    fixed_commission: settings.fixed_commission,
    min_withdrawal: settings.min_withdrawal,
    validation_days: settings.validation_days,
  };
}

/**
 * Ubah status affiliate (setujui / tolak / nonaktifkan / aktifkan lagi).
 * Setiap perubahan dicatat di `affiliate_activity_log`.
 */
export async function PATCH(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  const action = String(body.action || "").trim();
  const reason = String(body.reason || "").trim();

  if (!id) return NextResponse.json({ error: "ID affiliate wajib diisi." }, { status: 400 });

  const allowed = ["approve", "reject", "activate", "deactivate"];
  if (!allowed.includes(action)) {
    return NextResponse.json({ error: "Aksi tidak dikenali." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: affiliate } = await supabase
    .from("affiliates")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!affiliate) {
    return NextResponse.json({ error: "Affiliate tidak ditemukan." }, { status: 404 });
  }

  const current = (affiliate as { status: string }).status;

  let nextStatus: string;
  let rejectReason: string | null = (affiliate as { reject_reason: string | null }).reject_reason;
  let approvedAt: string | null = (affiliate as { approved_at: string | null }).approved_at;

  if (action === "approve") {
    nextStatus = "aktif";
    rejectReason = null;
    approvedAt = new Date().toISOString();
  } else if (action === "reject") {
    if (!reason) {
      return NextResponse.json({ error: "Alasan penolakan wajib diisi." }, { status: 400 });
    }
    nextStatus = "ditolak";
    rejectReason = reason;
  } else if (action === "activate") {
    nextStatus = "aktif";
    rejectReason = null;
    if (!approvedAt) approvedAt = new Date().toISOString();
  } else {
    nextStatus = "nonaktif";
  }

  const { data, error } = await supabase
    .from("affiliates")
    .update({
      status: nextStatus,
      reject_reason: rejectReason,
      approved_at: approvedAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    console.error("[affiliate-admin] Gagal ubah status affiliate:", error.message);
    return NextResponse.json({ error: "Gagal menyimpan perubahan." }, { status: 500 });
  }

  await supabase.from("affiliate_activity_log").insert({
    affiliate_id: id,
    actor_type: "admin",
    action: `status_${action}`,
    from_status: current,
    to_status: nextStatus,
    note: reason || null,
  });

  // Kalau status affiliate berubah, komisi yang menunggu ikut diselaraskan
  // (mis. affiliate dinonaktifkan → komisi ditolak).
  const { data: commissions } = await supabase
    .from("affiliate_commissions")
    .select("order_id")
    .eq("affiliate_id", id)
    .neq("status", "dibayarkan");

  for (const c of (commissions || []) as { order_id: string }[]) {
    await syncCommissionStatus(supabase, c.order_id, { actor: "admin" });
  }

  return NextResponse.json({ affiliate: data });
}
