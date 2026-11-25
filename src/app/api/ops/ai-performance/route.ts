import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";
import { jakartaMonthBounds } from "@/lib/ops-followup";
import { SALE_STATUSES, orderRevenue } from "@/lib/transaksi";
import { getAiConversationMetrics, type EscalationRef } from "@/lib/ai-performance-metrics";

/**
 * AI Performance Center.
 *
 * Sumber angka (bukan mock):
 * - Percakapan & balasan: `wa_inbox` non-grup, non-skipped pada bulan WIB.
 * - Closing AI: `order_drafts` berstatus approved yang menghasilkan `orders` sah.
 * - Nominal: HARGA PRODUK saja (total setelah diskon, tanpa ongkir, `orderRevenue`) dari order
 *   hasil draft closing AI. Closing yang order-nya belum bisa ditautkan (bot laptop lama,
 *   backfill) memakai nominal bukti transfer di `wa_closings`; jumlahnya ada di `closingFallback`.
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

type ClosingStats = {
  count: number;
  nominal: number;
  source: "wa_closings" | "drafts";
  /** Jumlah closing yang nominalnya masih nominal bukti transfer (order belum bisa ditautkan). */
  fallback: number;
};

/**
 * Nominal HARGA PRODUK saja per closing bot, dihitung dari order hasil draft closing itu:
 * `wa_closings.inbox_id` -> `order_drafts.source_inbox_id` (approved) -> `orders.order_number`.
 * Hanya closing yang order-nya sah (SALE_STATUSES) yang masuk peta; sisanya dibiarkan memakai
 * nominal bukti transfer. Pemanggil menangkap error dan memakai peta kosong (perilaku lama).
 */
async function productNominalByInbox(
  admin: ReturnType<typeof getSupabaseAdmin>,
  inboxIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const unique = [...new Set(inboxIds.filter(Boolean))];
  if (unique.length === 0) return result;

  const orderNumberByInbox = new Map<string, string>();
  for (let i = 0; i < unique.length; i += 100) {
    const { data, error } = await admin
      .from("order_drafts")
      .select("source_inbox_id, approved_order_number")
      .eq("status", "approved")
      .in("source_inbox_id", unique.slice(i, i + 100));
    if (error) throw new Error(error.message);
    for (const row of data || []) {
      const inbox = String(row.source_inbox_id || "");
      const number = String(row.approved_order_number || "");
      if (inbox && number && !orderNumberByInbox.has(inbox)) orderNumberByInbox.set(inbox, number);
    }
  }

  const numbers = [...new Set(orderNumberByInbox.values())];
  const orderByNumber = new Map<string, { status: string; total: number; shipping_cost: number }>();
  for (let i = 0; i < numbers.length; i += 200) {
    const { data, error } = await admin
      .from("orders")
      .select("order_number, status, total, shipping_cost")
      .in("order_number", numbers.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const row of data || []) {
      orderByNumber.set(String(row.order_number), {
        status: String(row.status || "").toLowerCase(),
        total: Number(row.total) || 0,
        shipping_cost: Number(row.shipping_cost) || 0,
      });
    }
  }

  for (const [inbox, number] of orderNumberByInbox) {
    const order = orderByNumber.get(number);
    if (!order || !SALE_STATUSES.includes(order.status)) continue;
    result.set(inbox, orderRevenue(order));
  }
  return result;
}

