import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";

/**
 * GET /api/ops/stock-anomaly — daftar anomali stok untuk admin.
 *
 * Tabel `stock_anomaly_log` hanya bisa dibaca service_role, jadi daftar ini dibaca
 * lewat API server (bukan langsung dari browser).
 *
 * Query: `?limit=` (default 100, maks 500), `?reason=` (filter), `?days=` (default 30).
 */
export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const admin = getSupabaseAdmin();
  const sp = new URL(req.url).searchParams;

  const limit = Math.min(Math.max(parseInt(sp.get("limit") || "100", 10) || 100, 1), 500);
  const days = Math.min(Math.max(parseInt(sp.get("days") || "30", 10) || 30, 1), 365);
  const reason = String(sp.get("reason") || "").trim();

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  let query = admin
    .from("stock_anomaly_log")
    .select("id, product_id, color, size, qty, reason, order_id, source, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (reason && reason !== "all") query = query.eq("reason", reason);

  const { data, error } = await query;
  if (error) {
    console.error("[API] stock-anomaly:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];

  // Nama produk diambil terpisah supaya tidak bergantung pada relasi embed.
  const ids = [...new Set(rows.map((r) => r.product_id).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data: products } = await admin.from("products").select("id, name").in("id", ids);
    for (const p of products ?? []) names.set(String(p.id), String(p.name));
  }

  const items = rows.map((row) => ({
    ...row,
    product_name: row.product_id ? names.get(String(row.product_id)) ?? null : null,
  }));

  // Ringkasan per alasan, supaya admin langsung lihat yang paling sering.
  const summaryMap = new Map<string, number>();
  for (const row of rows) {
    const key = String(row.reason || "unknown");
    summaryMap.set(key, (summaryMap.get(key) || 0) + 1);
  }
  const summary = [...summaryMap.entries()]
    .map(([reasonKey, count]) => ({ reason: reasonKey, count }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({ items, summary, total: items.length, days });
}
