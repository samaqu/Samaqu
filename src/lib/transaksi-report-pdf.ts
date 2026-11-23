/**
 * Laporan Transaksi → PDF (A4 portrait, vektor, font Inter ter-embed).
 *
 * Dipakai endpoint `GET /api/ops/transaksi/report?bulan=YYYY-MM` (tombol "Export PDF" di menu Transaksi,
 * panel admin dan dashboard office memakai halaman yang sama).
 *
 * Isi: ringkasan bulan (transaksi diakui, omset, pcs terjual), produk terjual per series, ukuran terlaris,
 * sumber transaksi, tabel PRODUK TERJUAL (series → nama produk → kain → qty per ukuran), lalu daftar transaksi.
 *
 * Aturan hitung SAMA dengan kartu di menu Transaksi (`@/lib/transaksi`): transaksi diakui = status diproses /
 * dikirim / selesai (belum bayar dan dibatalkan tidak dihitung), omset = total − ongkir. Modul ini hanya
 * membaca, tidak menulis apa pun.
 *
 * Gaya & helper gambar dipakai bersama dengan PDF Laporan Leads (`leads-report-pdf.ts`) supaya tampilannya satu keluarga.
 */

import { PDFDocument, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { SALE_STATUSES, STATUS_LABEL, orderRevenue } from "@/lib/transaksi";
import { isPaketItem, variantName } from "@/lib/item-label";
import {
  CW,
  FAINT,
  FOOTER_TOP,
  GREEN,
  GREEN_SOFT,
  INK,
  LINE,
  MARGIN,
  NAVY,
  ORANGE,
  ORANGE_SOFT,
  PAGE_H,
  PAGE_W,
  SKY,
  SKY_SOFT,
  SOFT,
  SUB,
  TEXT,
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

export interface TxItem {
  product_name?: string | null;
  series?: string | null;
  kain?: string | null;
  color?: string | null;
  size?: string | null;
  quantity?: number | null;
}

export interface TxOrder {
  order_number?: string | null;
  created_at?: string | null;
  date_wib?: string | null;
  customer_name?: string | null;
  status?: string | null;
  total?: number | null;
  shipping_cost?: number | null;
  source_label?: string | null;
  preorder_waiting?: boolean | null;
  items?: TxItem[] | null;
}

export interface TransaksiReportInput {
  /** YYYY-MM */
  month: string;
  orders: TxOrder[];
  now?: Date;
  fonts?: ReportFonts;
}

export type GroupKind = "series" | "paket" | "jasa";

export interface SoldLine {
  group: string;
  kind: GroupKind;
  product: string;
  kain: string;
  size: string;
  qty: number;
}

export interface ProductRow {
  product: string;
  kain: string;
  sizes: Record<string, number>;
  qty: number;
}

export interface ProductGroup {
  name: string;
  kind: GroupKind;
  qty: number;
  rows: ProductRow[];
}

export interface TransaksiSummary {
  month: string;
  monthLabel: string;
  sold: number;
  unpaid: number;
  cancelled: number;
  revenue: number;
  pcs: number;
  averageOrder: number;
  groups: ProductGroup[];
  sizeTotals: { size: string; qty: number }[];
  sizeColumns: string[];
  sources: { name: string; count: number }[];
}

/* ────────────────────────────── normalisasi item ────────────────────────────── */

const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const escapeRe = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL"];
const ALL_SIZE = "ALL SIZE";

/** Data item lama dan baru berbeda format ("Size M" vs "M"), jadi disamakan dulu. */
export function normalizeSize(item: TxItem): string {
  const raw = clean(item.size).replace(/^size\s+/i, "").toUpperCase();
  if (!raw || raw === ALL_SIZE || raw === "ALLSIZE") return ALL_SIZE;
  return raw === "XXXL" ? "3XL" : raw;
}

function kainOf(item: TxItem): string {
  const direct = clean(item.kain).replace(/^kain\s+/i, "");
  if (direct) return direct.toUpperCase();
  const m = /kain\s*[:\-]?\s*([a-z0-9][a-z0-9.-]*)/i.exec(`${clean(item.color)} ${clean(item.product_name)}`);
  return m ? m[1].toUpperCase() : "";
}

/**
 * Satu item pesanan → satu baris "terjual" yang rapi: kelompok (series), nama produk, kain, ukuran, qty.
 *  - Jasa, Kabak, Cover & Hanger punya kelompok sendiri (bukan series).
 *  - Thobe: series dari kolom `series`, atau dibaca dari nama lama ("… Jiharkah Series …", "… — Jiharkah").
 *  - Kandora (tanpa series) jadi kelompok "Kandora".
 */
export function normalizeItem(item: TxItem): SoldLine {
  const qty = Math.max(0, Math.round(Number(item.quantity) || 0));
  const name = clean(item.product_name);
  const size = normalizeSize(item);
  const kain = kainOf(item);

  if (/^jasa\b/i.test(name)) return { group: "Jasa", kind: "jasa", product: name, kain: "", size: ALL_SIZE, qty };

  if (isPaketItem(item)) {
    const isKabak = /kabak/i.test(name) || /kabak/i.test(clean(item.color));
    const variant = variantName(item.color);
    return {
      group: isKabak ? "Kabak" : "Cover & Hanger",
      kind: "paket",
      product: variant || name || "Produk",
      kain: "",
      size: ALL_SIZE,
      qty,
    };
  }

  let series = clean(item.series).replace(/\s*series\s*$/i, "");
  if (!series) {
    const dash = /\s[—–-]\s*([A-Za-z]+)\s*$/.exec(name);
    const word = /\b([A-Za-z]+)\s+Series\b/i.exec(name);
    series = dash?.[1] || word?.[1] || "";
  }

  let product = name
    .replace(/\(\s*kain[^)]*\)/gi, "")
    .replace(/\(\s*tanpa[^)]*\)/gi, "")
    .replace(/\bsize\s*[a-z0-9]+\b/gi, "");
  if (series) {
    product = product
      .replace(new RegExp(`\\s[—–-]\\s*${escapeRe(series)}\\s*$`, "i"), "")
      .replace(new RegExp(`\\b${escapeRe(series)}\\b`, "i"), "")
      .replace(/\bseries\b/i, "");
  }
  product = clean(product) || name || "Produk";

  // Tanpa series: kelompokkan menurut jenis produknya (kata pertama nama), mis. "Kandora …", "Koko …".
  const group = series || /^([A-Za-z]+)\s+\S/.exec(name)?.[1] || "Tanpa series";
  return { group, kind: "series", product, kain, size, qty };
}