async function academyClosings(
  admin: ReturnType<typeof getSupabaseAdmin>,
  startIso: string,
  endIso: string,
): Promise<ClosingStats | null> {
  const base = (process.env.ACADEMY_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.ACADEMY_SERVICE_ROLE_KEY || "";
  if (!base || !key) return null;

  const url = new URL(`${base}/rest/v1/wa_closings`);
  url.searchParams.set("select", "id,inbox_id,nominal,created_at,source");
  url.searchParams.set("created_at", `gte.${startIso}`);
  url.searchParams.append("created_at", `lt.${endIso}`);
  url.searchParams.set("order", "created_at.asc");
  url.searchParams.set("limit", "5000");

  const res = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Gagal membaca wa_closings (${res.status}).`);
  const rows = (await res.json().catch(() => [])) as {
    inbox_id?: string | null;
    nominal?: number | string | null;
  }[];
  const list = Array.isArray(rows) ? rows : [];

  // Harga produk saja dari order tertaut. Gagal membaca = peta kosong, semua closing memakai
  // nominal bukti transfer seperti sebelumnya (angka tidak pernah hilang karena error).
  const productByInbox = await productNominalByInbox(
    admin,
    list.map((row) => String(row.inbox_id || "")),
  ).catch((error) => {
    console.error("[AI-PERFORMANCE] Gagal menautkan closing ke order:", error instanceof Error ? error.message : error);
    return new Map<string, number>();
  });

  let nominal = 0;
  let fallback = 0;
  for (const row of list) {
    const product = productByInbox.get(String(row.inbox_id || ""));
    if (product !== undefined) {
      nominal += product;
    } else {
      nominal += Number(row.nominal) || 0;
      fallback += 1;
    }
  }
  return { count: list.length, nominal, source: "wa_closings", fallback };
}

/**
 * Total biaya AI CS (feature `wa`) pada periode, dalam USD.
 * Dicatat `wa-agent` ke `ai_usage_logs` memakai harga di `ai_settings.pricing`.
 */
async function aiUsageCost(startIso: string, endIso: string): Promise<number | null> {
  const base = (process.env.ACADEMY_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.ACADEMY_SERVICE_ROLE_KEY || "";
  if (!base || !key) return null;

  const url = new URL(`${base}/rest/v1/ai_usage_logs`);
  url.searchParams.set("select", "estimated_cost");
  url.searchParams.set("feature", "eq.wa");
  url.searchParams.set("created_at", `gte.${startIso}`);
  url.searchParams.append("created_at", `lt.${endIso}`);
  url.searchParams.set("limit", "50000");

  const res = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const rows = (await res.json().catch(() => [])) as { estimated_cost?: number | string | null }[];
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((sum, row) => sum + (Number(row.estimated_cost) || 0), 0);
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
      .select("order_number, status, total, shipping_cost")
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
  const [rows, drafts, closingStats, leadsResult, escalations, costUsd] = await Promise.all([
    inboxRows(admin, month.startIso, month.endIso),
    approvedDrafts(admin, month.startIso, month.endIso),
    academyClosings(admin, month.startIso, month.endIso).catch(() => null),
    // Leads memakai tanggal bisnis (`leads.tanggal`), sama seperti menu Leads —
    // bukan `created_at`, karena import/paste bisa memasukkan lead bertanggal bulan lalu.
    admin
      .from("leads")
      .select("kontak", { count: "exact" })
      .gte("tanggal", `${month.value}-01`)
      .lte("tanggal", `${month.value}-${String(month.daysInMonth).padStart(2, "0")}`)
      .limit(5000),
    escalationRows(admin, month.startIso, month.endIso),
    aiUsageCost(month.startIso, month.endIso).catch(() => null),
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
      nominal += orderRevenue(order);
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
    aiCostUsd: costUsd,
    handledRate: conversations > 0 ? Math.round((handled / conversations) * 1000) / 10 : 0,
    closingRate: conversations > 0 ? Math.round((closing / conversations) * 1000) / 10 : 0,
    closingSource,
    /** Closing yang nominalnya masih nominal bukti transfer (order belum bisa ditautkan). */
    closingFallback: closingStats?.fallback || 0,
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

    // Kurs USD → Rp bisa diubah lewat env tanpa deploy kode.
    const usdIdr = Number(process.env.USD_IDR_RATE) || 18108.5;
    const aiCostIdr = currentStats.aiCostUsd == null
      ? null
      : Math.round(currentStats.aiCostUsd * usdIdr);
    const costPerClosing =
      aiCostIdr != null && currentStats.closing > 0
        ? Math.round(aiCostIdr / currentStats.closing)
        : null;

    return NextResponse.json({
      period: { value: month.value, label: month.label },
      previousPeriod: { value: previous.value, label: previous.label },
      stats: {
        ...currentStats,
        aiCostIdr,
        costPerClosing,
        usdIdr,
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
