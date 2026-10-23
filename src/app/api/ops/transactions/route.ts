import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";
import { orderSourceLabel } from "@/lib/transaksi";

/**
 * Transaksi (barang keluar) untuk dashboard internal.
 * Sumbernya order website (orders + order_items) — jadi penjualan lewat website
 * otomatis muncul sebagai barang keluar, tanpa input dobel. Transaksi manual yang
 * dicatat dari menu Transaksi juga menulis ke tabel yang sama, jadi ikut tampil di
 * sini dengan `platform` sesuai `orders.source` (WhatsApp/Instagram/…).
 *
 * Status baris:
 * - `return`     → order dibatalkan (stok sudah dikembalikan)
 * - `pending`    → order dibuat tapi BELUM DIBAYAR. Stoknya sudah direservasi
 *                  (lihat /api/orders & /api/open-order), tapi belum dihitung
 *                  sebagai penjualan — daftar barang keluar menandainya "Belum bayar".
 * - `completed`  → sudah dibayar/diproses (pesanan benar-benar terjual).
 */
export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const sp = new URL(req.url).searchParams;
  const limit = Math.min(Math.max(parseInt(sp.get("limit") || "2000", 10) || 2000, 1), 5000);
  const desc = (sp.get("sort") || "").includes("desc");

  const admin = getSupabaseAdmin();
  const { data: orders, error } = await admin
    .from("orders")
    .select("id, order_number, created_at, status, payment_method, total, source")
    .order("created_at", { ascending: !desc })
    .limit(Math.ceil(limit / 2));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const orderList = orders || [];
  if (orderList.length === 0) return NextResponse.json({ items: [] });

  const { data: items } = await admin
    .from("order_items")
    .select("id, order_id, product_id, product_name, color, size, series, kain, quantity, price")
    .in("order_id", orderList.map((o) => o.id));

  const byOrder: Record<string, any> = {};
  for (const o of orderList) byOrder[o.id] = o;

  const mapped = (items || []).map((it) => {
    const o = byOrder[it.order_id] || {};
    const qty = Number(it.quantity) || 0;
    const price = Number(it.price) || 0;
    const st = String(o.status || "").toLowerCase();
    const cancelled = st.includes("batal") || st.includes("cancel");
    // `pending` = menunggu pembayaran. Stoknya sudah terpotong (reservasi) tapi
    // pesanannya belum dihitung sebagai penjualan, jadi statusnya dibedakan.
    const unpaid = st === "pending";
    return {
      id: it.id,
      date: (o.created_at || "").slice(0, 10),
      order_id: o.order_number,
      product_id: it.product_id,
      product_name: it.product_name,
      variant_color: it.color,
      variant_size: it.size,
      series: it.series,
      kain: it.kain ?? null,
      qty,
      price,
      total: qty * price,
      ongkir: 0,
      platform: orderSourceLabel(o),
      status: cancelled ? "return" : unpaid ? "pending" : "completed",
      payment_method: o.payment_method || null,
      is_free_gift: false,
      created_date: o.created_at,
    };
  });

  // Barang keluar dari Tukar Size/Return tidak berasal dari order penjualan; diambil dari
  // ledger `stock_movements` supaya riwayat stok tetap satu sumber.
  const { data: movements } = await admin
    .from("stock_movements")
    .select("id, product_id, color, size, qty, source, ref_id, notes, created_at")
    .eq("direction", "out")
    .in("source", ["tukar_size", "return"])
    .order("created_at", { ascending: false })
    .limit(limit);

  let returnOut: any[] = [];
  if (movements && movements.length > 0) {
    const productIds = [...new Set(movements.map((row) => row.product_id).filter(Boolean))];
    const refIds = [...new Set(movements.map((row) => row.ref_id).filter(Boolean))];
    const [{ data: productRows }, { data: returnRows }] = await Promise.all([
      admin.from("products").select("id, name").in("id", productIds),
      refIds.length > 0
        ? admin.from("returns").select("id, return_number, order_number").in("id", refIds)
        : Promise.resolve({ data: [] }),
    ]);
    const productName = new Map((productRows || []).map((row) => [row.id, row.name]));
    const returnRef = new Map((returnRows || []).map((row) => [row.id, row]));
    returnOut = movements.map((row) => {
      const ref = returnRef.get(row.ref_id);
      return {
        id: `movement-${row.id}`,
        date: String(row.created_at || "").slice(0, 10),
        order_id: ref?.return_number || "-",
        product_id: row.product_id,
        product_name: productName.get(row.product_id) || row.product_id,
        variant_color: row.color,
        variant_size: row.size,
        series: null,
        kain: null,
        qty: Number(row.qty) || 0,
        price: 0,
        total: 0,
        ongkir: 0,
        platform: row.source === "tukar_size" ? "Tukar Size" : "Return",
        status: row.source === "tukar_size" ? "tukar_size" : "retur",
        payment_method: null,
        is_free_gift: false,
        is_stock_movement: true,
        created_date: row.created_at,
      };
    });
  }

  const combined = [...mapped, ...returnOut];
  combined.sort((a, b) => (desc ? String(b.created_date).localeCompare(String(a.created_date)) : String(a.created_date).localeCompare(String(b.created_date))));
  return NextResponse.json({ items: combined.slice(0, limit) });
}
