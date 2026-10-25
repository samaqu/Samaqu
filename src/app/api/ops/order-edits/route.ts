import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";

/**
 * Riwayat edit item transaksi — read-only, dari audit `order_item_edits`.
 * Dipakai tab "Riwayat Edit" di menu Produk. Tidak mengubah stok/laporan.
 */
export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const sp = new URL(req.url).searchParams;
  const limitRaw = Number(sp.get("limit") || 300);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 1000) : 300;
  const from = String(sp.get("from") || "").trim();
  const to = String(sp.get("to") || "").trim();

  const admin = getSupabaseAdmin();
  let query = admin
    .from("order_item_edits")
    .select("id, order_id, actor, edited_at, had_awb, note, before_items, after_items, before_totals, after_totals")
    .order("edited_at", { ascending: false })
    .limit(limit);
  if (from) query = query.gte("edited_at", `${from}T00:00:00+07:00`);
  if (to) query = query.lte("edited_at", `${to}T23:59:59+07:00`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data || [];
  const orderIds = [...new Set(rows.map((row: any) => String(row.order_id)).filter(Boolean))];
  const { data: orders } = orderIds.length
    ? await admin
        .from("orders")
        .select("id, order_number, customer_name, customer_whatsapp, status, awb_no")
        .in("id", orderIds)
    : { data: [] as any[] };
  const orderById = new Map((orders || []).map((order: any) => [String(order.id), order]));

  return NextResponse.json({
    items: rows.map((row: any) => {
      const order = orderById.get(String(row.order_id)) || null;
      return {
        id: row.id,
        edited_at: row.edited_at,
        actor: row.actor || "-",
        had_awb: Boolean(row.had_awb),
        note: row.note || "",
        order_number: order?.order_number || row.order_id,
        customer_name: order?.customer_name || "-",
        customer_whatsapp: order?.customer_whatsapp || "",
        order_status: order?.status || "",
        awb_no: order?.awb_no || "",
        before_items: Array.isArray(row.before_items) ? row.before_items : [],
        after_items: Array.isArray(row.after_items) ? row.after_items : [],
        before_totals: row.before_totals || {},
        after_totals: row.after_totals || {},
      };
    }),
  });
}
