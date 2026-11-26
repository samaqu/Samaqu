import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";
import { jakartaMonthBounds } from "@/lib/ops-followup";
import { SALE_STATUSES, orderRevenue } from "@/lib/transaksi";
import {
  MANUAL_MATCH_AFTER_MS,
  MANUAL_MATCH_BEFORE_MS,
  matchManualOrders,
  resolveClosing,
  type ClosingDraft,
  type ClosingOrder,
  type ClosingRow,
} from "@/lib/ai-closing-nominal";
import { getAiConversationMetrics, type EscalationRef } from "@/lib/ai-performance-metrics";
import {
  aggregateBestSellers,
  allocateOrderDiscounts,
  isValidSaleOrder,
  type BestSellerCatalogRow,
  type BestSellerItem,
} from "@/lib/best-sellers";
import { OPEN_ORDER_ADDON_TARGET_ID } from "@/lib/open-order-config";

/**
 * AI Performance Center.
 *
 * Sumber angka (bukan mock):
 * - Percakapan & balasan: `wa_inbox` non-grup, non-skipped pada bulan WIB.
 * - Closing AI: catatan closing bot (`wa_closings`) yang BISA DIBUKTIKAN lewat order/draft (aturan lengkap
 *   dan ujinya di `lib/ai-closing-nominal.ts`): draft approved + order sah, draft menunggu, atau order manual
 *   yang cocok (nomor HP + total persis). Order batal dan draft ditolak TIDAK dihitung. Closing tanpa order/draft
 *   tidak masuk angka utama dan ditampilkan terpisah (`closingUnlinked`).
 * - Nominal: HARGA PRODUK saja (total setelah diskon, tanpa ongkir, `orderRevenue`). Draft yang belum di-approve:
 *   nominal transfer dikurangi ongkir di draft.
 *
 * "Perlu bantuan admin" = nomor unik yang masuk `wa_escalations` (Pertanyaan AI)
 * atau pernah dibalas admin pada periode itu. "Chat ditangani AI" = total percakapan
 * unik dikurangi angka itu. "Leads dicatat AI" = lead periode itu yang nomornya ada
 * di percakapan WA periode itu. Semua rumusnya di `getAiConversationMetrics`.
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
  /** Closing yang masuk angka utama (terbukti lewat order/draft). */
  count: number;
  /** Nominal HARGA PRODUK saja dari closing yang dihitung. */
  nominal: number;
  source: "wa_closings" | "drafts";
  /** Closing tanpa order/draft yang bisa dibuktikan: TIDAK masuk angka utama, hanya ditampilkan. */
  unlinked: number;
  /** Jumlah nominal bukti transfer closing yang belum tertaut (sudah termasuk ongkir, hanya informasi). */
  unlinkedNominal: number;
  /** Closing yang order-nya batal atau draft-nya ditolak: tidak dihitung. */
  excluded: number;
  /** Nomor order dari closing yang dihitung (bahan daftar "Produk terjual lewat AI"). */
  orderNumbers: string[];
};

type ClosingContext = {
  draftByInbox: Map<string, ClosingDraft>;
  orderByNumber: Map<string, ClosingOrder>;
  manualByClosing: Map<string, ClosingOrder>;
};

/**
 * Kumpulkan bahan untuk `resolveClosing`: draft tiap closing (`wa_closings.inbox_id` ->
 * `order_drafts.source_inbox_id`), order hasil draft yang di-approve, dan order manual yang cocok
 * untuk closing yang drafnya ditolak/dihapus (nomor HP + total persis sama). Hanya membaca.
 */
