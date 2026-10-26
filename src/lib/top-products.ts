/**
 * Satu sumber peringkat "Produk Terlaris" untuk dashboard ADMIN dan OPS.
 *
 * Aturan (sama untuk kedua kartu, jadi angkanya tidak bisa berbeda):
 *  - dikelompokkan per BARIS PRODUK LENGKAP: id produk katalog (kalau ada) + jenis kain + series
 *    (contoh "Thobe Superblack B-01 Jiharkah" ≠ "Thobe Superblack C-01 Jiharkah");
 *  - NAMA tidak dipakai sebagai kunci kalau id produknya dikenal: Open Order menyimpan nama
 *    "Produk — Series" sedangkan checkout manual menyimpan nama produk saja, jadi kalau nama
 *    dijadikan kunci produk yang sama bisa terpecah jadi dua baris;
 *  - penjualan lewat series turunan dihitung atas nama series itu sendiri;
 *  - hanya pesanan SAH: dibayar (`diproses`), dikirim, selesai — batal / belum bayar
 *    (`pending`) / auto-cancel tidak dihitung, dan produk Free Gift dilewati;
 *  - urutan: unit terbanyak; kalau sama, ikut urutan produk yang sudah ada
 *    (urutan array `products` yang dipakai layar);
 *  - omzet per baris dihitung dari HARGA YANG TERCATAT DI ITEM PESANAN saat transaksi
 *    (`order_items.price`), bukan harga produk sekarang, dan hanya dari baris itu.
 */

import { SALE_STATUSES } from "@/lib/transaksi";
import { OPEN_ORDER_ADDON } from "@/lib/open-order-config";

/**
 * Add-on Open Order (`addon-cover-hanger`) secara fisik adalah produk katalog "Cover Hanger".
 * Di ranking, unit add-on digabung ke baris produk itu dan dicatat di `addonUnits` supaya
 * tidak muncul sebagai dua baris yang membingungkan.
 */
const COVER_HANGER_PRODUCT_ID = "cover-hanger";

/**
 * Status pesanan yang dianggap penjualan sah — SATU sumbernya di `src/lib/transaksi.ts`
 * (`SALE_STATUSES`), dipakai bareng menu Transaksi, Database Kota, Pelanggan, dan Dashboard ops
 * supaya definisi "omset" tidak bisa berbeda antar layar.
 */
export const SALE_ORDER_STATUS = SALE_STATUSES;

export function isSaleOrder(status?: string | null): boolean {
  const s = String(status || "").toLowerCase();
  if (!s) return false;
  if (s.includes("batal") || s.includes("cancel")) return false; // dibatalkan / auto-cancel
  return (SALE_ORDER_STATUS as readonly string[]).includes(s);
}

export interface TopProductOrder {
  id?: string | null;
  status?: string | null;
  created_at?: string | null;
}

export interface TopProductItem {
  order_id?: string | null;
  product_id?: string | null;
  product_name?: string | null;
  kain?: string | null;
  series?: string | null;
  quantity?: number | null;
  price?: number | null;
  customer_price?: number | null;
}

export interface TopProductCatalogRow {
  id?: string | null;
  name?: string | null;
  series?: string | null;
  product_type?: string | null;
}

/**
 * Nama tampilan tanpa akhiran series: Open Order menyimpan "Thobe Superblack — Imalah"
 * sementara sumber lain menyimpan "Thobe Superblack" + kolom series terpisah.
 */
function stripSeriesSuffix(name: string, series: string): string {
  if (!series) return name;
  for (const separator of [" — ", " – ", " - "]) {
    const suffix = `${separator}${series}`;
    if (name.endsWith(suffix)) return name.slice(0, -suffix.length).trim() || name;
  }
  return name;
}

export interface TopProductRow {
  /** Nama produk (baris atas kartu). */
  name: string;
  /** Jenis kain, mis. "B-01" (kosong kalau belum diisi di item pesanan). */
  kain: string;
  /** Series, mis. "Imalah" (kosong untuk produk tanpa series). */
  series: string;
  /** "B-01 · Imalah" — baris bawah kartu (kosong kalau kain & series kosong). */
  sub: string;
  /** Total unit terjual pada baris produk ini. */
  units: number;
  /** Omzet baris ini (Rp) dari harga tercatat di item pesanan. */
  revenue: number;
  /** Bagian dari `units` yang berasal dari add-on Open Order (bukan penjualan produk biasa). */
  addonUnits: number;
}

