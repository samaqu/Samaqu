import { SALE_STATUSES } from "@/lib/transaksi";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { jakartaMonthBounds } from "@/lib/ops-followup";
import {
  normalizeAwb,
  summarizeJntInvoice,
  type JntInvoiceHeader,
  type JntInvoiceItem,
  type JntInvoiceSummary,
} from "@/lib/jnt-invoice";

/**
 * Lapisan data tagihan J&T — dipakai bersama route GET dan upload
 * (`/api/ops/ongkir-jnt`) supaya angka di halaman dan hasil upload tidak pernah beda.
 *
 * Tabelnya `jnt_invoices` + `jnt_invoice_items`, dibuat lewat migration yang
 * DIJALANKAN MANUAL di SQL Editor Supabase. Kalau belum dijalankan, PostgREST
 * membalas 404 `PGRST205` — itu kondisi normal, bukan error server, dan semua fungsi
 * di sini meneruskannya sebagai `tableReady: false`.
 */

type Admin = ReturnType<typeof getSupabaseAdmin>;

/** Tabel belum dibuat (migration belum dijalankan) → halaman menampilkan petunjuk SQL. */
export function isMissingTable(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false;
  const code = String(error.code || "");
  const message = String(error.message || "");
  return code === "PGRST205" || code === "42P01" || /could not find the table/i.test(message);
}

export type InvoiceWithItems = { invoice: JntInvoiceHeader | null; items: JntInvoiceItem[] };

/** Ambil header + rincian resi satu bulan, lengkap dengan hasil pencocokan ke pesanan. */
export async function readInvoiceWithItems(admin: Admin, period: string): Promise<InvoiceWithItems> {
  const { data: invoice, error } = await admin
    .from("jnt_invoices")
    .select("*")
    .eq("period", period)
    .maybeSingle();
  if (error) throw error;
  if (!invoice) return { invoice: null, items: [] };

  const { data: items, error: itemsError } = await admin
    .from("jnt_invoice_items")
    .select("*")
    .eq("invoice_id", (invoice as JntInvoiceHeader).id)
    .order("delivery_date", { ascending: true })
    .order("awb_no", { ascending: true });
  if (itemsError) throw itemsError;

  return {
    invoice: invoice as JntInvoiceHeader,
    items: await matchOrdersToItems(admin, (items || []) as JntInvoiceItem[]),
  };
}

/**
 * Cocokkan nomor resi ke pesanan sistem (orders.awb_no) dan tempelkan
 * `order_number` + `shipping_cost` (ongkir yang dibayar customer) per resi.
 * Dihitung saat baca supaya angkanya selalu segar; hasilnya juga ikut disimpan
 * saat upload (lihat route upload) agar bisa dibaca modul lain nanti.
 */
export async function matchOrdersToItems(admin: Admin, items: JntInvoiceItem[]): Promise<JntInvoiceItem[]> {
  const awbs = items.map((item) => normalizeAwb(item.awb_no)).filter(Boolean);
  if (awbs.length === 0) return items;

  const map = new Map<string, { order_number: string; shipping_cost: number }>();
  for (let i = 0; i < awbs.length; i += 200) {
    const { data, error } = await admin
      .from("orders")
      .select("order_number, awb_no, shipping_cost")
      .in("awb_no", awbs.slice(i, i + 200));
    if (error) throw error;
    for (const row of data || []) {
      const key = normalizeAwb(row.awb_no as string);
      if (key) map.set(key, { order_number: row.order_number as string, shipping_cost: Number(row.shipping_cost || 0) });
    }
  }

  return items.map((item) => {
    const hit = map.get(normalizeAwb(item.awb_no));
    return { ...item, order_number: hit?.order_number ?? null, shipping_cost: hit?.shipping_cost ?? null };
  });
}

/**
 * Omzet bulan itu dari tabel `orders` — TERPISAH dari beban ongkir.
 * Basis tanggalnya `orders.created_at` (batas WIB), persis seperti Laporan ops
 * (`/api/ops/laporan`) dan Produk Terlaris: pesanan sah = SALE_STATUSES.
 * Ongkir yang dibayar customer dikeluarkan dari omzet produk, tidak digabung.
 */
export async function readOrderTotals(admin: Admin, period: string): Promise<JntInvoiceSummary["orders"]> {
  const bounds = jakartaMonthBounds(period);
  const { data, error } = await admin
    .from("orders")
    .select("total, shipping_cost, status")
    .gte("created_at", bounds.startIso)
    .lt("created_at", bounds.endIso);
  if (error) throw error;

  const valid = (data || []).filter((row) => SALE_STATUSES.includes(String(row.status || "").toLowerCase()));
  return {
    count: valid.length,
    productRevenue: valid.reduce((sum, row) => sum + Number(row.total || 0) - Number(row.shipping_cost || 0), 0),
    shippingCollected: valid.reduce((sum, row) => sum + Number(row.shipping_cost || 0), 0),
  };
}

/** Ringkasan lengkap satu bulan (angka yang dirender halaman). */
export async function readJntInvoiceSummary(admin: Admin, period: string): Promise<{ invoice: JntInvoiceHeader | null; items: JntInvoiceItem[]; summary: JntInvoiceSummary }> {
  const { invoice, items } = await readInvoiceWithItems(admin, period);
  const orders = await readOrderTotals(admin, period);
  return { invoice, items, summary: summarizeJntInvoice(items, orders) };
}

/** Buat baris `jnt_invoices` untuk bulan itu bila belum ada; kembalikan barisnya. */
export async function ensureInvoice(admin: Admin, period: string): Promise<JntInvoiceHeader & { id: string }> {
  const { data: existing, error } = await admin
    .from("jnt_invoices")
    .select("*")
    .eq("period", period)
    .maybeSingle();
  if (error) throw error;
  if (existing) return existing as JntInvoiceHeader & { id: string };

  const { data: created, error: insertError } = await admin
    .from("jnt_invoices")
    .insert({ period })
    .select("*")
    .single();
  if (insertError) throw insertError;
  return created as JntInvoiceHeader & { id: string };
}

/** Bulan dari tanggal pengiriman → satu kunci `jnt_invoices.period`. */
export function groupItemsByPeriod<T extends { delivery_date: string | null }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const period = String(item.delivery_date || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(period)) continue;
    const list = groups.get(period);
    if (list) list.push(item);
    else groups.set(period, [item]);
  }
  return groups;
}
