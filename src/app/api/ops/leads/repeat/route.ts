import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin } from "@/lib/ops-auth";
import { SALE_STATUSES } from "@/lib/transaksi";
import { normalizeLeadPhone } from "@/lib/ops-lead-sync";
import { buildLeadHistories, buildRepeatOrders, type HistoryOrderInput } from "@/lib/leads-repeat";
import { itemProductIds, loadOrderPhotoLookup } from "@/lib/order-photo-data";
import { resolveItemPhotos } from "@/lib/order-photo";

/**
 * GET /api/ops/leads/repeat?start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * Info customer repeat untuk menu Leads. Hanya MEMBACA (leads + orders), tidak menulis apa pun,
 * dan sengaja terpisah dari `GET /api/ops/leads` supaya daftar leads tetap tampil walaupun
 * endpoint ini gagal.
 *
 * Hasil:
 *  - `histories`: per id lead (dalam rentang) → riwayat transaksi sah nomornya + penanda repeat.
 *  - `repeat_orders`: order repeat dalam rentang untuk nomor yang ada di tabel leads
 *    (dasar baris "Repeat Rp …" di kartu Nominal Closing).
 */

const PAGE = 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type OrderRow = Omit<HistoryOrderInput, "items"> & { order_items?: HistoryOrderInput["items"] | null };

const ORDER_COLUMNS =
  "id, order_number, customer_name, customer_whatsapp, total, subtotal, shipping_cost, discount, status, created_at, " +
  "shipping_address, shipping_kecamatan, shipping_city, shipping_province, shipping_postal_code, shipping_notes, " +
  "order_items(product_id, product_name, series, kain, color, size, quantity, price, product_image)";

export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const start = sp.get("start") || "";
  const end = sp.get("end") || "";
  if (!DATE_RE.test(start) || !DATE_RE.test(end)) {
    return NextResponse.json({ error: "start dan end wajib berformat YYYY-MM-DD" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // Semua nomor lead (untuk menentukan nomor mana yang dianggap "ada di leads") + lead dalam rentang.
  const allLeads: Array<{ id: string; kontak: string | null; tanggal: string | null; order_id: string | null }> = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("leads")
      .select("id, kontak, tanggal, order_id")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("[OPS] leads/repeat leads error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    allLeads.push(...((data || []) as typeof allLeads));
    if (!data || data.length < PAGE) break;
  }

  const orders: HistoryOrderInput[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("orders")
      .select(ORDER_COLUMNS)
      .in("status", SALE_STATUSES)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("[OPS] leads/repeat orders error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    for (const row of (data || []) as unknown as OrderRow[]) {
      const { order_items, ...order } = row;
      orders.push({ ...order, items: order_items || [] });
    }
    if (!data || data.length < PAGE) break;
  }

  // Foto item: snapshot di baris pesanan sering kosong, jadi dilengkapi dari katalog — aturan yang SAMA
  // dengan menu Transaksi (`resolveItemPhotos`), supaya foto di detail lead identik.
  const photoLookup = await loadOrderPhotoLookup(itemProductIds(orders.flatMap((order) => order.items)), [], admin);
  for (const order of orders) order.items = resolveItemPhotos(order.items, photoLookup);

  const inWindow = allLeads.filter((lead) => lead.tanggal && lead.tanggal >= start && lead.tanggal <= end);
  const leadPhones = new Set(allLeads.map((lead) => normalizeLeadPhone(lead.kontak)).filter(Boolean));

  return NextResponse.json({
    histories: buildLeadHistories(inWindow, orders, SALE_STATUSES),
    repeat_orders: buildRepeatOrders(orders, leadPhones, start, end, SALE_STATUSES),
  });
}
