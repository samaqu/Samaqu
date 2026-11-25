/**
 * Laporan Stok → PDF "Kain Terjual & Stok Kosong" (A4 portrait, vektor, font Inter ter-embed).
 *
 * Dipakai endpoint `GET /api/ops/stok/report?bulan=YYYY-MM` (tombol "Export PDF" di tab Laporan Stok menu Produk).
 * Untuk persiapan PO kain: berapa pcs terjual per jenis kain (dirinci per jenis produk/series dan ukuran), berapa sisa stok,
 * dan daftar LENGKAP ukuran yang stoknya kosong.
 *
 * Aturan:
 *  - Terjual = pesanan berstatus diproses / dikirim / selesai pada bulan itu (sama dengan menu Transaksi). Jasa, Kabak, dan Cover &
 *    Hanger bukan kain, jadi tidak ikut.
 *  - Kain item dibaca dari kolom kain pesanan; kalau kosong (mis. Koko lama) diambil dari jenis kain produk sekarang.
 *  - Stok = stok EFEKTIF per ukuran dari `/api/ops/product-variants` (angka yang sama dengan Laporan Stok di layar). Total stok hanya
 *    menjumlah produk yang memegang stok sendiri; series turunan (stok bersama) dan model Lengan Pendek tidak dihitung dua kali.
 *
 * Modul ini hanya membaca, tidak menulis apa pun. Gaya & helper gambar dipakai bersama dengan PDF Transaksi dan Leads.
 */