const wibMonthOf = (o: TxOrder) => String(o.date_wib || "").slice(0, 7);

/** Hitung seluruh ringkasan bulan dari daftar pesanan (format keluaran `/api/ops/transaksi`). */
export function summarizeTransaksi(month: string, orders: TxOrder[]): TransaksiSummary {
  const m = /^(\d{4})-(\d{2})$/.exec(month || "");
  const monthLabel = m ? `${MONTHS_ID[Number(m[2]) - 1]} ${m[1]}` : month;

  const sold = orders.filter((o) => SALE_STATUSES.includes(String(o.status || "").toLowerCase()));
  const unpaid = orders.filter((o) => String(o.status || "").toLowerCase() === "pending").length;
  const cancelled = orders.filter((o) => String(o.status || "").toLowerCase() === "dibatalkan").length;
  const revenue = sold.reduce((t, o) => t + orderRevenue({ total: o.total, shipping_cost: o.shipping_cost }), 0);

  const groups = new Map<string, ProductGroup>();
  const sizeTotals = new Map<string, number>();
  const sources = new Map<string, number>();
  let pcs = 0;

  for (const o of sold) {
    const src = clean(o.source_label) || "Tidak diketahui";
    sources.set(src, (sources.get(src) || 0) + 1);
    for (const item of o.items || []) {
      const line = normalizeItem(item);
      if (line.qty <= 0) continue;
      pcs += line.qty;
      let g = groups.get(line.group);
      if (!g) {
        g = { name: line.group, kind: line.kind, qty: 0, rows: [] };
        groups.set(line.group, g);
      }
      g.qty += line.qty;
      let row = g.rows.find((r) => r.product === line.product && r.kain === line.kain);
      if (!row) {
        row = { product: line.product, kain: line.kain, sizes: {}, qty: 0 };
        g.rows.push(row);
      }
      row.sizes[line.size] = (row.sizes[line.size] || 0) + line.qty;
      row.qty += line.qty;
      if (line.kind === "series") sizeTotals.set(line.size, (sizeTotals.get(line.size) || 0) + line.qty);
    }
  }

  // Urutan kelompok: series/kandora terbanyak dulu, lalu Cover & Hanger, Kabak, Jasa di akhir.
  const rank = (g: ProductGroup) => (g.kind === "series" ? 0 : g.name === "Cover & Hanger" ? 1 : g.name === "Kabak" ? 2 : 3);
  const ordered = [...groups.values()].sort((a, b) => rank(a) - rank(b) || b.qty - a.qty || a.name.localeCompare(b.name));
  ordered.forEach((g) => g.rows.sort((a, b) => b.qty - a.qty || a.product.localeCompare(b.product) || a.kain.localeCompare(b.kain)));

  // Kolom ukuran = ukuran yang benar-benar ada, urut XS→5XL, lalu ukuran lain, ALL SIZE di ujung.
  const present = new Set<string>();
  ordered.forEach((g) => g.rows.forEach((r) => Object.keys(r.sizes).forEach((s) => present.add(s))));
  const sizeColumns = [
    ...SIZE_ORDER.filter((s) => present.has(s)),
    ...[...present].filter((s) => !SIZE_ORDER.includes(s) && s !== ALL_SIZE).sort(),
    ...(present.has(ALL_SIZE) ? [ALL_SIZE] : []),
  ];

  const sizeList = [...sizeTotals.entries()]
    .map(([size, qty]) => ({ size, qty }))
    .sort((a, b) => {
      const ia = SIZE_ORDER.indexOf(a.size);
      const ib = SIZE_ORDER.indexOf(b.size);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.size.localeCompare(b.size);
    });

  return {
    month,
    monthLabel,
    sold: sold.length,
    unpaid,
    cancelled,
    revenue,
    pcs,
    averageOrder: sold.length > 0 ? revenue / sold.length : 0,
    groups: ordered,
    sizeTotals: sizeList,
    sizeColumns,
    sources: [...sources.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
  };
}

export function transaksiReportFileName(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month || "");
  return `Laporan-Transaksi-SAMAQU-${m ? `${MONTHS_ID[Number(m[2]) - 1]}-${m[1]}` : month}.pdf`;
}

