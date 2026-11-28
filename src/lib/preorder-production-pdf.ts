/**
 * PDF "Export PDF Produksi" — SATU pre-order, SATU PDF (A4 portrait, vektor, font Inter ter-embed).
 *
 * Dipakai tombol "Export PDF Produksi" di detail pesanan (menu Transaksi/Pre-Order), endpoint
 * `GET /api/ops/preorder/[order_number]/report`. Diberikan ke bagian produksi: apa yang harus
 * dibuat (Kain, Produk, Series, Ukuran, Qty) dan kapan batasnya (Tgl Pesanan Masuk, Tgl Deadline).
 *
 * Tanggal pesanan & deadline SEKALI ditampilkan besar di atas (bukan diulang di setiap baris tabel)
 * supaya bagian produksi langsung lihat batas waktunya tanpa harus menyisir tabel — lebih profesional
 * dan gak berantakan dibanding kolom tanggal yang nilainya sama di semua baris.
 *
 * Gaya & helper gambar dipakai bareng laporan Transaksi/Leads/Stok (`leads-report-pdf.ts`) supaya
 * tampilannya satu keluarga. Modul ini hanya membaca data yang dikirim, tidak menulis apa pun.
 */

import { PDFDocument } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { wibDateOf } from "@/lib/leads-repeat";
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
  PAGE_H,
  PAGE_W,
  SOFT,
  SUB,
  TEXT,
  drawBand,
  drawFooters,
  fitSize,
  generatedAtID,
  hline,
  nfmt,
  rrect,
  sectionTitle,
  tanggalID,
  text,
  textCenter,
  textRight,
  todayWib,
  type Ctx,
  type ReportFonts,
  loadReportFonts,
} from "@/lib/leads-report-pdf";

export interface ProductionPdfItem {
  product_name?: string | null;
  series?: string | null;
  kain?: string | null;
  color?: string | null;
  size?: string | null;
  quantity?: number | null;
}

export interface ProductionPdfOrder {
  order_number: string;
  customer_name?: string | null;
  /** Timestamp dicatat (akan dibaca sebagai tanggal WIB). */
  created_at: string;
  /** "YYYY-MM-DD", wajib. */
  preorder_deadline: string;
  items: ProductionPdfItem[];
}

export interface ProductionPdfInput extends ProductionPdfOrder {
  now?: Date;
  fonts?: ReportFonts;
}

const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

/** Ukuran "Size M" / "ALL SIZE" dirapikan sama seperti laporan Transaksi. */
function normalizeSize(item: ProductionPdfItem): string {
  const raw = clean(item.size).replace(/^size\s+/i, "").toUpperCase();
  if (!raw) return "-";
  return raw === "ALLSIZE" ? "ALL SIZE" : raw;
}

export interface ProductionRow {
  kain: string;
  produk: string;
  series: string;
  ukuran: string;
  qty: number;
}

export function buildProductionRows(items: ProductionPdfItem[]): ProductionRow[] {
  return (items || [])
    .map((item) => ({
      kain: clean(item.kain) || "-",
      produk: clean(item.product_name) || "Produk",
      series: clean(item.series) || "-",
      ukuran: normalizeSize(item),
      qty: Math.max(0, Math.round(Number(item.quantity) || 0)),
    }))
    .filter((row) => row.qty > 0);
}