import { PDFDocument, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { SALE_STATUSES } from "@/lib/transaksi";
import { normalizeItem, normalizeSize, type TxOrder } from "@/lib/transaksi-report-pdf";
import {
  CW,
  FAINT,
  FOOTER_TOP,
  INK,
  LINE,
  MARGIN,
  NAVY,
  ORANGE,
  ORANGE_SOFT,
  PAGE_H,
  PAGE_W,
  SKY,
  SOFT,
  SUB,
  TRACK,
  drawBand,
  drawFooters,
  fitSize,
  generatedAtID,
  hex,
  hline,
  loadReportFonts,
  nfmt,
  rrect,
  sectionTitle,
  text,
  textCenter,
  textRight,
  type Ctx,
  type ReportFonts,
} from "@/lib/leads-report-pdf";

/* ────────────────────────────── tipe data ────────────────────────────── */

/** Satu baris `/api/ops/product-variants` (produk + warna, stok per ukuran). */
export interface StokVariantRow {
  product_id?: string | null;
  product_name?: string | null;
  series_name?: string | null;
  category?: string | null;
  jenis_kain_name?: string | null;
  color?: string | null;
  stock_efektif?: Record<string, number> | null;
  base_product_id?: string | null;
  base_series_name?: string | null;
  service?: boolean | null;
  __blocked_sizes?: Record<string, boolean> | null;
}

export interface StokReportInput {
  /** YYYY-MM */
  month: string;
  orders: TxOrder[];
  variants: StokVariantRow[];
  now?: Date;
  fonts?: ReportFonts;
}

interface SoldRow {
  type: string;
  series: string;
  sizes: Record<string, number>;
  qty: number;
}

export interface KainSummary {
  kain: string;
  sold: number;
  /** Sisa stok gudang (hanya produk pemegang stok sendiri). */
  stock: number;
  emptySizes: number;
  rows: SoldRow[];
}

export interface EmptyRow {
  kain: string;
  type: string;
  series: string;
  label: string;
  /** Ukuran yang stoknya 0. */
  empty: string[];
  /** Total unit yang masih ada di ukuran lain pada baris yang sama. */
  left: number;
  allEmpty: boolean;
}

export interface StokSummary {
  month: string;
  monthLabel: string;
  pcs: number;
  kains: KainSummary[];
  sizeColumns: string[];
  totalStock: number;
  emptySizeCount: number;
  allEmptyCount: number;
  emptyRows: EmptyRow[];
}

/* ────────────────────────────── perhitungan ────────────────────────────── */

const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL"];
const ALL_SIZE = "ALL SIZE";
const NO_KAIN = "Tanpa kain";

const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const norm = (v: unknown) => clean(v).toLowerCase();
const normKain = (v: unknown) => clean(v).replace(/^kain\s+/i, "").toUpperCase();

/** Kategori yang bukan kain / bukan barang dengan stok ukuran. */
const NON_KAIN_CATEGORIES = ["kabak", "cover & hanger", "cover&hanger", "cover hanger"];

const sizeRank = (s: string) => {
  const i = SIZE_ORDER.indexOf(s);
  return i < 0 ? (s === ALL_SIZE ? 999 : 100) : i;
};
const bySize = (a: string, b: string) => sizeRank(a) - sizeRank(b) || a.localeCompare(b);

const isTwinPendek = (row: StokVariantRow) => norm(row.product_id).endsWith("-lengan-pendek");

/** Jenis produk (Thobe, Kandora, Koko, ...) dari kategori, atau kata pertama nama. */
function typeOf(category: unknown, name: unknown): string {
  const c = clean(category);
  if (c) return c;
  return /^([A-Za-z]+)/.exec(clean(name))?.[1] || "Produk";
}

export function summarizeStok(month: string, orders: TxOrder[], variants: StokVariantRow[]): StokSummary {
  const m = /^(\d{4})-(\d{2})$/.exec(month || "");
  const monthLabel = m ? `${MONTHS_ID[Number(m[2]) - 1]} ${m[1]}` : month;

  // Peta nama produk → kain & jenis, untuk item pesanan lama yang kolom kainnya kosong.
  const kainByName = new Map<string, string>();
  for (const v of variants) {
    const k = normKain(v.jenis_kain_name);
    if (k && v.product_name) kainByName.set(norm(v.product_name), k);
  }

  /* ── terjual ── */
  const kainMap = new Map<string, KainSummary>();
  const ensureKain = (kain: string) => {
    let k = kainMap.get(kain);
    if (!k) {
      k = { kain, sold: 0, stock: 0, emptySizes: 0, rows: [] };
      kainMap.set(kain, k);
    }
    return k;
  };

  let pcs = 0;
  const present = new Set<string>();
  for (const o of orders || []) {
    if (!SALE_STATUSES.includes(String(o.status || "").toLowerCase())) continue;
    for (const item of o.items || []) {
      const line = normalizeItem(item);
      if (line.qty <= 0 || line.kind !== "series") continue; // jasa, kabak, cover & hanger bukan kain
      const name = clean(item.product_name);
      const type = typeOf(null, name);
      // Kandora dan Koko tidak punya series ("Tahsin Series" hanya bagian nama Koko), jadi satu baris per jenis.
      const noSeries = ["kandora", "koko"].includes(norm(type)) || norm(line.group) === norm(type);
      const series = noSeries ? "" : line.group;
      const size = normalizeSize(item);
      const kain = normKain(item.kain) || kainByName.get(norm(name)) || normKain(line.kain) || NO_KAIN;
      const k = ensureKain(kain);
      let row = k.rows.find((r) => r.type === type && r.series === series);
      if (!row) {
        row = { type, series, sizes: {}, qty: 0 };
        k.rows.push(row);
      }
      row.sizes[size] = (row.sizes[size] || 0) + line.qty;
      row.qty += line.qty;
      k.sold += line.qty;
      pcs += line.qty;
      present.add(size);
    }
  }

  /* ── stok & stok kosong ── */
  // Series turunan (stok bersama) → daftar series yang mengikuti produk basis, untuk label baris stok kosong.
  const followers = new Map<string, Set<string>>();
  for (const v of variants) {
    if (v.base_product_id && !isTwinPendek(v) && clean(v.series_name)) {
      const set = followers.get(String(v.base_product_id)) || new Set<string>();
      set.add(clean(v.series_name));
      followers.set(String(v.base_product_id), set);
    }
  }

  const emptyRows: EmptyRow[] = [];
  let totalStock = 0;
  let emptySizeCount = 0;
  let allEmptyCount = 0;

  for (const v of variants) {
    const cat = norm(v.category);
    if (v.service || NON_KAIN_CATEGORIES.includes(cat) || isTwinPendek(v)) continue;
    const stock = v.stock_efektif || {};
    const blocked = v.__blocked_sizes || {};
    const sizes = Object.keys(stock).filter((s) => !blocked[s]).sort(bySize);
    if (sizes.length === 0) continue;

    const kain = normKain(v.jenis_kain_name) || NO_KAIN;
    const k = ensureKain(kain);
    const own = !v.base_product_id; // pemegang stok sendiri
    const total = sizes.reduce((t, s) => t + (Number(stock[s]) || 0), 0);
    const empty = sizes.filter((s) => (Number(stock[s]) || 0) <= 0);

    if (own) {
      k.stock += total;
      totalStock += total;
    }
    // Series turunan memakai stok produk basis: baris stok kosongnya sudah diwakili baris basis.
    if (!own || empty.length === 0) continue;

    const type = typeOf(v.category, v.product_name);
    const color = clean(v.color);
    const name = clean(v.product_name) || clean(v.product_id);
    const label = color && norm(color) !== "default" && !norm(name).includes(norm(color)) ? `${name} · ${color}` : name;
    const fol = [...(followers.get(String(v.product_id)) || [])];
    const ownSeries = clean(v.series_name);
    const seriesList = [ownSeries, ...fol].filter(Boolean);
    const series = seriesList.length > 3 ? `${seriesList.length} series` : seriesList.join(" · ");
    const left = total;
    const allEmpty = empty.length === sizes.length;

    k.emptySizes += empty.length;
    emptySizeCount += empty.length;
    if (allEmpty) allEmptyCount += 1;
    emptyRows.push({ kain, type, series, label, empty, left, allEmpty });
  }

  const kains = [...kainMap.values()]
    .filter((k) => k.sold > 0 || k.stock > 0 || k.emptySizes > 0)
    .sort((a, b) => {
      if (a.kain === NO_KAIN) return 1;
      if (b.kain === NO_KAIN) return -1;
      return b.sold - a.sold || a.kain.localeCompare(b.kain);
    });
  kains.forEach((k) => k.rows.sort((a, b) => b.qty - a.qty || a.type.localeCompare(b.type) || a.series.localeCompare(b.series)));

  const sizeColumns = [
    ...SIZE_ORDER.filter((s) => present.has(s)),
    ...[...present].filter((s) => !SIZE_ORDER.includes(s) && s !== ALL_SIZE).sort(),
    ...(present.has(ALL_SIZE) ? [ALL_SIZE] : []),
  ];

  const order = new Map(kains.map((k, i) => [k.kain, i]));
  emptyRows.sort(
    (a, b) =>
      (order.get(a.kain) ?? 99) - (order.get(b.kain) ?? 99) ||
      Number(b.allEmpty) - Number(a.allEmpty) ||
      a.type.localeCompare(b.type) ||
      a.label.localeCompare(b.label),
  );

  return { month, monthLabel, pcs, kains, sizeColumns, totalStock, emptySizeCount, allEmptyCount, emptyRows };
}

export function stokReportFileName(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month || "");
  return `Laporan-Stok-Kain-SAMAQU-${m ? `${MONTHS_ID[Number(m[2]) - 1]}-${m[1]}` : month}.pdf`;
}