/**
 * Peringkat produk terlaris. `from`/`to` (YYYY-MM-DD, opsional) membatasi periode
 * berdasarkan `orders.created_at`; kosong = semua pesanan yang diberikan.
 */
export function rankTopProducts(input: {
  orders: TopProductOrder[];
  items: TopProductItem[];
  products?: TopProductCatalogRow[];
  from?: string | null;
  to?: string | null;
  limit?: number;
}): TopProductRow[] {
  const { orders, items, products = [], from = null, to = null, limit = 5 } = input;

  const statusById = new Map<string, string>();
  const inPeriod = new Set<string>();
  for (const o of orders) {
    if (!o?.id) continue;
    const id = String(o.id);
    statusById.set(id, String(o.status || ""));
    const day = String(o.created_at || "").slice(0, 10);
    if (from && day && day < from) continue;
    if (to && day && day > to) continue;
    inPeriod.add(id);
  }

  const freeGift = new Set(
    products.filter((p) => p.product_type === "free_gift").map((p) => String(p.id))
  );
  // Katalog kenal (id → nama/series/urutan). Dipakai untuk mengelompokkan per PRODUK,
  // bukan per tulisan nama — sumber pesanan menulis nama dengan/tanpa akhiran series.
  const catalogById = new Map(
    products
      .filter((p) => p.id)
      .map((p, index) => [
        String(p.id),
        { name: String(p.name || "").trim(), series: String(p.series || "").trim(), index },
      ] as const),
  );

  type Acc = TopProductRow & { productId: string; order: number };
  const agg = new Map<string, Acc>();

  for (const it of items) {
    const orderId = String(it.order_id || "");
    if (!inPeriod.has(orderId)) continue;
    if (!isSaleOrder(statusById.get(orderId))) continue;

    const productId = String(it.product_id || "");
    if (productId && freeGift.has(productId)) continue;

    // Add-on Open Order digabung ke produk "Cover Hanger" (dihitung sebagai unit produk itu,
    // lalu ditandai di `addonUnits` supaya admin tetap tahu asalnya).
    const isAddon = productId === OPEN_ORDER_ADDON.id;
    const targetId = isAddon ? COVER_HANGER_PRODUCT_ID : productId;
    const catalog = targetId ? catalogById.get(targetId) : undefined;
    const rawName = String(it.product_name || "").trim() || "(tanpa nama)";
    const kain = String(it.kain || "").trim();
    const series = String(it.series || "").trim() || catalog?.series || "";
    // Nama tampil: nama katalog (paling rapi). Kalau id-nya tidak dikenal (data lama yang
    // memakai kode kain), buang akhiran " — Series" supaya barisnya tidak pecah dua.
    const name = catalog?.name || (isAddon ? "Cover Hanger" : stripSeriesSuffix(rawName, series));
    const key =
      catalog || isAddon
        ? `p:${targetId}`
        : `n:${name.toLowerCase()}||${kain.toLowerCase()}||${series.toLowerCase()}`;

    const qty = Number(it.quantity) || 0;
    const price = Number(it.price) > 0 ? Number(it.price) : Number(it.customer_price) || 0;

    const cur = agg.get(key);
    if (cur) {
      cur.units += qty;
      cur.revenue += price * qty;
      if (isAddon) cur.addonUnits += qty;
      if (!cur.productId && targetId) cur.productId = targetId;
      // Satu produk bisa datang dari beberapa sumber; lengkapi kain/series dari baris mana pun
      // yang datanya terisi supaya baris gabungan tidak tampil kosong.
      if (!cur.kain && kain) cur.kain = kain;
      if (!cur.series && series) cur.series = series;
      cur.sub = [cur.kain, cur.series].filter(Boolean).join(" · ");
    } else {
      agg.set(key, {
        name,
        kain,
        series,
        sub: [kain, series].filter(Boolean).join(" · "),
        units: qty,
        revenue: price * qty,
        addonUnits: isAddon ? qty : 0,
        productId: targetId,
        order: catalog ? catalog.index : Number.MAX_SAFE_INTEGER,
      });
    }
  }

  return Array.from(agg.values())
    .sort((a, b) => b.units - a.units || a.order - b.order || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(({ name, kain, series, sub, units, revenue, addonUnits }) => ({ name, kain, series, sub, units, revenue, addonUnits }));
}