/* ────────────────────────────── gambar ────────────────────────────── */

const rp = (n: number) => `Rp ${nfmt(Math.round(n))}`;

const SERIES_PALETTE = ["#0ea5e9", "#6366f1", "#10b981", "#f97316", "#ec4899", "#8b5cf6", "#14b8a6", "#eab308", "#ef4444", "#3b82f6"];
const MUTED_GROUP = "#64748b";
const groupColor = (g: ProductGroup, index: number) => (g.kind === "series" ? SERIES_PALETTE[index % SERIES_PALETTE.length] : MUTED_GROUP);

const ellipsize = (font: PDFFont, value: string, size: number, max: number): string => {
  const v = clean(value);
  if (font.widthOfTextAtSize(v, size) <= max) return v;
  let out = v;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}…`, size) > max) out = out.slice(0, -1);
  return `${out.trimEnd()}…`;
};

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

function drawKpis(ctx: Ctx, s: TransaksiSummary) {
  const cards = [
    { label: "Total transaksi", value: nfmt(s.sold), note: "tanpa batal & belum bayar", fill: SKY, ink: "#ffffff", sub: "#e0f2fe" },
    { label: "Omset", value: rp(s.revenue), note: "harga produk, tanpa ongkir", fill: ORANGE, ink: "#ffffff", sub: "#ffedd5" },
    { label: "Pcs terjual", value: nfmt(s.pcs), note: "termasuk cover & jasa", fill: SOFT, ink: INK, sub: SUB },
    { label: "Rata-rata transaksi", value: rp(s.averageOrder), note: "omset ÷ transaksi", fill: SOFT, ink: INK, sub: SUB },
    { label: "Belum bayar", value: nfmt(s.unpaid), note: `${nfmt(s.cancelled)} dibatalkan`, fill: SOFT, ink: INK, sub: SUB },
  ];
  // Kartu Omset diberi ruang lebih lebar karena nominalnya penuh (tidak disingkat).
  const weights = [1, 1.55, 1, 1.25, 1];
  const gap = 7;
  const totalW = CW - gap * (cards.length - 1);
  const sum = weights.reduce((a, b) => a + b, 0);
  const h = 68;
  let x = MARGIN;
  cards.forEach((c, i) => {
    const w = (totalW * weights[i]) / sum;
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

/** Bar horizontal per series: titik warna, nama, bar, qty, porsi. */
function drawSeriesBars(ctx: Ctx, s: TransaksiSummary) {
  const page = ctx.page;
  const max = Math.max(1, ...s.groups.map((g) => g.qty));
  const rowH = 20;
  const barX = MARGIN + 150;
  const barW = 230;
  const numRight = MARGIN + CW - 62;
  const pctRight = MARGIN + CW - 4;
  const list = s.groups.slice(0, 12);
  const rest = s.groups.slice(12);
  const rows = rest.length ? [...list, { name: "Lainnya", kind: "paket" as GroupKind, qty: rest.reduce((t, g) => t + g.qty, 0), rows: [] }] : list;

  rows.forEach((g, i) => {
    const mid = ctx.y - rowH / 2;
    const color = groupColor(g, i);
    page.drawCircle({ x: MARGIN + 6, y: mid, size: 3.2, color: hex(color) });
    text(page, ctx.regular, ellipsize(ctx.regular, g.name, 9.5, 124), { x: MARGIN + 18, y: mid - 3.4, size: 9.5, color: INK });
    rrect(page, { x: barX, y: mid - 3.5, w: barW, h: 7, r: 3.5, fill: TRACK });
    const fw = (g.qty / max) * barW;
    if (fw > 0) rrect(page, { x: barX, y: mid - 3.5, w: Math.max(fw, 7), h: 7, r: 3.5, fill: color });
    textRight(page, ctx.bold, `${nfmt(g.qty)} pcs`, { right: numRight, y: mid - 3.4, size: 9.5, color: INK });
    textRight(page, ctx.regular, `${s.pcs > 0 ? ((g.qty / s.pcs) * 100).toFixed(1) : "0.0"}%`, { right: pctRight, y: mid - 3.4, size: 9, color: SUB });
    ctx.y -= rowH;
    hline(page, ctx.y, MARGIN, MARGIN + CW, "#f1f5f9", 0.6);
  });
}

/** Dua kartu berdampingan: ukuran terlaris (batang vertikal) dan sumber transaksi (baris). */
function drawSizeAndSource(ctx: Ctx, s: TransaksiSummary, h: number) {
  const page = ctx.page;
  const gap = 10;
  const wL = (CW - gap) * 0.58;
  const wR = CW - gap - wL;
  const y0 = ctx.y - h;

  // — kiri: ukuran terlaris —
  rrect(page, { x: MARGIN, y: y0, w: wL, h, r: 12, fill: "#ffffff", border: LINE });
  text(page, ctx.bold, "Ukuran terlaris", { x: MARGIN + 14, y: ctx.y - 20, size: 10, color: INK });
  text(page, ctx.regular, "pcs, di luar cover & jasa", { x: MARGIN + 14 + ctx.bold.widthOfTextAtSize("Ukuran terlaris", 10) + 8, y: ctx.y - 19.5, size: 7.5, color: FAINT });
  const sizes = s.sizeTotals.filter((z) => z.size !== ALL_SIZE);
  if (sizes.length === 0) {
    text(page, ctx.regular, "Belum ada data ukuran.", { x: MARGIN + 14, y: ctx.y - 50, size: 9, color: SUB });
  } else {
    const plotL = MARGIN + 14;
    const plotR = MARGIN + wL - 14;
    const plotB = y0 + 26;
    const plotT = ctx.y - 44;
    const maxV = Math.max(1, ...sizes.map((z) => z.qty));
    const slot = (plotR - plotL) / sizes.length;
    const bw = Math.min(26, slot * 0.56);
    const topQty = Math.max(...sizes.map((z) => z.qty));
    sizes.forEach((z, i) => {
      const cx = plotL + slot * i + slot / 2;
      const bh = Math.max(2, ((z.qty / maxV) * (plotT - plotB)) );
      const best = z.qty === topQty;
      rrect(page, { x: cx - bw / 2, y: plotB, w: bw, h: bh, r: Math.min(4, bw / 2), fill: best ? ORANGE : SKY });
      textCenter(page, ctx.bold, nfmt(z.qty), { center: cx, y: plotB + bh + 4, size: 7.5, color: INK });
      textCenter(page, ctx.regular, z.size, { center: cx, y: plotB - 12, size: 8, color: SUB });
    });
    hline(page, plotB, plotL, plotR, "#cbd5e1", 0.8);
  }

  // — kanan: sumber transaksi —
  const xR = MARGIN + wL + gap;
  rrect(page, { x: xR, y: y0, w: wR, h, r: 12, fill: "#ffffff", border: LINE });
  text(page, ctx.bold, "Sumber transaksi", { x: xR + 14, y: ctx.y - 20, size: 10, color: INK });
  const maxSrc = Math.max(1, ...s.sources.map((x) => x.count));
  const rowH = Math.min(20, (h - 44) / Math.max(1, Math.min(s.sources.length, 6)));
  s.sources.slice(0, 6).forEach((src, i) => {
    const mid = ctx.y - 40 - rowH * i - rowH / 2 + 4;
    text(page, ctx.regular, ellipsize(ctx.regular, src.name, 8.5, 92), { x: xR + 14, y: mid - 3, size: 8.5, color: INK });
    const bx = xR + 14 + 96;
    const bwTrack = wR - 14 - 96 - 14 - 26;
    rrect(page, { x: bx, y: mid - 3, w: bwTrack, h: 6, r: 3, fill: TRACK });
    const fw = (src.count / maxSrc) * bwTrack;
    if (fw > 0) rrect(page, { x: bx, y: mid - 3, w: Math.max(fw, 6), h: 6, r: 3, fill: SKY });
    textRight(page, ctx.bold, nfmt(src.count), { right: xR + wR - 14, y: mid - 3, size: 8.5, color: INK });
  });

  ctx.y = y0;
}

/* ── tabel produk terjual (matriks ukuran) ── */

const NAME_W = 168;
const KAIN_W = 36;
const QTY_W = 44;

function matrixLayout(s: TransaksiSummary) {
  const n = Math.max(1, s.sizeColumns.length);
  const sizeW = Math.min(38, (CW - NAME_W - KAIN_W - QTY_W) / n);
  const sizeX = (i: number) => MARGIN + NAME_W + KAIN_W + sizeW * i;
  return { sizeW, sizeX, qtyRight: MARGIN + CW - 10 };
}

/** Campur warna dengan putih (0 = putih, 1 = warna asli): untuk latar lembut di tabel. */
function tint(color: string, amount: number): string {
  const h = color.replace("#", "");
  const mix = (i: number) => Math.round(255 - (255 - parseInt(h.slice(i, i + 2), 16)) * amount);
  return `#${[0, 2, 4].map((i) => mix(i).toString(16).padStart(2, "0")).join("")}`;
}