/* ────────────────────────────── gambar ────────────────────────────── */

const KAIN_PALETTE = ["#0ea5e9", "#6366f1", "#10b981", "#f97316", "#ec4899", "#8b5cf6", "#14b8a6", "#eab308"];
const kainColor = (i: number) => KAIN_PALETTE[i % KAIN_PALETTE.length];
const RED = "#b91c1c";
const RED_SOFT = "#fee2e2";

const ellipsize = (font: PDFFont, value: string, size: number, max: number): string => {
  const v = clean(value);
  if (font.widthOfTextAtSize(v, size) <= max) return v;
  let out = v;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}…`, size) > max) out = out.slice(0, -1);
  return `${out.trimEnd()}…`;
};

function tint(color: string, amount: number): string {
  const h = color.replace("#", "");
  const mix = (i: number) => Math.round(255 - (255 - parseInt(h.slice(i, i + 2), 16)) * amount);
  return `#${[0, 2, 4].map((i) => mix(i).toString(16).padStart(2, "0")).join("")}`;
}

function slimBand(ctx: Ctx, title: string, sub: string) {
  const page = ctx.page;
  rrect(page, { x: 0, y: PAGE_H - 56, w: PAGE_W, h: 56, fill: NAVY });
  rrect(page, { x: 0, y: PAGE_H - 56, w: PAGE_W, h: 2.5, fill: SKY });
  rrect(page, { x: 0, y: PAGE_H - 56, w: MARGIN + 46, h: 2.5, fill: ORANGE });
  text(page, ctx.bold, title, { x: MARGIN, y: PAGE_H - 28, size: 15, color: "#ffffff" });
  text(page, ctx.regular, sub, { x: MARGIN, y: PAGE_H - 43, size: 8, color: "#cbd5e1" });
  textRight(page, ctx.bold, "SAMAQU", { right: MARGIN + CW, y: PAGE_H - 30, size: 10, color: "#ffffff" });
  ctx.y = PAGE_H - 56 - 18;
}

