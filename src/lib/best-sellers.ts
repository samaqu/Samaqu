/**
 * Agregasi "Produk Terlaris" per PRODUK INDUK untuk halaman Laporan ops.
 *
 * Kenapa perlu normalisasi:
 *  - `order_items.product_name` menyimpan detail varian ikut di nama, mis.
 *    "Thobe Imalah Series Broken white (Kain B-01) Size S (Include Cover & Hanger)".
 *    Kalau nama dipakai apa adanya, satu produk pecah jadi banyak baris (per size/kain/opsi).
 *  - `order_items.product_id` menunjuk ke BARIS KATALOG (satu kombinasi produk × series), jadi
 *    "Thobe Superblack" Imron dan "Thobe Superblack" Imalah punya id berbeda.
 *
 * Aturan penggabungan:
 *  1. Kalau `product_id` ada di tabel `products`, produk induk = `category::name`
 *     ("Thobe::Thobe Superblack") — sama dengan cara Katalog mengelompokkan satu kartu.
 *  2. Kalau tidak ada (item lama / add-on), nama dibersihkan dulu: buang "(Kain …)", "Size …",
 *     dan keterangan "Cover & Hanger".
 *
 * Rincian varian (size / kain / opsi) tetap disimpan untuk breakdown di UI.
 */

import { SALE_STATUSES } from "@/lib/transaksi";

/** Baris `order_items` yang dipakai agregasi. */
export interface BestSellerItem {
  product_id?: string | null;
  product_name?: string | null;
  size?: string | null;
  kain?: string | null;
  series?: string | null;
  quantity?: number | null;
  qty?: number | null;
  price?: number | null;
  customer_price?: number | null;
}

/** Baris katalog minimal untuk memetakan varian ke produk induk. */
export interface BestSellerCatalogRow {
  id?: string | null;
  name?: string | null;
  category?: string | null;
}

export interface BestSellerBreakdown {
  label: string;
  units: number;
}

export interface BestSellerProduct {
  /** Kunci produk induk (stabil antar periode → dipakai untuk pembanding). */
  key: string;
  /** Nama produk induk yang tampil di UI (tanpa detail varian). */
  name: string;
  units: number;
  revenue: number;
  /** Unit per ukuran, terbanyak dulu. */
  sizes: BestSellerBreakdown[];
  /** Unit per kain/opsi (mis. "Kain B-01 · Include Cover"), terbanyak dulu. */
  variants: BestSellerBreakdown[];
}

export interface BestSellerTotals {
  units: number;
  revenue: number;
  rows: BestSellerProduct[];
}

/** Pesanan yang dianggap penjualan sah — satu aturan dengan laporan & menu Transaksi. */
export function isValidSaleOrder(status?: string | null): boolean {
  return SALE_STATUSES.includes(String(status || "").toLowerCase());
}

const SIZE_IN_NAME_RE = /\bsize\s+(xxs|xs|s|m|l|xl|xxl|xxxl|\d+)\b/gi;
const KAIN_IN_NAME_RE = /\(\s*kain\s+([^)]*)\)/i;
const COVER_IN_NAME_RE = /\(\s*(tanpa|include|dengan|with|without)\s+cover\s*&\s*hanger\s*\)/i;

const stripKainWord = (value: string) => value.replace(/^\s*kain\s+/i, "").trim().toUpperCase();

/** "Size M" / "XS" → "M" / "XS"; kalau kolomnya kosong, dibaca dari nama item. */
export function normalizeSize(raw?: string | null, fallbackName?: string | null): string {
  const value = String(raw || "").replace(/^\s*size\s+/i, "").trim();
  if (value) return value.toUpperCase();
  const fromName = String(fallbackName || "").match(SIZE_IN_NAME_RE)?.[1];
  return fromName ? fromName.toUpperCase() : "";
}

/** Kode kain: kolom `kain` dulu, lalu "(Kain B-01)" di nama. */
export function normalizeKain(raw?: string | null, fallbackName?: string | null): string {
  const fromColumn = stripKainWord(String(raw || ""));
  if (fromColumn) return fromColumn;
  const fromName = String(fallbackName || "").match(KAIN_IN_NAME_RE)?.[1];
  return fromName ? stripKainWord(fromName) : "";
}