export interface SizeInsight {
  /** Qty per ukuran untuk satu kelompok (semua baris dijumlah). */
  totals: Record<string, number>;
  /** Ukuran terlaris (lebih dari satu bila seri). Kosong bila tidak ada ukuran yang bisa dibandingkan. */
  top: string[];
  topQty: number;
  /** Persen dari total pcs kelompok, dibulatkan. */
  topShare: number;
  /** Dua ukuran berikutnya (qty turun). */
  runnersUp: { size: string; qty: number }[];
}

/**
 * Insight ukuran terlaris satu kelompok. "ALL SIZE" tidak ikut dibandingkan kecuali satu-satunya ukuran yang ada
 * (produk all size tidak punya ukuran untuk dibandingkan).
 */
export function seriesSizeInsight(g: ProductGroup, sizeColumns: string[]): SizeInsight {
  const totals: Record<string, number> = {};
  for (const r of g.rows) for (const [z, v] of Object.entries(r.sizes)) totals[z] = (totals[z] || 0) + v;
  const sold = sizeColumns.filter((z) => (totals[z] || 0) > 0);
  const real = sold.filter((z) => z !== ALL_SIZE);
  const pool = real.length > 0 ? real : sold;
  if (pool.length === 0) return { totals, top: [], topQty: 0, topShare: 0, runnersUp: [] };
  const max = Math.max(...pool.map((z) => totals[z]));
  const top = pool.filter((z) => totals[z] === max);
  const runnersUp = pool
    .filter((z) => totals[z] < max)
    .sort((a, b) => totals[b] - totals[a] || sizeColumns.indexOf(a) - sizeColumns.indexOf(b))
    .slice(0, 2)
    .map((z) => ({ size: z, qty: totals[z] }));
  return { totals, top, topQty: max, topShare: g.qty > 0 ? Math.round((max / g.qty) * 100) : 0, runnersUp };
}