function newPage(ctx: Ctx, title: string, sub: string) {
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  slimBand(ctx, title, sub);
}

function drawKpis(ctx: Ctx, s: StokSummary) {
  const cards = [
    { label: "Pcs terjual (kain)", value: nfmt(s.pcs), note: "tanpa kabak, cover & jasa", fill: SKY, ink: "#ffffff", sub: "#e0f2fe" },
    { label: "Jenis kain terjual", value: nfmt(s.kains.filter((k) => k.sold > 0 && k.kain !== NO_KAIN).length), note: "yang ada penjualan", fill: ORANGE, ink: "#ffffff", sub: "#ffedd5" },
    { label: "Sisa stok gudang", value: nfmt(s.totalStock), note: "unit, tanpa hitung ganda", fill: SOFT, ink: INK, sub: SUB },
    { label: "Ukuran kosong", value: nfmt(s.emptySizeCount), note: `${nfmt(s.allEmptyCount)} produk habis total`, fill: SOFT, ink: INK, sub: SUB },
  ];
  const gap = 8;
  const w = (CW - gap * (cards.length - 1)) / cards.length;
  const h = 68;
  let x = MARGIN;
  cards.forEach((c) => {
    const y = ctx.y - h;
    const hero = c.fill === SKY || c.fill === ORANGE;
    rrect(ctx.page, { x, y, w, h, r: 10, fill: c.fill, border: hero ? undefined : LINE });
    text(ctx.page, ctx.regular, c.label, { x: x + 11, y: y + h - 18, size: fitSize(ctx.regular, c.label, w - 22, 7.6), color: c.sub });
    text(ctx.page, ctx.bold, c.value, { x: x + 11, y: y + h - 42, size: fitSize(ctx.bold, c.value, w - 22, 20, 10), color: c.ink });
    text(ctx.page, ctx.regular, c.note, { x: x + 11, y: y + 10, size: fitSize(ctx.regular, c.note, w - 22, 7, 5.5), color: c.sub });
    x += w + gap;
  });
  ctx.y -= h;
}

