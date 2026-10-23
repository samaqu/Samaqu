/**
 * Agregasi "Produk Terlaris" untuk halaman Laporan ops.
 *
 * Identitas produk (product key) = produk + SERIES + KAIN.
 * Hanya Size dan keterangan Cover & Hanger yang dibuang dari kunci, karena dua hal itu
 * memang varian dari produk yang sama. Series dan kain/kode kain BEDA = baris berbeda:
 *
 *   "Thobe Superblack · Jiharkah · Kain B-01"
 *   "Thobe Superblack · Imalah · Kain B-01"
 *   "Thobe Superblack"            (produk lama, memang tanpa series)
 *
 * Sumber data, berurutan (tidak ada daftar series yang di-hardcode):
 *  1. field terstruktur di `order_items`: `series`, `kain`, `size`.
 *  2. baris katalog `products` lewat `product_id`: `name`, `series`, `jenis_kain.name`
 *     (dipakai juga untuk item lama yang kolom series/kain-nya kosong).
 *  3. parsing nama teks — FALLBACK terakhir, hanya pola size / "(Kain …)" / "… Series …" /
 *     "(Cover & Hanger)" yang dikenal.
 *
 * Kunci yang sama dipakai untuk periode sekarang DAN periode pembanding, jadi produk yang
 * sama selalu menghasilkan key yang sama di kedua periode.
 */

import { SALE_STATUSES } from "@/lib/transaksi";

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

export interface BestSellerProduct {
  /** Kunci produk (stabil antar periode → dipakai untuk pembanding). */
  key: string;
  /** Nama tampil: produk + series + warna + kode kain, tanpa size/cover. */
  name: string;
  units: number;
  revenue: number;
  /** Unit per ukuran, terbanyak dulu. */
  sizes: BestSellerBreakdown[];
  /** Unit per opsi Cover & Hanger, terbanyak dulu. */
  covers: BestSellerBreakdown[];
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
/** "… Imron Series Superblack …" → series = "Imron" (fallback teks saja). */
const SERIES_PHRASE_IN_NAME_RE = /\b([A-Za-z][\w'’.-]*)\s+series\b/i;
/** "Thobe Superblack — Jiharkah" → series = "Jiharkah" (fallback teks saja). */
const SERIES_DASH_IN_NAME_RE = /\s+[—–]\s+(.+)$/;

const text = (value?: string | null) => String(value ?? "").trim();
const stripKainWord = (value: string) => value.replace(/^\s*kain\s+/i, "").trim().toUpperCase();

/** "Size M" / "XS" → "M" / "XS"; kalau kolomnya kosong, dibaca dari nama item. */
export function normalizeSize(raw?: string | null, fallbackName?: string | null): string {
  const value = String(raw || "").replace(/^\s*size\s+/i, "").trim();
  if (value) return value.toUpperCase();
  const fromName = String(fallbackName || "").match(SIZE_IN_NAME_RE)?.[1];
  return fromName ? fromName.toUpperCase() : "";
}

/** Opsi cover & hanger yang tercatat di nama item ("Tanpa Cover" / "Include Cover"). */
export function normalizeCoverOption(rawName?: string | null): string {
  const match = String(rawName || "").match(COVER_IN_NAME_RE);
  if (!match) return "";
  const word = match[1].toLowerCase();
  return word === "tanpa" || word === "without" ? "Tanpa Cover" : "Include Cover";
}

/** Series dari teks nama — hanya dipakai kalau field & katalog sama-sama kosong. */
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
  const fromRelation = text(relation?.name);
  if (fromRelation) return stripKainWord(fromRelation);
  if (typeof row.kain === "string" && row.kain.trim()) return stripKainWord(row.kain);
  return "";
}

/**
 * Nama baris ranking: produk + series + warna + kode kain.
 * Series disisipkan setelah kata pertama, mengikuti pola nama katalog lama:
 *   ("Thobe Broken White", "Jiharkah", "B-01") → "Thobe Jiharkah Series Broken White · Kain B-01"
 */
export function composeProductName(base: string, series?: string | null, kain?: string | null): string {
  let label = text(base) || "(tanpa nama)";
  const seriesValue = text(series);
  if (seriesValue && !new RegExp(`\\b${seriesValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(label)) {
    const [first, ...rest] = label.split(/\s+/);
    label = rest.length ? `${first} ${seriesValue} Series ${rest.join(" ")}` : `${first} ${seriesValue} Series`;
  }
  const kainValue = text(kain);
  return kainValue ? `${label} · Kain ${kainValue}` : label;
}

const normalizeKeyPart = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Hitung unit, omzet, dan rincian varian per produk (produk × series × kain).
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
    covers: Map<string, number>;
  };
  const groups = new Map<string, Acc>();

  for (const item of items) {
    const rawName = text(item.product_name);
    const catalogRow = catalogById.get(text(item.product_id)) || undefined;

    // Identitas produk: field terstruktur → katalog → teks (fallback).
    const series = text(item.series) || text(catalogRow?.series) || seriesFromName(rawName);
    const kain = stripKainWord(text(item.kain)) || catalogKain(catalogRow) || kainFromName(rawName);
    const base = text(catalogRow?.name) || cleanProductName(rawName) || "(tanpa nama)";
    const category = text(catalogRow?.category);

    const name = composeProductName(base, series, kain);
    const key = [category, base, series, kain].map(normalizeKeyPart).join("::");

    const qty = Number(item.quantity ?? item.qty) || 0;
    if (qty <= 0) continue;
    const price = Number(item.price) > 0 ? Number(item.price) : Number(item.customer_price) || 0;

    const sizeLabel = normalizeSize(item.size, rawName) || "Tanpa ukuran";
    const coverLabel = normalizeCoverOption(rawName) || "Standar";

    const entry =
      groups.get(key) ||
      ({ key, name, units: 0, revenue: 0, sizes: new Map(), covers: new Map() } as Acc);
    entry.units += qty;
    entry.revenue += price * qty;
    entry.sizes.set(sizeLabel, (entry.sizes.get(sizeLabel) || 0) + qty);
    entry.covers.set(coverLabel, (entry.covers.get(coverLabel) || 0) + qty);
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
      covers: toBreakdown(entry.covers),
    }))
    .sort((a, b) => b.units - a.units || b.revenue - a.revenue || a.name.localeCompare(b.name));

  return {
    units: rows.reduce((sum, row) => sum + row.units, 0),
    revenue: rows.reduce((sum, row) => sum + row.revenue, 0),
    rows,
  };
}