const GROUP_H = 22;
const ROW_H = 17.5;
const HEAD_H = 15;
const TOTAL_H = 19;
const INSIGHT_H = 18;
/** Jumlah baris minimal yang ikut ke halaman lanjutan saat satu series terpotong. */
const MIN_TAIL = 3;

/** Header ukuran kecil, dipakai di SETIAP series (dan diulang di halaman lanjutan) supaya kolom selalu terbaca. */
function drawSizeHeader(ctx: Ctx, s: TransaksiSummary, color: string, label = "Produk") {
  const { sizeW, sizeX, qtyRight } = matrixLayout(s);
  const y = ctx.y - HEAD_H;
  rrect(ctx.page, { x: MARGIN + 4, y, w: CW - 8, h: HEAD_H, r: 5, fill: tint(color, 0.10) });
  const base = y + 4.6;
  const o = { size: 7.2, color: SUB };
  text(ctx.page, ctx.bold, label, { x: MARGIN + 14, y: base, ...o });
  text(ctx.page, ctx.bold, "Kain", { x: MARGIN + NAME_W, y: base, ...o });
  s.sizeColumns.forEach((z, i) => {
    textCenter(ctx.page, ctx.bold, z === ALL_SIZE ? "ALL" : z, { center: sizeX(i) + sizeW / 2, y: base, ...o });
  });
  textRight(ctx.page, ctx.bold, "Qty", { right: qtyRight, y: base, ...o });
  ctx.y = y;
}