/** Bar per jenis kain: terjual, porsi, dan sisa stok. */
function drawKainBars(ctx: Ctx, s: StokSummary) {
  const page = ctx.page;
  const list = s.kains;
  const max = Math.max(1, ...list.map((k) => k.sold));
  const rowH = 22;
  const barX = MARGIN + 110;
  const barW = 190;
  const soldRight = MARGIN + 110 + 190 + 52;
  const pctRight = soldRight + 40;
  const stockRight = MARGIN + CW - 4;

  const hy = ctx.y - 10;
  const ho = { size: 7.2, color: FAINT };
  text(page, ctx.bold, "JENIS KAIN", { x: MARGIN + 18, y: hy, ...ho });
  textRight(page, ctx.bold, "TERJUAL", { right: soldRight, y: hy, ...ho });
  textRight(page, ctx.bold, "PORSI", { right: pctRight, y: hy, ...ho });
  textRight(page, ctx.bold, "SISA STOK", { right: stockRight, y: hy, ...ho });
  ctx.y -= 16;

  list.forEach((k, i) => {
    const mid = ctx.y - rowH / 2;
    const color = k.kain === NO_KAIN ? "#64748b" : kainColor(i);
    page.drawCircle({ x: MARGIN + 6, y: mid, size: 3.2, color: hex(color) });
    text(page, ctx.bold, ellipsize(ctx.bold, k.kain, 10, 84), { x: MARGIN + 18, y: mid - 3.6, size: 10, color: INK });
    rrect(page, { x: barX, y: mid - 3.5, w: barW, h: 7, r: 3.5, fill: TRACK });
    const fw = (k.sold / max) * barW;
    if (fw > 0) rrect(page, { x: barX, y: mid - 3.5, w: Math.max(fw, 7), h: 7, r: 3.5, fill: color });
    textRight(page, ctx.bold, `${nfmt(k.sold)} pcs`, { right: soldRight, y: mid - 3.4, size: 9.5, color: INK });
    textRight(page, ctx.regular, `${s.pcs > 0 ? ((k.sold / s.pcs) * 100).toFixed(1) : "0.0"}%`, { right: pctRight, y: mid - 3.4, size: 9, color: SUB });
    textRight(page, ctx.bold, `${nfmt(k.stock)} unit`, { right: stockRight, y: mid - 3.4, size: 9.5, color: k.stock <= 0 ? RED : INK });
    ctx.y -= rowH;
    hline(page, ctx.y, MARGIN, MARGIN + CW, "#f1f5f9", 0.6);
  });
}

/* ── rincian terjual per kain → jenis/series (matriks ukuran) ── */

const NAME_W = 150;
const QTY_W = 46;
const GROUP_H = 22;
const ROW_H = 17.5;
const HEAD_H = 15;
const TOTAL_H = 19;
const PAGE_BODY_H = PAGE_H - 56 - 18 - FOOTER_TOP;

function matrixLayout(s: StokSummary) {
  const n = Math.max(1, s.sizeColumns.length);
  const sizeW = Math.min(40, (CW - NAME_W - QTY_W) / n);
  const sizeX = (i: number) => MARGIN + NAME_W + sizeW * i;
  return { sizeW, sizeX, qtyRight: MARGIN + CW - 10 };
}

function drawSizeHeader(ctx: Ctx, s: StokSummary, color: string) {
  const { sizeW, sizeX, qtyRight } = matrixLayout(s);
  const y = ctx.y - HEAD_H;
  rrect(ctx.page, { x: MARGIN + 4, y, w: CW - 8, h: HEAD_H, r: 5, fill: tint(color, 0.1) });
  const base = y + 4.6;
  const o = { size: 7.2, color: SUB };
  text(ctx.page, ctx.bold, "Jenis · series", { x: MARGIN + 14, y: base, ...o });
  s.sizeColumns.forEach((z, i) => {
    textCenter(ctx.page, ctx.bold, z === ALL_SIZE ? "ALL" : z, { center: sizeX(i) + sizeW / 2, y: base, ...o });
  });
  textRight(ctx.page, ctx.bold, "Qty", { right: qtyRight, y: base, ...o });
  ctx.y = y;
}

