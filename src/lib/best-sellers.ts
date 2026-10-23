/**
 * Agregasi "Produk Terlaris" untuk halaman Laporan ops.
 *
 * Identitas diambil dari RELASI MASTER, bukan dari parsing nama item:
 *  - `order_items.product_id` → `products.id`. Katalog menyimpan satu baris per
 *    produk+series (`products.name` sama, `products.series` beda), jadi product_id
 *    sudah mengidentifikasi kombinasi PRODUK + SERIES.
 *  - Nama produk = `products.name`, series = `products.series`, kain = `jenis_kain.name`
 *    (fallback `products.kain`). Ukuran & Cover/Hanger hanya jadi rincian, bukan kunci.
 *  - Satu baris "Per Produk" menggabungkan semua series di bawah produk+kain yang sama.
 *
 * Parsing teks HANYA dipakai untuk item lama yang tidak punya relasi master valid.
 * Item seperti itu ditandai `fallback` dan tidak pernah digabung ke baris master.
 */

import { SALE_STATUSES } from "@/lib/transaksi";
import { OPEN_ORDER_ADDON } from "@/lib/open-order-config";

/** Baris `order_items` yang dipakai agregasi. */
export interface BestSellerItem {
  product_id?: string | null;
  product_name?: string | null;
  color?: string | null;
  size?: string | null;
  kain?: string | null;
  series?: string | null;
  quantity?: number | null;
  qty?: number | null;
  price?: number | null;
  customer_price?: number | null;
}

/** Baris katalog minimal untuk identitas produk (series + kain + nama). */
export interface BestSellerCatalogRow {
  id?: string | null;
  name?: string | null;
  category?: string | null;
  series?: string | null;
  kain?: string | { name?: string | null } | null;
  jenis_kain?: { name?: string | null } | { name?: string | null }[] | null;
}

export interface BestSellerBreakdown {
  label: string;
  units: number;
}

/** Rincian per series di dalam satu baris produk. */
export interface BestSellerSeriesBreakdown extends BestSellerBreakdown {
  key: string;
  revenue: number;
  sizes: BestSellerBreakdown[];
}

interface BestSellerRowBase {
  /** Kunci stabil antar periode. */
  key: string;
  /** Nama tampil baris pertama (produk, dengan "— Series" pada mode series). */
  name: string;
  /** Baris kedua kecil, mis. "Kain B-01". */
  subname: string;
  kain: string;
  category: string;
  units: number;
  revenue: number;
  sizes: BestSellerBreakdown[];
  /** true = item lama tanpa relasi master; sengaja tidak digabung. */
  fallback: boolean;
}

export interface BestSellerSeriesRow extends BestSellerRowBase {
  series: string;
}

export interface BestSellerProductRow extends BestSellerRowBase {
  seriesBreakdown: BestSellerSeriesBreakdown[];
}

export interface BestSellerModeTotals {
  units: number;
  revenue: number;
  /** Jumlah baris unik dengan unit > 0 — mengikuti mode yang aktif. */
  products: number;
  /** Jumlah baris item fallback (bukan unit). */
  fallbackItems: number;
  fallbackUnits: number;
}

export interface BestSellerAggregate {
  series: { rows: BestSellerSeriesRow[]; totals: BestSellerModeTotals };
  product: { rows: BestSellerProductRow[]; totals: BestSellerModeTotals };
}

/** Pesanan yang dianggap penjualan sah — satu aturan dengan laporan & menu Transaksi. */
export function isValidSaleOrder(status?: string | null): boolean {
  return SALE_STATUSES.includes(String(status || "").toLowerCase());
}

