import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";
import { KOTA_KOSONG, kotaFromShipping, kotaKey, prettifyCity, prettifyProvince, provinceOfCity } from "@/lib/kota";
import { ORDER_SOURCE_LABEL, SALE_STATUSES, orderSourceKey } from "@/lib/transaksi";

/**
 * "Database Kota" — sebaran pesanan per kota, dihitung langsung dari pesanan yang sudah ada
 * (`orders` + `order_items`): pesanan website maupun transaksi manual dari menu Transaksi.
 * Tidak ada tabel data baru yang harus diisi manual.
 *
 * Kotanya diambil dari alamat tujuan pesanan (`shipping_city` berbentuk "<kecamatan>, <kota>",
 * atau `shipping_province`/`shipping_kecamatan` untuk transaksi manual). Variasi penulisan
 * yang jelas sama digabung lewat aturan di `src/lib/kota.ts` — jadi "Kota Bogor", "KAB. BOGOR"
 * dan "Bogor" dihitung satu kota. Pesanan yang kotanya kosong muncul sebagai
 * "Kota belum terisi" supaya bisa dirapikan.
 *
 * Pesanan dibatalkan tidak dihitung sama sekali. Omset hanya dari pesanan yang sudah dibayar
 * (sama seperti kartu "Total Omset" di menu Transaksi) — pesanan yang belum dibayar tetap
 * dihitung sebagai pesanan, tapi tidak sebagai uang masuk.
 */

const normPhone = (value: unknown) =>
  String(value ?? "").replace(/\D/g, "").replace(/^0+/, "").replace(/^62/, "");
const normName = (value: unknown) => String(value ?? "").trim().toLowerCase();
const personKey = (order: any) =>
  normPhone(order.customer_whatsapp) || normName(order.customer_name) || order.id;

const monthKey = (iso: string) => String(iso || "").slice(0, 7);