/** Opsi cover & hanger yang tercatat di nama item ("Tanpa Cover" / "Include Cover"). */
export function normalizeCoverOption(rawName?: string | null): string {
  const match = String(rawName || "").match(COVER_IN_NAME_RE);
  if (!match) return "";
  const word = match[1].toLowerCase();
  return word === "tanpa" || word === "without" ? "Tanpa Cover" : "Include Cover";
}

/**
 * Nama produk tanpa detail varian:
 * "Thobe Imalah Series Broken white (Kain B-01) Size S (Include Cover & Hanger)"
 *   → "Thobe Imalah Series Broken white"
 */
export function cleanProductName(raw?: string | null): string {
  let name = String(raw || "").trim();
  if (!name) return "";
  name = name.replace(/\(\s*kain\s+[^)]*\)/gi, " ");
  name = name.replace(/\(\s*(tanpa|include|dengan|with|without)\s+cover\s*&\s*hanger\s*\)/gi, " ");
  name = name.replace(/cover\s*&\s*hanger/gi, " ");
  name = name.replace(SIZE_IN_NAME_RE, " ");
  return name.replace(/\s+/g, " ").replace(/[\s·\-–]+$/, "").trim();
}

const normalizeKey = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Hitung unit, omzet, dan rincian varian per produk induk.
 * Input `items` HARUS sudah difilter ke pesanan sah (lihat `isValidSaleOrder`).
 */
export function aggregateBestSellers(
  items: BestSellerItem[],
  catalog: BestSellerCatalogRow[] = [],
): BestSellerTotals {
  const catalogById = new Map<string, BestSellerCatalogRow>();
  for (const row of catalog) {
    if (row?.id) catalogById.set(String(row.id), row);
  }

  type Acc = {
    key: string;
    name: string;
    units: number;
    revenue: number;
    sizes: Map<string, number>;
    variants: Map<string, number>;
  };
  const groups = new Map<string, Acc>();

  for (const item of items) {
    const productId = String(item.product_id || "");
    const rawName = String(item.product_name || "").trim();
    const catalogRow = productId ? catalogById.get(productId) : undefined;

    const parentName = String(catalogRow?.name || "").trim() || cleanProductName(rawName) || "(tanpa nama)";
    const parentCategory = String(catalogRow?.category || "").trim();
    const key = parentCategory
      ? `${normalizeKey(parentCategory)}::${normalizeKey(parentName)}`
      : normalizeKey(parentName);

    const qty = Number(item.quantity ?? item.qty) || 0;
    if (qty <= 0) continue;
    const price = Number(item.price) > 0 ? Number(item.price) : Number(item.customer_price) || 0;

    const size = normalizeSize(item.size, rawName);
    const kain = normalizeKain(item.kain, rawName);
    const cover = normalizeCoverOption(rawName);
    const variantLabel = [kain ? `Kain ${kain}` : "", cover].filter(Boolean).join(" · ") || "Standar";
    const sizeLabel = size || "Tanpa ukuran";

    const entry =
      groups.get(key) ||
      ({ key, name: parentName, units: 0, revenue: 0, sizes: new Map(), variants: new Map() } as Acc);
    entry.units += qty;
    entry.revenue += price * qty;
    entry.sizes.set(sizeLabel, (entry.sizes.get(sizeLabel) || 0) + qty);
    entry.variants.set(variantLabel, (entry.variants.get(variantLabel) || 0) + qty);
    groups.set(key, entry);
  }

  const toBreakdown = (map: Map<string, number>): BestSellerBreakdown[] =>
    [...map.entries()]
      .map(([label, units]) => ({ label, units }))
      .sort((a, b) => b.units - a.units || a.label.localeCompare(b.label));

  const rows = [...groups.values()]
    .map((entry) => ({
      key: entry.key,
      name: entry.name,
      units: entry.units,
      revenue: entry.revenue,
      sizes: toBreakdown(entry.sizes),
      variants: toBreakdown(entry.variants),
    }))
    .sort((a, b) => b.units - a.units || b.revenue - a.revenue || a.name.localeCompare(b.name));

  return {
    units: rows.reduce((sum, row) => sum + row.units, 0),
    revenue: rows.reduce((sum, row) => sum + row.revenue, 0),
    rows,
  };
}