/** "H-5" (masih ada waktu), "HARI INI", atau "TERLAMBAT 2 HARI" — dibanding tanggal WIB sekarang. */
export function deadlineBadge(deadline: string, now: Date = new Date()): { label: string; tone: "ok" | "today" | "late" } {
  const today = todayWib(now);
  const daysLeft = Math.round((new Date(`${deadline}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000);
  if (daysLeft > 0) return { label: `H-${daysLeft}`, tone: "ok" };
  if (daysLeft === 0) return { label: "HARI INI", tone: "today" };
  return { label: `TERLAMBAT ${Math.abs(daysLeft)} HARI`, tone: "late" };
}

export function productionPdfFileName(orderNumber: string): string {
  return `PO-Produksi-${orderNumber}.pdf`;
}

/* ────────────────────────────── gambar ────────────────────────────── */

function drawOrderMeta(ctx: Ctx, order: ProductionPdfOrder) {
  const page = ctx.page;
  text(page, ctx.bold, order.order_number, { x: MARGIN, y: ctx.y, size: 13, color: INK });
  const custLabel = clean(order.customer_name) || "-";
  textRight(page, ctx.regular, `Pelanggan: ${custLabel}`, { right: MARGIN + CW, y: ctx.y + 1, size: 9, color: SUB });
  ctx.y -= 24;
}

/** Dua kartu besar: tanggal pesanan masuk (netral) dan deadline produksi (menonjol, dengan badge H-). */
function drawDeadlineHero(ctx: Ctx, order: ProductionPdfOrder, now: Date) {
  const page = ctx.page;
  const gap = 10;
  const h = 78;
  const wL = (CW - gap) * 0.42;
  const wR = CW - gap - wL;
  const y = ctx.y - h;

  // — kiri: tanggal pesanan masuk —
  rrect(page, { x: MARGIN, y, w: wL, h, r: 12, fill: SOFT, border: LINE });
  text(page, ctx.regular, "TGL PESANAN MASUK", { x: MARGIN + 14, y: y + h - 22, size: 7.4, color: SUB });
  text(page, ctx.bold, tanggalID(wibDateOf(order.created_at)), {
    x: MARGIN + 14,
    y: y + h - 44,
    size: fitSize(ctx.bold, tanggalID(wibDateOf(order.created_at)), wL - 28, 17, 11),
    color: INK,
  });
  text(page, ctx.regular, "Saat PO dicatat admin", { x: MARGIN + 14, y: y + 12, size: 7.2, color: FAINT });

  // — kanan: deadline, menonjol (orange) + badge H- —
  const xR = MARGIN + wL + gap;
  rrect(page, { x: xR, y, w: wR, h, r: 12, fill: ORANGE });
  text(page, ctx.bold, "DEADLINE PRODUKSI", { x: xR + 14, y: y + h - 22, size: 7.4, color: "#ffedd5" });
  const deadlineLabel = tanggalID(order.preorder_deadline);
  text(page, ctx.bold, deadlineLabel, {
    x: xR + 14,
    y: y + h - 46,
    size: fitSize(ctx.bold, deadlineLabel, wR - 28 - 90, 19, 12),
    color: "#ffffff",
  });

  const badge = deadlineBadge(order.preorder_deadline, now);
  const badgeFill = badge.tone === "late" ? "#7f1d1d" : badge.tone === "today" ? "#ffffff" : "#ffffff";
  const badgeInk = badge.tone === "late" ? "#ffffff" : badge.tone === "today" ? "#c2410c" : ORANGE;
  const bw = ctx.bold.widthOfTextAtSize(badge.label, 9) + 18;
  rrect(page, { x: xR + wR - 14 - bw, y: y + h - 34, w: bw, h: 20, r: 10, fill: badgeFill });
  textCenter(page, ctx.bold, badge.label, { center: xR + wR - 14 - bw / 2, y: y + h - 27.5, size: 9, color: badgeInk });
  text(page, ctx.regular, "Barang harus siap sebelum tanggal ini", { x: xR + 14, y: y + 12, size: 7.2, color: "#ffedd5" });

  ctx.y = y;
}

const NAME_W = 150;
const KAIN_W = 86;
const SERIES_W = 110;

function tableCols() {
  const kain = MARGIN;
  const produk = kain + KAIN_W;
  const series = produk + NAME_W;
  const ukuran = series + SERIES_W;
  const qtyRight = MARGIN + CW - 6;
  return { kain, produk, series, ukuran, qtyRight };
}

function drawTableHeader(ctx: Ctx) {
  const page = ctx.page;
  const cols = tableCols();
  const h = 24;
  const y = ctx.y - h;
  rrect(page, { x: MARGIN, y, w: CW, h, r: 8, fill: NAVY });
  const base = y + h / 2 - 3;
  const o = { size: 8, color: "#e2e8f0" };
  text(page, ctx.bold, "KAIN", { x: cols.kain + 10, y: base, ...o });
  text(page, ctx.bold, "PRODUK", { x: cols.produk + 10, y: base, ...o });
  text(page, ctx.bold, "SERIES", { x: cols.series + 10, y: base, ...o });
  text(page, ctx.bold, "UKURAN", { x: cols.ukuran + 10, y: base, ...o });
  textRight(page, ctx.bold, "QTY", { right: cols.qtyRight, y: base, ...o });
  ctx.y = y;
}

function ellipsize(font: { widthOfTextAtSize: (v: string, s: number) => number }, value: string, size: number, max: number): string {
  const v = clean(value);
  if (font.widthOfTextAtSize(v, size) <= max) return v;
  let out = v;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}…`, size) > max) out = out.slice(0, -1);
  return `${out.trimEnd()}…`;
}

function drawTableRow(ctx: Ctx, row: ProductionRow, index: number) {
  const page = ctx.page;
  const cols = tableCols();
  const rowH = 24;
  const y = ctx.y - rowH;
  if (index % 2 === 1) rrect(page, { x: MARGIN, y, w: CW, h: rowH, fill: "#fafbfc" });
  const base = y + rowH / 2 - 3.4;
  text(page, ctx.regular, ellipsize(ctx.regular, row.kain, 9.5, KAIN_W - 18), { x: cols.kain + 10, y: base, size: 9.5, color: TEXT });
  text(page, ctx.bold, ellipsize(ctx.bold, row.produk, 9.5, NAME_W - 18), { x: cols.produk + 10, y: base, size: 9.5, color: INK });
  text(page, ctx.regular, ellipsize(ctx.regular, row.series, 9.5, SERIES_W - 18), { x: cols.series + 10, y: base, size: 9.5, color: TEXT });

  const sizePillW = Math.max(36, ctx.bold.widthOfTextAtSize(row.ukuran, 8.5) + 16);
  rrect(page, { x: cols.ukuran + 10, y: y + rowH / 2 - 9, w: sizePillW, h: 18, r: 9, fill: "#e0f2fe" });
  textCenter(page, ctx.bold, row.ukuran, { center: cols.ukuran + 10 + sizePillW / 2, y: base + 0.3, size: 8.5, color: "#0369a1" });

  textRight(page, ctx.bold, nfmt(row.qty), { right: cols.qtyRight, y: base, size: 10.5, color: INK });
  ctx.y = y;
  hline(page, ctx.y, MARGIN, MARGIN + CW, "#f1f5f9", 0.6);
}

function newPage(ctx: Ctx, order: ProductionPdfOrder, generatedAt: string) {
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  drawBand(ctx.page, ctx.regular, ctx.bold, {
    title: "PO Produksi (lanjutan)",
    line: `${order.order_number} · lanjutan daftar produksi`,
    generatedAt,
  });
  ctx.y = PAGE_H - 96 - 22;
  drawTableHeader(ctx);
}

/* ────────────────────────────── perakit ────────────────────────────── */

export interface BuiltProductionPdf {
  bytes: Uint8Array;
  rows: ProductionRow[];
  totalQty: number;
  pageCount: number;
}

export async function buildPreorderProductionPdf(input: ProductionPdfInput): Promise<BuiltProductionPdf> {
  const now = input.now ?? new Date();
  const rows = buildProductionRows(input.items);
  const totalQty = rows.reduce((sum, row) => sum + row.qty, 0);

  const fonts = input.fonts ?? loadReportFonts();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(fonts.regular, { subset: false, features: { calt: false, ccmp: false } });
  const bold = await doc.embedFont(fonts.bold, { subset: false, features: { calt: false, ccmp: false } });

  const generatedAt = generatedAtID(now);
  const ctx: Ctx = { doc, regular, bold, page: doc.addPage([PAGE_W, PAGE_H]), y: PAGE_H };
  drawBand(ctx.page, regular, bold, {
    title: "PO Produksi",
    line: `Pre-order ${input.order_number} · ${nfmt(rows.length)} item · ${nfmt(totalQty)} pcs`,
    generatedAt,
    pill: "UNTUK PRODUKSI",
  });
  ctx.y = PAGE_H - 96 - 22;

  drawOrderMeta(ctx, input);
  drawDeadlineHero(ctx, input, now);

  ctx.y -= 22;
  sectionTitle(ctx, "Daftar produksi", `${nfmt(rows.length)} item · ${nfmt(totalQty)} pcs`);

  if (rows.length === 0) {
    text(ctx.page, regular, "Tidak ada item bersetok pada pesanan ini.", { x: MARGIN + 4, y: ctx.y - 4, size: 10, color: SUB });
    ctx.y -= 24;
  } else {
    drawTableHeader(ctx);
    rows.forEach((row, index) => {
      if (ctx.y - 24 < FOOTER_TOP) newPage(ctx, input, generatedAt);
      drawTableRow(ctx, row, index);
    });

    // Total baris, menyatu dengan tabel.
    if (ctx.y - 26 < FOOTER_TOP) newPage(ctx, input, generatedAt);
    const totalH = 26;
    const ty = ctx.y - totalH;
    rrect(ctx.page, { x: MARGIN, y: ty, w: CW, h: totalH, r: 8, fill: GREEN_SOFT });
    const tbase = ty + totalH / 2 - 3.4;
    text(ctx.page, ctx.bold, "Total yang harus diproduksi", { x: MARGIN + 10, y: tbase, size: 9.5, color: GREEN });
    textRight(ctx.page, ctx.bold, `${nfmt(totalQty)} pcs`, { right: MARGIN + CW - 6, y: tbase, size: 11, color: GREEN });
    ctx.y = ty;
  }

  ctx.y -= 14;
  if (ctx.y - 30 > FOOTER_TOP) {
    text(ctx.page, regular, "Cocokkan kain, series, dan ukuran sebelum mulai produksi. Hubungi admin kalau ada yang tidak sesuai.", {
      x: MARGIN,
      y: ctx.y,
      size: 7.8,
      color: FAINT,
    });
  }

  drawFooters(doc, regular, bold);

  const bytes = await doc.save();
  return { bytes, rows, totalQty, pageCount: doc.getPageCount() };
}