export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const sp = new URL(req.url).searchParams;
  const start = String(sp.get("start") || "").trim();
  const end = String(sp.get("end") || "").trim();
  const sourceFilter = String(sp.get("source") || "").trim();
  const provinceFilter = String(sp.get("province") || "").trim();
  const search = String(sp.get("q") || "").trim().toLowerCase();

  const admin = getSupabaseAdmin();
  let query = admin
    .from("orders")
    .select(
      "id, order_number, created_at, customer_id, customer_name, customer_whatsapp, status, source, total, shipping_city, shipping_province, shipping_kecamatan",
    )
    .neq("status", "dibatalkan")
    .order("created_at", { ascending: false })
    .limit(5000);

  if (start) query = query.gte("created_at", `${start}T00:00:00+07:00`);
  if (end) query = query.lt("created_at", `${end}T23:59:59+07:00`);

  const { data: orders, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (orders || []).map((order) => {
    const rawCity = kotaFromShipping(order.shipping_city, order.shipping_kecamatan);
    // Dikelompokkan pakai kunci yang sudah dinormalisasi ("Kota Bogor" = "Kab bogor" = "Bogor"),
    // sedangkan labelnya ditulis rapi untuk dibaca admin.
    const key = kotaKey(rawCity);
    const province = prettifyProvince(order.shipping_province || "") || provinceOfCity(rawCity);
    return {
      id: order.id,
      order_number: order.order_number,
      created_at: order.created_at,
      name: order.customer_name || "",
      whatsapp: order.customer_whatsapp || "",
      status: String(order.status || ""),
      source: orderSourceKey(order),
      total: Number(order.total) || 0,
      paid: SALE_STATUSES.includes(String(order.status || "")),
      cityKey: key || "__kosong__",
      city: rawCity ? prettifyCity(rawCity) : KOTA_KOSONG,
      // Kecamatan ikut dibawa supaya pencarian bisa menemukannya (mis. cari "Paseh" → baris "Bandung").
      kecamatan: String(order.shipping_kecamatan || "").trim(),
      province: province || "Provinsi belum terisi",
    };
  });

  // Opsi filter diambil dari data yang ada di rentang itu (bukan ditulis manual), dan
  // dihitung SEBELUM filter provinsi/sumber dipasang supaya pilihannya tidak ikut hilang.
  const provinceOptions = [...new Set(rows.map((row) => row.province).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "id"),
  );
  const sourceOptions = [...new Set(rows.map((row) => row.source))].sort();

  const filtered = rows.filter((row) => {
    if (provinceFilter && provinceFilter !== "all" && row.province !== provinceFilter) return false;
    if (sourceFilter && sourceFilter !== "all" && row.source !== sourceFilter) return false;
    // Pencarian mencakup kota DAN kecamatan: cari "Paseh" tetap menemukan baris kotanya ("Bandung").
    if (search && !`${row.city} ${row.kecamatan}`.toLowerCase().includes(search)) return false;
    return true;
  });

  // Produk terlaris per kota (jenis kain + series) — dari item pesanan yang ikut tersaring.
  const orderIds = filtered.map((row) => row.id);
  const itemsByOrder = new Map<string, any[]>();
  if (orderIds.length > 0) {
    const { data: lineItems } = await admin
      .from("order_items")
      .select("order_id, kain, series, product_name, quantity")
      .in("order_id", orderIds);
    for (const item of lineItems || []) {
      if (!itemsByOrder.has(item.order_id)) itemsByOrder.set(item.order_id, []);
      itemsByOrder.get(item.order_id)!.push(item);
    }
  }

  const byCity = new Map<string, any>();
  for (const row of filtered) {
    if (!byCity.has(row.cityKey)) {
      byCity.set(row.cityKey, {
        city: row.city,
        province: row.province,
        orders: 0,
        paidOrders: 0,
        revenue: 0,
        qty: 0,
        people: new Map<string, { name: string; whatsapp: string; orders: number; spend: number }>(),
        monthly: new Map<string, number>(),
        tops: new Map<string, number>(),
        sources: new Map<string, { key: string; orders: number; revenue: number }>(),
      });
    }
    const entry = byCity.get(row.cityKey);

    entry.orders += 1;
    if (row.paid) {
      entry.paidOrders += 1;
      entry.revenue += row.total;
    }

    const key = personKey(row);
    const person = entry.people.get(key) || { name: row.name, whatsapp: row.whatsapp, orders: 0, spend: 0 };
    person.orders += 1;
    if (row.status !== "dibatalkan") person.spend += row.total;
    if (!person.whatsapp && row.whatsapp) person.whatsapp = row.whatsapp;
    entry.people.set(key, person);

    const month = monthKey(row.created_at);
    entry.monthly.set(month, (entry.monthly.get(month) || 0) + 1);

    const source = entry.sources.get(row.source) || { key: row.source, orders: 0, revenue: 0 };
    source.orders += 1;
    if (row.paid) source.revenue += row.total;
    entry.sources.set(row.source, source);

    for (const item of itemsByOrder.get(row.id) || []) {
      entry.qty += Number(item.quantity) || 0;
      const label = [item.kain, item.series].filter(Boolean).join(" · ") || item.product_name || "Produk";
      entry.tops.set(label, (entry.tops.get(label) || 0) + (Number(item.quantity) || 0));
    }
  }

  const items = [...byCity.values()].map((entry) => ({
    city: entry.city,
    province: entry.province,
    orders: entry.orders,
    paidOrders: entry.paidOrders,
    revenue: entry.revenue,
    qty: entry.qty,
    avgOrder: entry.paidOrders > 0 ? Math.round(entry.revenue / entry.paidOrders) : 0,
    uniqueCustomers: entry.people.size,
    monthly: [...entry.monthly.entries()]
      .map(([key, count]) => ({ key, orders: count }))
      .sort((a, b) => a.key.localeCompare(b.key)),
    tops: [...entry.tops.entries()]
      .map(([label, qty]) => ({ label, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8),
    sources: [...entry.sources.values()]
      .map((source) => ({
        key: source.key,
        label: ORDER_SOURCE_LABEL[source.key] || source.key,
        orders: source.orders,
        revenue: source.revenue,
      }))
      .sort((a, b) => b.orders - a.orders),
    people: [...entry.people.values()].sort((a, b) => b.spend - a.spend),
  }));

  items.sort((a, b) => b.orders - a.orders || b.revenue - a.revenue);

  const uniqueCustomers = new Set(filtered.map(personKey)).size;
  const top = items[0];
  const totals = {
    cities: items.length,
    orders: filtered.length,
    customers: uniqueCustomers,
    revenue: filtered.reduce((sum, row) => (row.paid ? sum + row.total : sum), 0),
    topCity: top ? { city: top.city, orders: top.orders } : null,
  };

  return NextResponse.json({
    items,
    totals,
    options: {
      provinces: provinceOptions,
      sources: sourceOptions.map((key) => ({ key, label: ORDER_SOURCE_LABEL[key] || key })),
    },
  });
}
