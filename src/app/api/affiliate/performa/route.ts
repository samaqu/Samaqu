import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { affiliateSession, affiliateUnauthorized } from "@/lib/affiliate/auth";
import { syncCommissionsForAffiliate } from "@/lib/affiliate/commission";
import { getAffiliateSettings } from "@/lib/affiliate/settings";
import { loadAffiliateLinks, loadAffiliateOrders } from "@/lib/affiliate/queries";

/**
 * Data performa affiliate (grafik & tabel performa).
 * Semuanya dihitung dari data nyata: klik, pesanan, penjualan, komisi.
 */

const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

function dayKey(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildDays(from: Date, to: Date): { key: string; label: string }[] {
  const days: { key: string; label: string }[] = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  while (cursor <= to) {
    days.push({
      key: dayKey(cursor),
      label: `${cursor.getDate()} ${DAY_NAMES[cursor.getDay()]}`.trim(),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export async function GET(req: NextRequest) {
  const session = await affiliateSession(req);
  if (!session) return affiliateUnauthorized();

  const supabase = getSupabaseAdmin();
  const settings = await getAffiliateSettings(supabase);
  await syncCommissionsForAffiliate(supabase, session.affiliate.id, { settings });

  const days = Number(req.nextUrl.searchParams.get("days") || 30);
  const safeDays = [7, 30, 90].includes(days) ? days : 30;

  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (safeDays - 1));
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);

  const [{ data: clickRows }, orders, links] = await Promise.all([
    supabase
      .from("affiliate_clicks")
      .select("created_at, link_id")
      .eq("affiliate_id", session.affiliate.id)
      .gte("created_at", from.toISOString()),
    loadAffiliateOrders(supabase, session.affiliate.id),
    loadAffiliateLinks(supabase, session.affiliate.id),
  ]);

  const clicks = (clickRows || []) as { created_at: string; link_id: string | null }[];
  const linkMap = new Map(links.map((l) => [l.id, l]));

  // Rentang opsional untuk tabel pengelompokan (produk/tautan/kampanye/sumber).
  // Grafik tetap memakai jendela `days` (7/30/90) supaya series-nya utuh.
  const fromParam = req.nextUrl.searchParams.get("from");
  const toParam = req.nextUrl.searchParams.get("to");
  const rangeFrom = fromParam ? new Date(fromParam) : null;
  const rangeTo = toParam ? new Date(toParam) : null;
  const hasRange =
    rangeFrom !== null &&
    rangeTo !== null &&
    !Number.isNaN(rangeFrom.getTime()) &&
    !Number.isNaN(rangeTo.getTime());
  const inRange = (value: string) => {
    if (!hasRange) return true;
    const d = new Date(value);
    return !Number.isNaN(d.getTime()) && d >= rangeFrom! && d <= rangeTo!;
  };
  const rangeOrders = orders.filter((o) => inRange(o.created_at));
  const rangeClicks = clicks.filter((c) => inRange(c.created_at));

  const series = buildDays(from, to).map((day) => {
    const dayOrders = orders.filter((o) => dayKey(o.created_at) === day.key);
    const dayClicks = clicks.filter((c) => dayKey(c.created_at) === day.key);
    const sales = dayOrders
      .filter((o) => !["dibatalkan", "pending"].includes(o.status))
      .reduce((sum, o) => sum + Number(o.subtotal || 0), 0);
    const commission = dayOrders
      .filter((o) => o.commission && o.commission.status !== "ditolak")
      .reduce((sum, o) => sum + Number(o.commission?.amount || 0), 0);

    return {
      key: day.key,
      label: day.label,
      clicks: dayClicks.length,
      orders: dayOrders.length,
      sales,
      commission,
    };
  });

  // Pengelompokan: per produk / tautan / kampanye / sumber
  const group = (keyOf: (order: (typeof rangeOrders)[number]) => string | null) => {
    const map = new Map<string, { orders: number; sales: number; commission: number }>();
    for (const order of rangeOrders) {
      const key = keyOf(order);
      if (!key) continue;
      const current = map.get(key) || { orders: 0, sales: 0, commission: 0 };
      current.orders += 1;
      if (!["dibatalkan", "pending"].includes(order.status)) {
        current.sales += Number(order.subtotal || 0);
      }
      if (order.commission && order.commission.status !== "ditolak") {
        current.commission += Number(order.commission.amount || 0);
      }
      map.set(key, current);
    }
    return Array.from(map.entries()).map(([key, value]) => ({ key, ...value }));
  };

  const commissionLinkByOrder = new Map(
    orders.filter((o) => o.commission?.link_id).map((o) => [o.id, o.commission!.link_id as string]),
  );

  const byProduct = group((order) => {
    const link = commissionLinkByOrder.get(order.id);
    return link ? linkMap.get(link)?.product_name || null : null;
  });
  const byLink = group((order) => {
    const link = commissionLinkByOrder.get(order.id);
    return link ? linkMap.get(link)?.code || null : null;
  });
  const byCampaign = group((order) => {
    const link = commissionLinkByOrder.get(order.id);
    return link ? linkMap.get(link)?.campaign || null : null;
  });
  const bySource = group((order) => {
    const link = commissionLinkByOrder.get(order.id);
    return link ? linkMap.get(link)?.source || null : null;
  });

  // Klik per tautan
  const clicksByLink = new Map<string, number>();
  for (const click of rangeClicks) {
    if (!click.link_id) continue;
    clicksByLink.set(click.link_id, (clicksByLink.get(click.link_id) || 0) + 1);
  }

  const clicksByProduct = new Map<string, number>();
  for (const link of links) {
    if (!link.product_id || !link.product_name) continue;
    clicksByProduct.set(
      link.product_name,
      (clicksByProduct.get(link.product_name) || 0) + (clicksByLink.get(link.id) || 0),
    );
  }

  return NextResponse.json({
    days: safeDays,
    series,
    byProduct: byProduct.map((row) => ({ ...row, clicks: clicksByProduct.get(row.key) || 0 })),
    byLink: byLink.map((row) => ({
      ...row,
      clicks: links
        .filter((l) => l.code === row.key)
        .reduce((sum, l) => sum + (clicksByLink.get(l.id) || 0), 0),
    })),
    byCampaign,
    bySource,
    totals: {
      clicks: clicks.length,
      orders: orders.length,
      sales: orders
        .filter((o) => !["dibatalkan", "pending"].includes(o.status))
        .reduce((sum, o) => sum + Number(o.subtotal || 0), 0),
      commission: orders
        .filter((o) => o.commission && o.commission.status !== "ditolak")
        .reduce((sum, o) => sum + Number(o.commission?.amount || 0), 0),
    },
  });
}
