import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";
import { jakartaMonthBounds } from "@/lib/ops-followup";
import { SALE_STATUSES } from "@/lib/transaksi";
import { getAiConversationMetrics, type EscalationRef } from "@/lib/ai-performance-metrics";

/**
 * AI Performance Center.
 *
 * Sumber angka (bukan mock):
 * - Percakapan & balasan: `wa_inbox` non-grup, non-skipped pada bulan WIB.
 * - Closing AI: `order_drafts` berstatus approved yang menghasilkan `orders` sah.
 * - Nominal: `orders.total` dari order hasil draft AI tersebut.
 *
 * "Perlu bantuan admin" = nomor unik yang masuk `wa_escalations` (Pertanyaan AI)
 * atau pernah dibalas admin pada periode itu. "Chat ditangani AI" = total percakapan
 * unik dikurangi angka itu. "Leads dicatat AI" = lead periode itu yang nomornya ada
 * di percakapan WA periode itu. Semua rumusnya di `getAiConversationMetrics`.
 * "Closing" = draft AI yang disetujui admin dan order-nya masih sah (diproses/dikirim/selesai).
 * Draft yang ditolak atau order batal tidak dihitung.
 */

const PAGE = 1000;

function previousMonth(value: string): string {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function growth(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? null : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

async function inboxRows(
  admin: ReturnType<typeof getSupabaseAdmin>,
  startIso: string,
  endIso: string,
) {
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("wa_inbox")
      .select("sender, sender_name, message, reply_text, status, created_at")
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .eq("is_group", false)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const page = (data || []).filter((row) => row.status !== "skipped");
    rows.push(...page);
    if ((data || []).length < PAGE) break;
  }
  return rows;
}

/**
 * Nomor yang masuk "Pertanyaan AI" (handover) atau pernah dibalas admin pada periode.
 * Dua query terpisah karena nilai ISO tidak aman ditaruh mentah di filter `or`.
 */
async function escalationRows(
  admin: ReturnType<typeof getSupabaseAdmin>,
  startIso: string,
  endIso: string,
): Promise<EscalationRef[]> {
  const [created, replied] = await Promise.all([
    admin
      .from("wa_escalations")
      .select("sender")
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .limit(5000),
    admin
      .from("wa_escalations")
      .select("sender")
      .gte("replied_at", startIso)
      .lt("replied_at", endIso)
      .limit(5000),
  ]);
  if (created.error) throw new Error(created.error.message);
  if (replied.error) throw new Error(replied.error.message);
  return [...(created.data || []), ...(replied.data || [])];
}

type ClosingStats = { count: number; nominal: number; source: "wa_closings" | "drafts" };

async function academyClosings(startIso: string, endIso: string): Promise<ClosingStats | null> {
  const base = (process.env.ACADEMY_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.ACADEMY_SERVICE_ROLE_KEY || "";
  if (!base || !key) return null;

  const url = new URL(`${base}/rest/v1/wa_closings`);
  url.searchParams.set("select", "id,nominal,created_at,source");
  url.searchParams.set("created_at", `gte.${startIso}`);
  url.searchParams.append("created_at", `lt.${endIso}`);
  url.searchParams.set("order", "created_at.asc");
  url.searchParams.set("limit", "5000");

  const res = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Gagal membaca wa_closings (${res.status}).`);
  const rows = (await res.json().catch(() => [])) as { nominal?: number | string | null }[];
  return {
    count: Array.isArray(rows) ? rows.length : 0,
    nominal: Array.isArray(rows)
      ? rows.reduce((sum, row) => sum + (Number(row.nominal) || 0), 0)
      : 0,
    source: "wa_closings",
  };
}

async function approvedDrafts(
  admin: ReturnType<typeof getSupabaseAdmin>,
  startIso: string,
  endIso: string,
) {
  const { data, error } = await admin
    .from("order_drafts")
    .select("id, approved_order_number, payload, reviewed_at, created_at")
    .eq("status", "approved")
    .gte("reviewed_at", startIso)
    .lt("reviewed_at", endIso)
    .limit(PAGE);
  if (error) throw new Error(error.message);
  return data || [];
}

async function ordersByNumber(
  admin: ReturnType<typeof getSupabaseAdmin>,
  numbers: string[],
) {
  const found: any[] = [];
  for (let i = 0; i < numbers.length; i += 200) {
    const chunk = numbers.slice(i, i + 200);
    const { data, error } = await admin
      .from("orders")
      .select("order_number, status, total")
      .in("order_number", chunk);
    if (error) throw new Error(error.message);
    found.push(...(data || []));
  }
  return new Map(found.map((row) => [String(row.order_number), row]));
}

async function periodStats(
  admin: ReturnType<typeof getSupabaseAdmin>,
  month: ReturnType<typeof jakartaMonthBounds>,
) {
  const [rows, drafts, closingStats, leadsResult, escalations] = await Promise.all([
    inboxRows(admin, month.startIso, month.endIso),
    approvedDrafts(admin, month.startIso, month.endIso),
    academyClosings(month.startIso, month.endIso).catch(() => null),
    admin
      .from("leads")
      .select("kontak", { count: "exact" })
      .gte("created_at", month.startIso)
      .lt("created_at", month.endIso)
      .limit(5000),
    escalationRows(admin, month.startIso, month.endIso),
  ]);
  if (leadsResult.error) throw new Error(leadsResult.error.message);
  const leads = leadsResult.count || 0;

  // Satu rumus untuk semua card: total percakapan unik, AI vs perlu admin, dan
  // lead yang benar-benar berasal dari percakapan WA periode ini.
  const metrics = getAiConversationMetrics({
    senders: rows.map((row) => row.sender as string | null),
    messages: rows.length,
    escalations,
    leadContacts: (leadsResult.data || []).map((row) => row.kontak as string | null),
  });

  const handledSenders = new Set(
    rows
      .filter((row) => String(row.reply_text || "").trim())
      .map((row) => String(row.sender || ""))
      .filter(Boolean),
  );

  let closing = closingStats?.count || 0;
  let nominal = closingStats?.nominal || 0;
  let closingSource: ClosingStats["source"] = closingStats?.source || "drafts";

  // Fallback hanya kalau koneksi Academy belum dikonfigurasi. Kalau sudah ada,
  // angka wa_closings adalah sumber utama (termasuk closing backfill).
  if (!closingStats) {
    const orderNumbers = [...new Set(
      drafts.map((draft) => String(draft.approved_order_number || "")).filter(Boolean),
    )];
    const orders = await ordersByNumber(admin, orderNumbers);
    closing = 0;
    nominal = 0;
    for (const draft of drafts) {
      const order = orders.get(String(draft.approved_order_number || ""));
      if (!order || !SALE_STATUSES.includes(String(order.status || "").toLowerCase())) continue;
      closing += 1;
      nominal += Number(order.total) || 0;
    }
  }

  const conversations = metrics.conversations;
  const handled = handledSenders.size;
  return {
    conversations,
    messages: metrics.messages,
    handled,
    needsAdmin: metrics.needsAdmin,
    aiHandled: metrics.aiHandled,
    aiShare: metrics.aiShare,
    needsAdminShare: metrics.needsAdminShare,
    leads,
    leadsFromChat: metrics.leadsFromChat,
    leadsFromChatShare: metrics.leadsFromChatShare,
    closing,
    nominal,
    handledRate: conversations > 0 ? Math.round((handled / conversations) * 1000) / 10 : 0,
    closingRate: conversations > 0 ? Math.round((closing / conversations) * 1000) / 10 : 0,
    closingSource,
    activity: rows.slice(0, 8).map((row) => ({
      sender: String(row.sender || ""),
      sender_name: row.sender_name || null,
      message: String(row.message || ""),
      reply_text: row.reply_text || null,
      status: row.status || null,
      created_at: row.created_at,
    })),
  };
}

export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  try {
    const admin = getSupabaseAdmin();
    const month = jakartaMonthBounds(new URL(req.url).searchParams.get("month"));
    const previous = jakartaMonthBounds(previousMonth(month.value));
    const [currentStats, previousStats] = await Promise.all([
      periodStats(admin, month),
      periodStats(admin, previous),
    ]);

    return NextResponse.json({
      period: { value: month.value, label: month.label },
      previousPeriod: { value: previous.value, label: previous.label },
      stats: {
        ...currentStats,
        growth: {
          conversations: growth(currentStats.conversations, previousStats.conversations),
          handled: growth(currentStats.handled, previousStats.handled),
          leads: growth(currentStats.leads, previousStats.leads),
          closing: growth(currentStats.closing, previousStats.closing),
          nominal: growth(currentStats.nominal, previousStats.nominal),
        },
      },
      previous: previousStats,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal memuat performa AI.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