function drawSoldTable(ctx: Ctx, s: StokSummary) {
  const { sizeW, sizeX, qtyRight } = matrixLayout(s);
  const sub = `${s.monthLabel} · ${nfmt(s.pcs)} pcs terjual`;
  const sold = s.kains.filter((k) => k.sold > 0);

  if (sold.length === 0) {
    text(ctx.page, ctx.regular, "Belum ada kain terjual pada bulan ini.", { x: MARGIN + 12, y: ctx.y - 16, size: 10, color: SUB });
    ctx.y -= 28;
    return;
  }

  let current: { k: KainSummary; color: string } | null = null;
  const ensure = (need: number) => {
    if (ctx.y - need >= FOOTER_TOP) return;
    newPage(ctx, "Terjual per Kain (lanjutan)", sub);
    if (current) {
      const gy = ctx.y - 18;
      rrect(ctx.page, { x: MARGIN, y: gy, w: CW, h: 18, r: 7, fill: SOFT, border: LINE });
      rrect(ctx.page, { x: MARGIN + 6, y: gy + 4, w: 3.5, h: 10, r: 1.75, fill: current.color });
      text(ctx.page, ctx.bold, `Kain ${current.k.kain} (lanjutan)`, { x: MARGIN + 16, y: gy + 5.6, size: 9, color: INK });
      ctx.y = gy - 2;
      drawSizeHeader(ctx, s, current.color);
    }
  };

  sold.forEach((k) => {
    const color = k.kain === NO_KAIN ? "#64748b" : kainColor(s.kains.indexOf(k));
    current = null;
    const fullNeed = GROUP_H + 2 + HEAD_H + k.rows.length * ROW_H + TOTAL_H + 12;
    if (fullNeed <= PAGE_BODY_H) ensure(fullNeed);
    else ensure(GROUP_H + HEAD_H + ROW_H * 2 + 8);

    const gy = ctx.y - GROUP_H;
    rrect(ctx.page, { x: MARGIN, y: gy, w: CW, h: GROUP_H, r: 8, fill: SOFT, border: LINE });
    rrect(ctx.page, { x: MARGIN + 6, y: gy + 5, w: 3.5, h: GROUP_H - 10, r: 1.75, fill: color });
    text(ctx.page, ctx.bold, k.kain === NO_KAIN ? NO_KAIN : `Kain ${k.kain}`, { x: MARGIN + 16, y: gy + 7, size: 10, color: INK });
    textRight(ctx.page, ctx.bold, `${nfmt(k.sold)} pcs`, { right: qtyRight, y: gy + 7, size: 9, color: INK });
    textRight(ctx.page, ctx.regular, `sisa stok ${nfmt(k.stock)} unit`, { right: qtyRight - 56, y: gy + 7.3, size: 7.5, color: k.stock <= 0 ? RED : FAINT });
    ctx.y = gy - 2;

    current = { k, color };
    drawSizeHeader(ctx, s, color);

    k.rows.forEach((r, ri) => {
      ensure(ROW_H + 4);
      const y = ctx.y - ROW_H;
      if (ri % 2 === 1) rrect(ctx.page, { x: MARGIN + 4, y, w: CW - 8, h: ROW_H, fill: "#fafbfc" });
      const base = y + (ROW_H - 8) / 2 + 0.5;
      const label = r.series ? `${r.type} · ${r.series}` : r.type;
      text(ctx.page, ctx.regular, ellipsize(ctx.regular, label, 8.8, NAME_W - 20), { x: MARGIN + 14, y: base, size: 8.8, color: INK });
      s.sizeColumns.forEach((z, i) => {
        const v = r.sizes[z] || 0;
        textCenter(ctx.page, v > 0 ? ctx.bold : ctx.regular, v > 0 ? nfmt(v) : "·", {
          center: sizeX(i) + sizeW / 2,
          y: base,
          size: 8.8,
          color: v > 0 ? INK : "#cbd5e1",
        });
      });
      textRight(ctx.page, ctx.bold, nfmt(r.qty), { right: qtyRight, y: base, size: 9, color: color === "#64748b" ? INK : color });
      ctx.y = y;
    });

    ensure(TOTAL_H + 6);
    const ty = ctx.y - TOTAL_H - 2;
    rrect(ctx.page, { x: MARGIN + 4, y: ty, w: CW - 8, h: TOTAL_H, r: 6, fill: tint(color, 0.08) });
    const tbase = ty + 5.6;
    text(ctx.page, ctx.bold, "Total per ukuran", { x: MARGIN + 14, y: tbase, size: 8.2, color: INK });
    s.sizeColumns.forEach((z, i) => {
      const v = k.rows.reduce((t, r) => t + (r.sizes[z] || 0), 0);
      textCenter(ctx.page, ctx.bold, v > 0 ? nfmt(v) : "·", { center: sizeX(i) + sizeW / 2, y: tbase, size: 8.8, color: v > 0 ? INK : "#cbd5e1" });
    });
    textRight(ctx.page, ctx.bold, nfmt(k.sold), { right: qtyRight, y: tbase, size: 9.4, color: color === "#64748b" ? INK : color });
    ctx.y = ty - 12;
  });
}