const SIZE_IN_NAME_RE = /\bsize\s+(xxs|xs|s|m|l|xl|xxl|xxxl|\d+)\b/gi;
const KAIN_IN_NAME_RE = /\(\s*kain\s+([^)]*)\)/i;
const COVER_IN_NAME_RE = /\(\s*(tanpa|include|dengan|with|without)\s+cover\s*&\s*hanger\s*\)/i;
/** "… Imron Series Superblack …" → series = "Imron" (fallback teks saja). */
const SERIES_PHRASE_IN_NAME_RE = /\b([A-Za-z][\w'’.-]*)\s+series\b/i;
/** "Thobe Superblack — Jiharkah" → series = "Jiharkah" (fallback teks saja). */
const SERIES_DASH_IN_NAME_RE = /\s+[—–]\s+(.+)$/;

const text = (value?: string | null) => String(value ?? "").trim();
const stripKainWord = (value: string) => value.replace(/^\s*kain\s+/i, "").trim();
const normalizeKeyPart = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

/** "Size M" / "XS" → "M" / "XS"; kalau kolomnya kosong, dibaca dari nama item. */
export function normalizeSize(raw?: string | null, fallbackName?: string | null): string {
  const value = String(raw || "").replace(/^\s*size\s+/i, "").trim();
  if (value) return value.toUpperCase();
  const fromName = String(fallbackName || "").match(SIZE_IN_NAME_RE)?.[1];
  return fromName ? fromName.toUpperCase() : "";
}

/** Series dari teks nama — hanya dipakai kalau item tidak punya relasi master. */
function seriesFromName(rawName?: string | null): string {
  const name = String(rawName || "");
  const phrase = name.match(SERIES_PHRASE_IN_NAME_RE);
  if (phrase) return phrase[1];
  const dashed = name.match(SERIES_DASH_IN_NAME_RE);
  return dashed ? dashed[1].trim() : "";
}

/** Kode kain dari teks nama ("(Kain B-01)") — fallback setelah field & katalog. */
function kainFromName(rawName?: string | null): string {
  const match = String(rawName || "").match(KAIN_IN_NAME_RE)?.[1];
  return match ? stripKainWord(match) : "";
}

/**
 * Nama produk tanpa detail varian (size, kain, series, cover):
 * "Thobe Jiharkah Series Broken white (Kain B-01) Size S (Include Cover & Hanger)"
 *   → "Thobe Broken white"
 */
export function cleanProductName(raw?: string | null): string {
  let name = String(raw || "").trim();
  if (!name) return "";
  name = name.replace(/\(\s*kain\s+[^)]*\)/gi, " ");
  name = name.replace(/\(\s*(tanpa|include|dengan|with|without)\s+cover\s*&\s*hanger\s*\)/gi, " ");
  name = name.replace(SIZE_IN_NAME_RE, " ");
  name = name.replace(SERIES_PHRASE_IN_NAME_RE, " ");
  name = name.replace(SERIES_DASH_IN_NAME_RE, " ");
  return name.replace(/\s+/g, " ").replace(/[\s·\-–—]+$/, "").trim();
}

/** Kode kain dari baris katalog: relasi `jenis_kain` dulu, lalu kolom `kain`. */
function catalogKain(row?: BestSellerCatalogRow): string {
  if (!row) return "";
  const relation = Array.isArray(row.jenis_kain) ? row.jenis_kain[0] : row.jenis_kain;
  const fromRelation = stripKainWord(text(relation?.name));
  if (fromRelation) return fromRelation;
  if (typeof row.kain === "string" && row.kain.trim()) return stripKainWord(row.kain);
  return "";
}

const productKeyOf = (category: string, name: string, kain: string) =>
  ["p", category, name, kain].map(normalizeKeyPart).join("::");

const seriesDisplayName = (name: string, series: string) =>
  series ? `${name} — ${series}` : name;

const subnameOf = (kain: string) => (kain ? `Kain ${kain}` : "");

interface Acc {
  units: number;
  revenue: number;
  sizes: Map<string, number>;
}

interface SeriesAcc extends Acc {
  key: string;
  name: string;
  subname: string;
  series: string;
  kain: string;
  category: string;
  fallback: boolean;
}

interface ProductAcc extends Acc {
  key: string;
  name: string;
  subname: string;
  kain: string;
  category: string;
  fallback: boolean;
  series: Map<string, { label: string; units: number; revenue: number; sizes: Map<string, number> }>;
}

const bump = (map: Map<string, number>, label: string, qty: number) =>
  map.set(label, (map.get(label) || 0) + qty);

const toBreakdown = (map: Map<string, number>): BestSellerBreakdown[] =>
  [...map.entries()]
    .map(([label, units]) => ({ label, units }))
    .sort((a, b) => b.units - a.units || a.label.localeCompare(b.label));

/**
 * Hitung unit, omzet, dan rincian varian untuk kedua mode sekaligus.
 * Input `items` HARUS sudah difilter ke pesanan sah (lihat `isValidSaleOrder`).
 */
export function aggregateBestSellers(
  items: BestSellerItem[],
  catalog: BestSellerCatalogRow[] = [],
): BestSellerAggregate {
  const catalogById = new Map<string, BestSellerCatalogRow>();
  for (const row of catalog) {
    if (row?.id) catalogById.set(String(row.id), row);
  }

  const seriesGroups = new Map<string, SeriesAcc>();
  const productGroups = new Map<string, ProductAcc>();
  let fallbackItems = 0;
  let fallbackUnits = 0;

  for (const item of items) {
    const qty = Number(item.quantity ?? item.qty) || 0;
    if (qty <= 0) continue;

    const rawName = text(item.product_name);
    const price = Number(item.price) > 0 ? Number(item.price) : Number(item.customer_price) || 0;
    const rawSize = normalizeSize(item.size, rawName);

    const productId = text(item.product_id);
    const master = productId ? catalogById.get(productId) : undefined;

    let seriesKey: string;
    let productKey: string;
    let name: string;
    let seriesName: string;
    let kain: string;
    let category: string;
    let fallback: boolean;

    if (master) {
      name = text(master.name) || cleanProductName(rawName) || "(tanpa nama)";
      seriesName = text(master.series);
      kain = catalogKain(master);
      category = text(master.category);
      seriesKey = `s:${productId}`;
      productKey = productKeyOf(category, name, kain);
      fallback = false;
    } else if (productId === OPEN_ORDER_ADDON.id) {
      name = rawName || OPEN_ORDER_ADDON.name;
      seriesName = "";
      kain = "";
      category = "Add-on";
      seriesKey = `s:${OPEN_ORDER_ADDON.id}`;
      productKey = `p:${OPEN_ORDER_ADDON.id}`;
      fallback = false;
    } else {
      name = cleanProductName(rawName) || rawName || "(tanpa nama)";
      seriesName = text(item.series) || seriesFromName(rawName);
      kain = stripKainWord(text(item.kain)) || kainFromName(rawName);
      category = "";
      seriesKey = `s:f:${normalizeKeyPart([name, seriesName, kain].join("|"))}`;
      productKey = `p:f:${normalizeKeyPart([name, kain].join("|"))}`;
      fallback = true;
      fallbackItems += 1;
      fallbackUnits += qty;
    }

    // Cover & Hanger / Kabak memakai `size = "ALL SIZE"` hanya sebagai placeholder;
    // varian sebenarnya ada di `color` (mis. "Set Hanger + Cover", "Kabak 12").
    const paketVariant = text(item.color) || text(item.series);
    const isPaket =
      category === "Cover & Hanger" ||
      category === "Kabak" ||
      productId === OPEN_ORDER_ADDON.id ||
      rawSize === "ALL SIZE";
    const sizeLabel = isPaket ? paketVariant || "Paket" : rawSize || "Tanpa ukuran";

    const seriesEntry =
      seriesGroups.get(seriesKey) ||
      ({
        key: seriesKey,
        name: seriesDisplayName(name, seriesName),
        subname: subnameOf(kain),
        series: seriesName,
        kain,
        category,
        fallback,
        units: 0,
        revenue: 0,
        sizes: new Map(),
      } as SeriesAcc);
    seriesEntry.units += qty;
    seriesEntry.revenue += price * qty;
    bump(seriesEntry.sizes, sizeLabel, qty);
    seriesGroups.set(seriesKey, seriesEntry);

    const productEntry =
      productGroups.get(productKey) ||
      ({
        key: productKey,
        name,
        subname: subnameOf(kain),
        kain,
        category,
        fallback,
        units: 0,
        revenue: 0,
        sizes: new Map(),
        series: new Map(),
      } as ProductAcc);
    productEntry.units += qty;
    productEntry.revenue += price * qty;
    bump(productEntry.sizes, sizeLabel, qty);

    const seriesLabel = seriesName || "Tanpa series";
    const seriesBreakdown =
      productEntry.series.get(seriesKey) ||
      { label: seriesLabel, units: 0, revenue: 0, sizes: new Map<string, number>() };
    seriesBreakdown.units += qty;
    seriesBreakdown.revenue += price * qty;
    bump(seriesBreakdown.sizes, sizeLabel, qty);
    productEntry.series.set(seriesKey, seriesBreakdown);
    productGroups.set(productKey, productEntry);
  }

  const seriesRows: BestSellerSeriesRow[] = [...seriesGroups.values()]
    .map((entry) => ({
      key: entry.key,
      name: entry.name,
      subname: entry.subname,
      series: entry.series,
      kain: entry.kain,
      category: entry.category,
      fallback: entry.fallback,
      units: entry.units,
      revenue: entry.revenue,
      sizes: toBreakdown(entry.sizes),
    }))
    .sort((a, b) => b.units - a.units || b.revenue - a.revenue || a.name.localeCompare(b.name));

  const productRows: BestSellerProductRow[] = [...productGroups.values()]
    .map((entry) => ({
      key: entry.key,
      name: entry.name,
      subname: entry.subname,
      kain: entry.kain,
      category: entry.category,
      fallback: entry.fallback,
      units: entry.units,
      revenue: entry.revenue,
      sizes: toBreakdown(entry.sizes),
      seriesBreakdown: [...entry.series.entries()]
        .map(([key, value]) => ({
          key,
          label: value.label,
          units: value.units,
          revenue: value.revenue,
          sizes: toBreakdown(value.sizes),
        }))
        .sort((a, b) => b.units - a.units || a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => b.units - a.units || b.revenue - a.revenue || a.name.localeCompare(b.name));

  const totalsOf = (rows: { units: number; revenue: number }[]): BestSellerModeTotals => ({
    units: rows.reduce((sum, row) => sum + row.units, 0),
    revenue: rows.reduce((sum, row) => sum + row.revenue, 0),
    products: rows.filter((row) => row.units > 0).length,
    fallbackItems,
    fallbackUnits,
  });

  return {
    series: { rows: seriesRows, totals: totalsOf(seriesRows) },
    product: { rows: productRows, totals: totalsOf(productRows) },
  };
}