function drawProductTable(ctx: Ctx, s: TransaksiSummary) {
  const { sizeW, sizeX, qtyRight } = matrixLayout(s);
  const sub = `${s.monthLabel} · ${nfmt(s.pcs)} pcs terjual`;

  if (s.groups.length === 0) {
    text(ctx.page, ctx.regular, "Belum ada produk terjual pada bulan ini.", { x: MARGIN + 12, y: ctx.y - 16, size: 10, color: SUB });
    ctx.y -= 28;
    return;
  }

  // Kelompok yang sedang digambar: dipakai supaya halaman lanjutan membawa nama kelompok + header ukuran lagi.
  let current: { g: ProductGroup; color: string } | null = null;
  const ensure = (need: number) => {
    if (ctx.y - need >= FOOTER_TOP) return;
    newPage(ctx, "Produk Terjual (lanjutan)", sub);
    if (current) {
      const gy = ctx.y - 18;
      rrect(ctx.page, { x: MARGIN, y: gy, w: CW, h: 18, r: 7, fill: SOFT, border: LINE });
      rrect(ctx.page, { x: MARGIN + 6, y: gy + 4, w: 3.5, h: 10, r: 1.75, fill: current.color });
      text(ctx.page, ctx.bold, `${current.g.name} (lanjutan)`, { x: MARGIN + 16, y: gy + 5.6, size: 9, color: INK });
      ctx.y = gy - 2;
      drawSizeHeader(ctx, s, current.color);
    }
  };

  let seriesIdx = 0;
  s.groups.forEach((g) => {
    const isSeries = g.kind === "series";
    const color = groupColor(g, isSeries ? seriesIdx : 0);
    if (isSeries) seriesIdx += 1;
    const accent = color === MUTED_GROUP ? INK : color;

    current = null;
    // Series kecil (≤ MIN_TAIL baris) pindah utuh ke halaman berikutnya, tidak dipotong.
    const small = isSeries && g.rows.length <= MIN_TAIL;
    ensure(GROUP_H + HEAD_H + ROW_H * (small ? g.rows.length : 2) + (small ? TOTAL_H + INSIGHT_H : 0) + 8);

    // pita kelompok
    const gy = ctx.y - GROUP_H;
    rrect(ctx.page, { x: MARGIN, y: gy, w: CW, h: GROUP_H, r: 8, fill: SOFT, border: LINE });
    rrect(ctx.page, { x: MARGIN + 6, y: gy + 5, w: 3.5, h: GROUP_H - 10, r: 1.75, fill: color });
    text(ctx.page, ctx.bold, g.name, { x: MARGIN + 16, y: gy + 7, size: 10, color: INK });
    const share = s.pcs > 0 ? ((g.qty / s.pcs) * 100).toFixed(1) : "0.0";
    textRight(ctx.page, ctx.bold, `${nfmt(g.qty)} pcs`, { right: qtyRight, y: gy + 7, size: 9, color: INK });
    textRight(ctx.page, ctx.regular, `${share}% dari total`, { right: qtyRight - 52, y: gy + 7.3, size: 7.5, color: FAINT });
    ctx.y = gy - 2;

    current = { g, color };
    drawSizeHeader(ctx, s, color);

    g.rows.forEach((r, ri) => {
      // Kalau series terpotong di pergantian halaman, halaman lanjutan membawa minimal MIN_TAIL baris terakhir
      // bersama total + insight-nya (tidak ada baris yatim sendirian, tidak ada total terpisah dari barisnya).
      const tailStart = Math.max(1, g.rows.length - MIN_TAIL);
      const tailNeed = isSeries && ri === tailStart ? (g.rows.length - tailStart) * ROW_H + TOTAL_H + INSIGHT_H + 8 : 0;
      ensure(ROW_H + 4 + Math.max(0, tailNeed - ROW_H));
      const y = ctx.y - ROW_H;
      if (ri % 2 === 1) rrect(ctx.page, { x: MARGIN + 4, y, w: CW - 8, h: ROW_H, fill: "#fafbfc" });
      const base = y + (ROW_H - 8) / 2 + 0.5;
      text(ctx.page, ctx.regular, ellipsize(ctx.regular, r.product, 8.8, NAME_W - 22), { x: MARGIN + 14, y: base, size: 8.8, color: INK });
      text(ctx.page, ctx.regular, r.kain || "·", { x: MARGIN + NAME_W, y: base, size: 8, color: r.kain ? SUB : "#cbd5e1" });

      // Ukuran terlaris di baris ini diberi latar warna (hanya bila ada lebih dari satu ukuran untuk dibandingkan).
      const rowSizes = s.sizeColumns.filter((z) => z !== ALL_SIZE && (r.sizes[z] || 0) > 0);
      const rowMax = rowSizes.length > 1 ? Math.max(...rowSizes.map((z) => r.sizes[z])) : 0;
      s.sizeColumns.forEach((z, i) => {
        const v = r.sizes[z] || 0;
        const isTop = isSeries && rowMax > 0 && z !== ALL_SIZE && v === rowMax;
        if (isTop) rrect(ctx.page, { x: sizeX(i) + sizeW / 2 - 10.5, y: y + 2.4, w: 21, h: ROW_H - 4.8, r: 6, fill: tint(color, 0.2) });
        textCenter(ctx.page, v > 0 ? ctx.bold : ctx.regular, v > 0 ? nfmt(v) : "·", {
          center: sizeX(i) + sizeW / 2,
          y: base,
          size: 8.8,
          color: v > 0 ? (isTop ? accent : INK) : "#cbd5e1",
        });
      });
      textRight(ctx.page, ctx.bold, nfmt(r.qty), { right: qtyRight, y: base, size: 9, color: accent });
      ctx.y = y;
    });

    // Total per ukuran + insight ukuran terlaris (hanya untuk series; paket/jasa tidak bermakna per ukuran).
    if (isSeries) {
      const ins = seriesSizeInsight(g, s.sizeColumns);
      ensure(TOTAL_H + INSIGHT_H + 6);
      const ty = ctx.y - TOTAL_H - 2;
      rrect(ctx.page, { x: MARGIN + 4, y: ty, w: CW - 8, h: TOTAL_H, r: 6, fill: tint(color, 0.08) });
      const tbase = ty + 5.6;
      text(ctx.page, ctx.bold, "Total per ukuran", { x: MARGIN + 14, y: tbase, size: 8.2, color: INK });
      s.sizeColumns.forEach((z, i) => {
        const v = ins.totals[z] || 0;
        const isTop = ins.top.includes(z) && v > 0;
        if (isTop) rrect(ctx.page, { x: sizeX(i) + sizeW / 2 - 12, y: ty + 2.6, w: 24, h: TOTAL_H - 5.2, r: 6.5, fill: tint(color, 0.3) });
        textCenter(ctx.page, ctx.bold, v > 0 ? nfmt(v) : "·", { center: sizeX(i) + sizeW / 2, y: tbase, size: 8.8, color: v > 0 ? (isTop ? accent : INK) : "#cbd5e1" });
      });
      textRight(ctx.page, ctx.bold, nfmt(g.qty), { right: qtyRight, y: tbase, size: 9.4, color: accent });
      ctx.y = ty;

      if (ins.top.length > 0) {
        const iy = ctx.y - INSIGHT_H;
        const head = `Ukuran terlaris: ${ins.top.join(" & ")}`;
        const detail = `${nfmt(ins.topQty)} pcs${ins.top.length > 1 ? " masing-masing" : ""} · ${ins.topShare}% dari ${g.name}`;
        rrect(ctx.page, { x: MARGIN + 4, y: iy + 3, w: 3, h: INSIGHT_H - 6, r: 1.5, fill: color });
        text(ctx.page, ctx.bold, head, { x: MARGIN + 14, y: iy + 6, size: 8.4, color: accent });
        const headW = ctx.bold.widthOfTextAtSize(head, 8.4);
        text(ctx.page, ctx.regular, ` ·  ${detail}`, { x: MARGIN + 14 + headW, y: iy + 6, size: 8, color: SUB });
        if (ins.runnersUp.length > 0) {
          textRight(ctx.page, ctx.regular, `Berikutnya: ${ins.runnersUp.map((r) => `${r.size === ALL_SIZE ? "ALL" : r.size} ${nfmt(r.qty)}`).join(" · ")}`, {
            right: qtyRight,
            y: iy + 6,
            size: 8,
            color: SUB,
          });
        }
        ctx.y = iy;
      }
    }
    ctx.y -= 10;
  });

  // Total seluruh produk, dengan header ukuran sendiri.
  current = null;
  ensure(HEAD_H + 26);
  drawSizeHeader(ctx, s, SKY, "Total");
  const th = 22;
  rrect(ctx.page, { x: MARGIN, y: ctx.y - th - 1, w: CW, h: th, r: 8, fill: SKY_SOFT });
  text(ctx.page, ctx.bold, "Total terjual", { x: MARGIN + 12, y: ctx.y - th + 6, size: 9.5, color: INK });
  s.sizeColumns.forEach((z, i) => {
    const v = s.groups.reduce((t, g) => t + g.rows.reduce((tt, r) => tt + (r.sizes[z] || 0), 0), 0);
    textCenter(ctx.page, ctx.bold, nfmt(v), { center: sizeX(i) + sizeW / 2, y: ctx.y - th + 6, size: 9, color: INK });
  });
  textRight(ctx.page, ctx.bold, nfmt(s.pcs), { right: qtyRight, y: ctx.y - th + 6, size: 10, color: INK });
  ctx.y -= th + 1;
}