/* ── stok kosong (lengkap) ── */

function drawEmptyTable(ctx: Ctx, s: StokSummary) {
  const sub = `${nfmt(s.emptySizeCount)} ukuran kosong · ${nfmt(s.allEmptyCount)} produk habis total`;
  if (s.emptyRows.length === 0) {
    text(ctx.page, ctx.regular, "Tidak ada ukuran yang stoknya kosong.", { x: MARGIN + 12, y: ctx.y - 16, size: 10, color: SUB });
    ctx.y -= 28;
    return;
  }

  const cols = {
    prod: MARGIN + 10,
    series: MARGIN + 160,
    empty: MARGIN + 318,
    stat: MARGIN + CW - 70,
  };
  const prodW = cols.series - cols.prod - 8;
  const seriesW = cols.empty - cols.series - 8;
  const emptyW = cols.stat - cols.empty - 8;
  const rowH = 18;
  const headH = 20;

  const head = () => {
    rrect(ctx.page, { x: MARGIN, y: ctx.y - headH, w: CW, h: headH, r: 8, fill: NAVY });
    const o = { size: 7.6, color: "#e2e8f0" };
    const base = ctx.y - headH / 2 - 2.6;
    text(ctx.page, ctx.bold, "Produk · warna", { x: cols.prod, y: base, ...o });
    text(ctx.page, ctx.bold, "Series", { x: cols.series, y: base, ...o });
    text(ctx.page, ctx.bold, "Ukuran kosong", { x: cols.empty, y: base, ...o });
    text(ctx.page, ctx.bold, "Status", { x: cols.stat + 6, y: base, ...o });
    ctx.y -= headH + 2;
  };

  let lastKain = "";
  head();
  s.emptyRows.forEach((r, i) => {
    const needKain = r.kain !== lastKain ? 22 : 0;
    if (ctx.y - rowH - needKain < FOOTER_TOP) {
      newPage(ctx, "Stok Kosong (lanjutan)", sub);
      head();
      lastKain = "";
    }
    if (r.kain !== lastKain) {
      const gy = ctx.y - 18;
      const idx = s.kains.findIndex((k) => k.kain === r.kain);
      const color = r.kain === NO_KAIN ? "#64748b" : kainColor(Math.max(0, idx));
      rrect(ctx.page, { x: MARGIN, y: gy, w: CW, h: 18, r: 7, fill: SOFT, border: LINE });
      rrect(ctx.page, { x: MARGIN + 6, y: gy + 4, w: 3.5, h: 10, r: 1.75, fill: color });
      const count = s.emptyRows.filter((x) => x.kain === r.kain).length;
      text(ctx.page, ctx.bold, r.kain === NO_KAIN ? NO_KAIN : `Kain ${r.kain}`, { x: MARGIN + 16, y: gy + 5.6, size: 9, color: INK });
      textRight(ctx.page, ctx.regular, `${nfmt(count)} baris`, { right: MARGIN + CW - 10, y: gy + 5.8, size: 7.8, color: FAINT });
      ctx.y = gy - 2;
      lastKain = r.kain;
    }

    const y = ctx.y - rowH;
    if (i % 2 === 1) rrect(ctx.page, { x: MARGIN, y, w: CW, h: rowH, fill: "#fafbfc" });
    const base = y + (rowH - 7.8) / 2 + 0.5;
    text(ctx.page, ctx.regular, ellipsize(ctx.regular, r.label, 8, prodW), { x: cols.prod, y: base, size: 8, color: INK });
    text(ctx.page, ctx.regular, ellipsize(ctx.regular, r.series || "-", 7.6, seriesW), { x: cols.series, y: base, size: 7.6, color: SUB });
    const emptyText = r.allEmpty ? "Semua ukuran" : r.empty.map((z) => (z === ALL_SIZE ? "ALL" : z)).join(", ");
    text(ctx.page, ctx.bold, ellipsize(ctx.bold, emptyText, 8, emptyW), { x: cols.empty, y: base, size: 8, color: RED });
    const pw = 62;
    const label = r.allEmpty ? "HABIS TOTAL" : `Sisa ${nfmt(r.left)} unit`;
    const fill = r.allEmpty ? RED_SOFT : ORANGE_SOFT;
    const ink = r.allEmpty ? RED : "#c2410c";
    rrect(ctx.page, { x: cols.stat, y: y + 3.4, w: pw, h: rowH - 6.8, r: (rowH - 6.8) / 2, fill });
    textCenter(ctx.page, ctx.bold, ellipsize(ctx.bold, label, 6.6, pw - 6), {
      center: cols.stat + pw / 2,
      y: base,
      size: fitSize(ctx.bold, label, pw - 8, 6.6, 4.8),
      color: ink,
    });
    ctx.y = y;
  });
}