async function loadClosingContext(
  admin: ReturnType<typeof getSupabaseAdmin>,
  rows: ClosingRow[],
): Promise<ClosingContext> {
  const draftByInbox = new Map<string, ClosingDraft>();
  const inboxIds = [...new Set(rows.map((row) => row.inboxId).filter(Boolean))];
  for (let i = 0; i < inboxIds.length; i += 100) {
    const { data, error } = await admin
      .from("order_drafts")
      .select("source_inbox_id, status, approved_order_number, payload")
      .in("source_inbox_id", inboxIds.slice(i, i + 100));
    if (error) throw new Error(error.message);
    for (const row of data || []) {
      const inbox = String(row.source_inbox_id || "");
      if (!inbox || draftByInbox.has(inbox)) continue;
      const payload = (row.payload || {}) as { shipping_cost?: unknown };
      draftByInbox.set(inbox, {
        status: String(row.status || ""),
        orderNumber: row.approved_order_number ? String(row.approved_order_number) : null,
        shippingCost: Math.max(0, Math.round(Number(payload.shipping_cost) || 0)),
      });
    }
  }

  const draftOrderNumbers = [
    ...new Set(
      [...draftByInbox.values()].map((draft) => draft.orderNumber).filter((n): n is string => Boolean(n)),
    ),
  ];
  const orderByNumber = new Map<string, ClosingOrder>();
  for (let i = 0; i < draftOrderNumbers.length; i += 200) {
    const { data, error } = await admin
      .from("orders")
      .select("order_number, status, total, shipping_cost")
      .in("order_number", draftOrderNumbers.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const row of data || []) {
      orderByNumber.set(String(row.order_number), {
        orderNumber: String(row.order_number),
        status: String(row.status || ""),
        total: Number(row.total) || 0,
        shippingCost: Number(row.shipping_cost) || 0,
      });
    }
  }

  // Closing yang drafnya ditolak atau tidak ada (mis. dihapus): coba buktikan lewat order manual.
  const needManual = rows.filter((row) => {
    const draft = draftByInbox.get(row.inboxId);
    return !draft || draft.status === "rejected";
  });
  let manualByClosing = new Map<string, ClosingOrder>();
  const times = needManual.map((row) => Date.parse(row.createdAt)).filter((t) => Number.isFinite(t));
  if (times.length > 0) {
    const from = new Date(Math.min(...times) - MANUAL_MATCH_BEFORE_MS).toISOString();
    const to = new Date(Math.max(...times) + MANUAL_MATCH_AFTER_MS).toISOString();
    const candidates: ClosingOrder[] = [];
    for (let start = 0; ; start += PAGE) {
      const { data, error } = await admin
        .from("orders")
        .select("order_number, customer_whatsapp, status, total, shipping_cost, created_at")
        .gte("created_at", from)
        .lte("created_at", to)
        .order("created_at", { ascending: true })
        .range(start, start + PAGE - 1);
      if (error) throw new Error(error.message);
      for (const row of data || []) {
        candidates.push({
          orderNumber: String(row.order_number),
          whatsapp: row.customer_whatsapp as string | null,
          status: String(row.status || ""),
          total: Number(row.total) || 0,
          shippingCost: Number(row.shipping_cost) || 0,
          createdAt: String(row.created_at || ""),
        });
      }
      if (!data || data.length < PAGE) break;
    }
    manualByClosing = matchManualOrders(needManual, candidates, new Set(draftOrderNumbers));
  }

  return { draftByInbox, orderByNumber, manualByClosing };
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
  url.searchParams.set("select", "id,inbox_id,sender,nominal,created_at,source");
  url.searchParams.set("created_at", `gte.${startIso}`);
  url.searchParams.append("created_at", `lt.${endIso}`);
  url.searchParams.set("order", "created_at.asc");
  url.searchParams.set("limit", "5000");

  const res = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Gagal membaca wa_closings (${res.status}).`);
  const raw = (await res.json().catch(() => [])) as {
    id?: string | null;
    inbox_id?: string | null;
    sender?: string | null;
    nominal?: number | string | null;
    created_at?: string | null;
  }[];
  const list: ClosingRow[] = (Array.isArray(raw) ? raw : []).map((row) => ({
    id: String(row.id || ""),
    inboxId: String(row.inbox_id || ""),
    sender: String(row.sender || ""),
    nominal: Number(row.nominal) || 0,
    createdAt: String(row.created_at || ""),
  }));

  let context: ClosingContext | null = null;
  try {
    context = await loadClosingContext(admin, list);
  } catch (error) {
    console.error("[AI-PERFORMANCE] Gagal menautkan closing ke order:", error instanceof Error ? error.message : error);
  }
  if (!context) {
    // Gagal menautkan: jangan menghilangkan angka. Pakai nominal bukti transfer apa adanya (perilaku lama).
    return {
      count: list.length,
      nominal: list.reduce((sum, row) => sum + Math.max(0, row.nominal), 0),
      source: "wa_closings",
      unlinked: 0,
      unlinkedNominal: 0,
      excluded: 0,
      orderNumbers: [],
    };
  }

  const orderNumbers: string[] = [];
  let count = 0;
  let nominal = 0;
  let unlinked = 0;
  let unlinkedNominal = 0;
  let excluded = 0;
  for (const row of list) {
    const draft = context.draftByInbox.get(row.inboxId) || null;
    const order = draft?.orderNumber ? context.orderByNumber.get(draft.orderNumber) || null : null;
    const manual = context.manualByClosing.get(row.id) || null;
    const result = resolveClosing(row, draft, order, manual);
    if (result.counted) {
      count += 1;
      nominal += result.nominal;
      // Draft yang masih menunggu belum punya order, jadi belum ada produk yang bisa dihitung.
      const orderNumber =
        result.kind === "draft_menunggu"
          ? null
          : String(draft?.status || "").toLowerCase() === "approved"
            ? order?.orderNumber
            : manual?.orderNumber;
      if (orderNumber) orderNumbers.push(orderNumber);
    } else if (result.kind === "belum_tertaut") {
      unlinked += 1;
      unlinkedNominal += Math.max(0, Math.round(row.nominal));
    } else {
      excluded += 1;
    }
  }
  return { count, nominal, source: "wa_closings", unlinked, unlinkedNominal, excluded, orderNumbers };
}

/**
 * Produk yang terjual lewat AI: barang di order dari closing bot yang dihitung (order sah saja).
 * Pakai agregator yang sama dengan Produk Terlaris (semua series satu baris; cover & layanan tidak
 * ikut peringkat), omzet sudah dipotong porsi diskon pesanan. Hanya membaca.
 */
async function productsSold(admin: ReturnType<typeof getSupabaseAdmin>, orderNumbers: string[]) {
  const numbers = [...new Set(orderNumbers)];
  const CHUNK = 100;

  const orderIds: string[] = [];
  const discountByOrder = new Map<string, number>();
  for (let i = 0; i < numbers.length; i += CHUNK) {
    const { data, error } = await admin
      .from("orders")
      .select("id, status, discount")
      .in("order_number", numbers.slice(i, i + CHUNK));
    if (error) throw new Error(error.message);
    for (const row of data || []) {
      if (!isValidSaleOrder(row.status)) continue;
      orderIds.push(String(row.id));
      discountByOrder.set(String(row.id), Number(row.discount) || 0);
    }
  }

  const items: BestSellerItem[] = [];
  for (let i = 0; i < orderIds.length; i += CHUNK) {
    const { data, error } = await admin
      .from("order_items")
      .select("order_id, product_id, product_name, color, size, kain, series, quantity, price, customer_price")
      .in("order_id", orderIds.slice(i, i + CHUNK));
    if (error) throw new Error(error.message);
    items.push(...((data || []) as BestSellerItem[]));
  }
  allocateOrderDiscounts(items, discountByOrder);

  const productIds = [
    ...new Set([...items.map((item) => String(item.product_id || "")), OPEN_ORDER_ADDON_TARGET_ID].filter(Boolean)),
  ];
  const catalog: BestSellerCatalogRow[] = [];
  for (let i = 0; i < productIds.length; i += CHUNK) {
    const { data, error } = await admin
      .from("products")
      .select("id, name, category, series, kain, jenis_kain(name)")
      .in("id", productIds.slice(i, i + CHUNK));
    if (error) throw new Error(error.message);
    catalog.push(...((data || []) as unknown as BestSellerCatalogRow[]));
  }

  const { rows, totals } = aggregateBestSellers(items, catalog).product;
  return {
    orders: orderIds.length,
    units: totals.units,
    revenue: totals.revenue,
    products: totals.products,
    rows: rows.slice(0, 8).map((row) => ({
      name: row.name,
      subname: row.subname,
      units: row.units,
      revenue: row.revenue,
    })),
  };
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
  withProducts = false,
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
  let closingOrderNumbers: string[] = closingStats?.orderNumbers || [];

  // Fallback hanya kalau koneksi Academy belum dikonfigurasi. Kalau sudah ada,
  // angka wa_closings adalah sumber utama (termasuk closing backfill).
  if (!closingStats) {
    const orderNumbers = [...new Set(
      drafts.map((draft) => String(draft.approved_order_number || "")).filter(Boolean),
    )];
    const orders = await ordersByNumber(admin, orderNumbers);
    closing = 0;
    nominal = 0;
    closingOrderNumbers = [];
    for (const draft of drafts) {
      const order = orders.get(String(draft.approved_order_number || ""));
      if (!order || !SALE_STATUSES.includes(String(order.status || "").toLowerCase())) continue;
      closing += 1;
      nominal += orderRevenue(order);
      closingOrderNumbers.push(String(draft.approved_order_number));
    }
  }

  // Daftar produk hanya untuk bulan yang dipilih (bulan pembanding tidak perlu). Gagal = daftar kosong, angka lain tetap tampil.
  const produkTerjual = withProducts
    ? await productsSold(admin, closingOrderNumbers).catch((error) => {
        console.error("[AI-PERFORMANCE] Gagal menghitung produk terjual:", error instanceof Error ? error.message : error);
        return null;
      })
    : null;

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
    /** Closing tanpa order/draft yang bisa dibuktikan: tidak masuk angka utama, hanya ditampilkan. */
    closingUnlinked: closingStats?.unlinked || 0,
    /** Nominal bukti transfer closing yang belum tertaut (termasuk ongkir, hanya informasi). */
    nominalUnlinked: closingStats?.unlinkedNominal || 0,
    /** Closing yang order-nya batal atau draft-nya ditolak: tidak dihitung. */
    closingExcluded: closingStats?.excluded || 0,
    /** Produk dari order closing bot yang dihitung (hanya bulan terpilih); null = tidak dimuat/gagal. */
    produkTerjual,
  };
}

export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  try {
    const admin = getSupabaseAdmin();
    const month = jakartaMonthBounds(new URL(req.url).searchParams.get("month"));
    const previous = jakartaMonthBounds(previousMonth(month.value));
    const [currentStats, previousStats] = await Promise.all([
      periodStats(admin, month, true),
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