/* ── daftar transaksi ── */

const STATUS_STYLE: Record<string, { fill: string; ink: string }> = {
  diproses: { fill: GREEN_SOFT, ink: GREEN },
  dikirim: { fill: SKY_SOFT, ink: "#0369a1" },
  selesai: { fill: "#e2e8f0", ink: "#334155" },
  pending: { fill: ORANGE_SOFT, ink: "#c2410c" },
  dibatalkan: { fill: "#fee2e2", ink: "#b91c1c" },
};

function itemsText(items: TxItem[] | null | undefined): string {
  const parts = (items || [])
    .map((it) => {
      const l = normalizeItem(it);
      if (l.qty <= 0) return "";
      const sz = l.size === ALL_SIZE ? "" : ` ${l.size}`;
      return `${l.product}${sz} ×${l.qty}`;
    })
    .filter(Boolean);
  return parts.join(", ") || "-";
}

function drawOrderList(ctx: Ctx, orders: TxOrder[], sub: string) {
  const cols = {
    no: MARGIN + 10,
    tgl: MARGIN + 92,
    cust: MARGIN + 140,
    prod: MARGIN + 232,
    totalR: MARGIN + CW - 70,
    status: MARGIN + CW - 62,
  };
  const prodW = cols.totalR - 56 - cols.prod;
  const headH = 22;
  const rowH = 19;
  const head = () => {
    rrect(ctx.page, { x: MARGIN, y: ctx.y - headH, w: CW, h: headH, r: 8, fill: NAVY });
    const o = { size: 7.6, color: "#e2e8f0" };
    const base = ctx.y - headH / 2 - 2.6;
    text(ctx.page, ctx.bold, "No. Pesanan", { x: cols.no, y: base, ...o });
    text(ctx.page, ctx.bold, "Tanggal", { x: cols.tgl, y: base, ...o });
    text(ctx.page, ctx.bold, "Pelanggan", { x: cols.cust, y: base, ...o });
    text(ctx.page, ctx.bold, "Produk", { x: cols.prod, y: base, ...o });
    textRight(ctx.page, ctx.bold, "Total", { right: cols.totalR, y: base, ...o });
    text(ctx.page, ctx.bold, "Status", { x: cols.status + 6, y: base, ...o });
    ctx.y -= headH + 2;
  };

  head();
  orders.forEach((o, i) => {
    if (ctx.y - rowH < FOOTER_TOP) {
      newPage(ctx, "Daftar Transaksi (lanjutan)", sub);
      head();
    }
    const y = ctx.y - rowH;
    if (i % 2 === 1) rrect(ctx.page, { x: MARGIN, y, w: CW, h: rowH, fill: "#fafbfc" });
    const base = y + (rowH - 7.6) / 2 + 0.5;
    const d = String(o.date_wib || "");
    const tgl = /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${Number(d.slice(8, 10))} ${MONTHS_SHORT[Number(d.slice(5, 7)) - 1]}` : "-";
    const st = String(o.status || "").toLowerCase();
    const style = STATUS_STYLE[st] || { fill: "#f1f5f9", ink: TEXT };
    const label = STATUS_LABEL[st] || st || "-";

    text(ctx.page, ctx.regular, ellipsize(ctx.regular, clean(o.order_number) || "-", 7.6, 78), { x: cols.no, y: base, size: 7.6, color: INK });
    text(ctx.page, ctx.regular, tgl, { x: cols.tgl, y: base, size: 7.6, color: SUB });
    text(ctx.page, ctx.regular, ellipsize(ctx.regular, clean(o.customer_name) || "-", 7.6, 86), { x: cols.cust, y: base, size: 7.6, color: INK });
    text(ctx.page, ctx.regular, ellipsize(ctx.regular, itemsText(o.items), 7.2, prodW), { x: cols.prod, y: base, size: 7.2, color: TEXT });
    textRight(ctx.page, ctx.bold, nfmt(Math.round(Number(o.total) || 0)), { right: cols.totalR, y: base, size: 7.8, color: INK });
    const pw = 54;
    rrect(ctx.page, { x: cols.status, y: y + 3.5, w: pw, h: rowH - 7, r: (rowH - 7) / 2, fill: style.fill });
    textCenter(ctx.page, ctx.bold, label, { center: cols.status + pw / 2, y: base, size: fitSize(ctx.bold, label, pw - 8, 6.8, 5), color: style.ink });
    ctx.y = y;
  });
}

/* ────────────────────────────── perakit ────────────────────────────── */

export interface BuiltTransaksiReport {
  bytes: Uint8Array;
  summary: TransaksiSummary;
  pageCount: number;
}

export async function buildTransaksiReportPdf(input: TransaksiReportInput): Promise<BuiltTransaksiReport> {
  const now = input.now ?? new Date();
  // RINGKASAN (KPI, produk terjual) dihitung dari SEMUA pesanan bulan itu, sama persis dengan kartu di menu Transaksi
  // (panelKpis memakai seluruh `orders`, termasuk pre-order yang sudah Lunas tapi menunggu stok).
  const allOrders = input.orders || [];
  const summary = summarizeTransaksi(input.month, allOrders);
  // DAFTAR mengikuti tabel di layar: pre-order yang masih menunggu stok tampil di menu Pre-Order, bukan di tabel ini.
  const orders = allOrders.filter((o) => !o.preorder_waiting);
  const waitingCount = allOrders.length - orders.length;

  const fonts = input.fonts ?? loadReportFonts();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  // Font di-embed utuh (tanpa subset) — subset pdf-lib memutus sebagian glyph Inter. Fitur kontekstual dimatikan
  // supaya spasi di sekitar tanda kurung/strip/angka tidak janggal.
  const regular = await doc.embedFont(fonts.regular, { subset: false, features: { calt: false, ccmp: false } });
  const bold = await doc.embedFont(fonts.bold, { subset: false, features: { calt: false, ccmp: false } });

  /* ═══ Halaman 1 — ringkasan ═══ */
  const ctx: Ctx = { doc, regular, bold, page: doc.addPage([PAGE_W, PAGE_H]), y: PAGE_H };
  drawBand(ctx.page, regular, bold, {
    title: "Laporan Transaksi",
    line: `Periode ${summary.monthLabel}  ·  ${nfmt(summary.sold)} transaksi  ·  ${nfmt(summary.pcs)} pcs terjual`,
    generatedAt: generatedAtID(now),
  });
  ctx.y = PAGE_H - 96 - 20;

  drawKpis(ctx, summary);

  ctx.y -= 22;
  sectionTitle(ctx, "Produk terjual per series", `${nfmt(summary.pcs)} pcs`);
  if (summary.groups.length === 0) {
    text(ctx.page, regular, "Belum ada produk terjual pada bulan ini.", { x: MARGIN + 4, y: ctx.y - 4, size: 10, color: SUB });
    ctx.y -= 24;
  } else {
    drawSeriesBars(ctx, summary);
  }

  ctx.y -= 20;
  drawSizeAndSource(ctx, summary, 150);

  /* ═══ Halaman produk terjual ═══ */
  newPage(ctx, "Produk Terjual", `${summary.monthLabel} · series, nama produk, kain, dan qty per ukuran`);
  drawProductTable(ctx, summary);

  ctx.y -= 10;
  if (ctx.y - 40 > FOOTER_TOP) {
    const notes = [
      "Dihitung dari transaksi berstatus Lunas, Dikirim, dan Selesai (belum bayar dan dibatalkan tidak ikut).",
      "Ukuran dibaca dari item pesanan; tanda · berarti tidak ada penjualan.",
    ];
    notes.forEach((n, i) => text(ctx.page, regular, n, { x: MARGIN, y: ctx.y - i * 10.5, size: 7.5, color: FAINT }));
  }

  /* ═══ Daftar transaksi ═══ */
  newPage(ctx, "Daftar Transaksi", `${summary.monthLabel} · ${nfmt(orders.length)} transaksi, termasuk belum bayar dan dibatalkan${waitingCount > 0 ? ` · ${nfmt(waitingCount)} pre-order menunggu stok ada di menu Pre-Order` : ""}`);
  if (orders.length === 0) {
    text(ctx.page, regular, "Belum ada transaksi pada bulan ini.", { x: MARGIN + 12, y: ctx.y - 16, size: 10, color: SUB });
  } else {
    drawOrderList(ctx, orders, `${summary.monthLabel}`);
  }

  drawFooters(doc, regular, bold);

  const bytes = await doc.save();
  return { bytes, summary, pageCount: doc.getPageCount() };
}