/* ────────────────────────────── perakit ────────────────────────────── */

export interface BuiltStokReport {
  bytes: Uint8Array;
  summary: StokSummary;
  pageCount: number;
}

export async function buildStokReportPdf(input: StokReportInput): Promise<BuiltStokReport> {
  const now = input.now ?? new Date();
  const summary = summarizeStok(input.month, input.orders || [], input.variants || []);

  const fonts = input.fonts ?? loadReportFonts();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(fonts.regular, { subset: false, features: { calt: false, ccmp: false } });
  const bold = await doc.embedFont(fonts.bold, { subset: false, features: { calt: false, ccmp: false } });

  /* ═══ Halaman 1 — ringkasan ═══ */
  const ctx: Ctx = { doc, regular, bold, page: doc.addPage([PAGE_W, PAGE_H]), y: PAGE_H };
  drawBand(ctx.page, regular, bold, {
    title: "Laporan Stok & Kain Terjual",
    line: `Periode ${summary.monthLabel}  ·  ${nfmt(summary.pcs)} pcs terjual  ·  ${nfmt(summary.emptySizeCount)} ukuran kosong`,
    generatedAt: generatedAtID(now),
  });
  ctx.y = PAGE_H - 96 - 20;

  drawKpis(ctx, summary);

  ctx.y -= 22;
  sectionTitle(ctx, "Terjual per jenis kain", `${summary.monthLabel}`);
  if (summary.kains.length === 0) {
    text(ctx.page, regular, "Belum ada data kain pada bulan ini.", { x: MARGIN + 4, y: ctx.y - 4, size: 10, color: SUB });
    ctx.y -= 24;
  } else {
    drawKainBars(ctx, summary);
  }

  ctx.y -= 14;
  const notes = [
    "Terjual = transaksi berstatus Lunas, Dikirim, dan Selesai (belum bayar dan dibatalkan tidak ikut). Kabak, cover & hanger, dan jasa bukan kain.",
    "Sisa stok = stok gudang per jenis kain. Series thobe yang berbagi stok dan model Lengan Pendek tidak dihitung dua kali.",
  ];
  notes.forEach((n, i) => {
    if (ctx.y - i * 10.5 > FOOTER_TOP) text(ctx.page, regular, n, { x: MARGIN, y: ctx.y - i * 10.5, size: 7.3, color: FAINT });
  });

  /* ═══ Terjual per kain → jenis/series ═══ */
  newPage(ctx, "Terjual per Kain", `${summary.monthLabel} · jenis kain → jenis produk & series → qty per ukuran`);
  drawSoldTable(ctx, summary);

  /* ═══ Stok kosong ═══ */
  newPage(ctx, "Stok Kosong (lengkap)", `${nfmt(summary.emptySizeCount)} ukuran kosong · ${nfmt(summary.allEmptyCount)} produk habis total`);
  drawEmptyTable(ctx, summary);

  ctx.y -= 12;
  if (ctx.y - 24 > FOOTER_TOP) {
    text(ctx.page, regular, "Memuat semua ukuran dengan stok 0. Thobe berbagi stok antar series: satu baris = satu stok warna (kerah bulat dan kerah kemeja punya stok terpisah).", {
      x: MARGIN,
      y: ctx.y,
      size: 7.3,
      color: FAINT,
    });
  }

  drawFooters(doc, regular, bold);

  const bytes = await doc.save();
  return { bytes, summary, pageCount: doc.getPageCount() };
}
