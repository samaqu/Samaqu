/**
 * Laporan Leads & Closing → PDF (A4 portrait, vektor, font Inter ter-embed).
 *
 * Dipakai endpoint `GET /api/ops/leads/report?bulan=YYYY-MM`.
 *
 * Gaya: modern, selaras halaman /ops/leads/laporan — header band navy dengan aksen sky + orange,
 * kartu KPI berwarna, bar sumber leads, grafik batang tren harian (leads vs closing), tabel mingguan
 * dengan bar mini, dan tabel harian bergaris lembut. Semua vektor (tanpa gambar), jadi tetap tajam saat dicetak.
 *
 * Pustaka: pdf-lib + @pdf-lib/fontkit (murni JS → aman di Vercel serverless). Font Inter
 * di-embed dari src/assets/fonts. Sudut membulat digambar lewat drawSvgPath.
 *
 * Angka & definisi: agregasi memakai definisi yang sama persis dengan halaman
 * /ops/leads/laporan (buildDailyRows/buildTotals). Modul ini tidak menulis apa pun.
 */

import fs from "node:fs";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

/* ────────────────────────────── data & agregasi (tidak berubah) ────────────────────────────── */

export interface LeadRow {
  tanggal: string;
  sumber?: string | null;
  status?: string | null;
  nominal?: number | null;
  /** Penanggung jawab lead (kolom `leads.pic`); dipakai seksi Agent / Admin / dibantu Surya. */
  pic?: string | null;
}

export interface DailyLeadRow {
  tanggal: string;
  perSumber: Record<string, number>;
  perSumberClosing: Record<string, number>;
  total: number;
  closing: number;
  closingMetaAds: number;
}

export interface LeadsTotals {
  perSumber: Record<string, number>;
  total: number;
  closing: number;
  closingMetaAds: number;
}

export interface LeadsSummary {
  month: string;
  monthLabel: string;
  periodLabel: string;
  running: boolean;
  periodStart: string;
  periodEnd: string;
  dayCount: number;
  totals: LeadsTotals;
  conversion: number;
  averagePerDay: number;
  sources: { name: string; count: number; pct: number }[];
  topSource: string;
  highlights: string[];
  peakLeadsDate: string | null;
  peakClosingDate: string | null;
  peakLeads: number;
  peakClosing: number;
}

export const REPORT_SOURCES = ["Meta ads", "WA", "IG", "Website"] as const;

/** Nama tampilan sumber untuk laporan formal. */
const SOURCE_LABEL: Record<string, string> = {
  "Meta ads": "Meta Ads",
  WA: "WhatsApp",
  IG: "Instagram",
  Website: "Website",
};

const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const MONTHS_ID_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const DAY_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

const pad = (n: number) => String(n).padStart(2, "0");
export const nfmt = (n: number) => n.toLocaleString("id-ID");

export function tanggalID(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return iso || "-";
  return `${Number(m[3])} ${MONTHS_ID[Number(m[2]) - 1] || m[2]} ${m[1]}`;
}

export function todayWib(now: Date = new Date()): string {
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return `${wib.getUTCFullYear()}-${pad(wib.getUTCMonth() + 1)}-${pad(wib.getUTCDate())}`;
}

/** "14 Oktober 2026, 16.04 WIB" */
export function generatedAtID(now: Date): string {
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return `${wib.getUTCDate()} ${MONTHS_ID[wib.getUTCMonth()]} ${wib.getUTCFullYear()}, ${pad(wib.getUTCHours())}.${pad(wib.getUTCMinutes())} WIB`;
}

export function buildDailyRows(leads: LeadRow[]): DailyLeadRow[] {
  const map: Record<string, DailyLeadRow> = {};
  for (const lead of leads) {
    const tanggal = String(lead?.tanggal || "");
    if (!tanggal) continue;
    if (!map[tanggal]) {
      map[tanggal] = { tanggal, perSumber: {}, perSumberClosing: {}, total: 0, closing: 0, closingMetaAds: 0 };
    }
    const row = map[tanggal];
    const sumber = String(lead.sumber ?? "");
    row.perSumber[sumber] = (row.perSumber[sumber] || 0) + 1;
    row.total += 1;
    if (lead.status === "closing") {
      row.closing += 1;
      row.perSumberClosing[sumber] = (row.perSumberClosing[sumber] || 0) + 1;
      if (sumber === "Meta ads") row.closingMetaAds += 1;
    }
  }
  return Object.values(map).sort((a, b) => a.tanggal.localeCompare(b.tanggal));
}

export function buildTotals(rows: DailyLeadRow[]): LeadsTotals {
  const totals: LeadsTotals = { perSumber: {}, total: 0, closing: 0, closingMetaAds: 0 };
  for (const row of rows) {
    for (const s of REPORT_SOURCES) {
      totals.perSumber[s] = (totals.perSumber[s] || 0) + (row.perSumber[s] || 0);
    }
    totals.total += row.total;
    totals.closing += row.closing;
    totals.closingMetaAds += row.closingMetaAds;
  }
  return totals;
}

export interface LeadsReportInput {
  month: string;
  leads: LeadRow[];
  now?: Date;
}

export function summarizeLeadsReport({ month, leads, now = new Date() }: LeadsReportInput): LeadsSummary {
  const m = /^(\d{4})-(\d{2})$/.exec(month || "");
  const year = m ? Number(m[1]) : now.getFullYear();
  const monthIdx = m ? Number(m[2]) - 1 : now.getMonth();
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const monthLabel = `${MONTHS_ID[monthIdx]} ${year}`;
  const first = `${year}-${pad(monthIdx + 1)}-01`;
  const last = `${year}-${pad(monthIdx + 1)}-${pad(daysInMonth)}`;

  const today = todayWib(now);
  const currentMonth = today.slice(0, 7) === `${year}-${pad(monthIdx + 1)}`;
  const inMonth = (leads || []).filter((l) => String(l?.tanggal || "").slice(0, 7) === `${year}-${pad(monthIdx + 1)}`);
  const dailyRows = buildDailyRows(inMonth);

  let periodEnd = last;
  let running = false;
  if (currentMonth) {
    running = true;
    const lastDataDate = dailyRows.length > 0 ? dailyRows[dailyRows.length - 1].tanggal : null;
    periodEnd = lastDataDate ? (lastDataDate < today ? lastDataDate : today) : today;
  }

  const dayCount = Number(periodEnd.slice(8, 10));
  const rowsInPeriod = dailyRows.filter((r) => r.tanggal >= first && r.tanggal <= periodEnd);
  const totals = buildTotals(rowsInPeriod);

  const conversion = totals.total > 0 ? (totals.closing / totals.total) * 100 : 0;
  const averagePerDay = dayCount > 0 ? totals.total / dayCount : 0;

  const sources = REPORT_SOURCES.map((name) => ({
    name,
    count: totals.perSumber[name] || 0,
    pct: totals.total > 0 ? ((totals.perSumber[name] || 0) / totals.total) * 100 : 0,
  })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const topSource = sources[0]?.name || "-";
  const peakLeads = rowsInPeriod.reduce<DailyLeadRow | null>((best, r) => (!best || r.total > best.total ? r : best), null);
  const peakClosing = rowsInPeriod.reduce<DailyLeadRow | null>((best, r) => (!best || r.closing > best.closing ? r : best), null);
  const peakLeadsDate = peakLeads && peakLeads.total > 0 ? peakLeads.tanggal : null;
  const peakClosingDate = peakClosing && peakClosing.closing > 0 ? peakClosing.tanggal : null;

  const highlights: string[] = [];
  highlights.push(
    peakLeadsDate
      ? `Leads terbanyak: ${tanggalID(peakLeadsDate)} dengan ${nfmt(peakLeads!.total)} leads.`
      : "Belum ada leads pada periode ini."
  );
  highlights.push(
    peakClosingDate
      ? `Closing terbanyak: ${tanggalID(peakClosingDate)} dengan ${nfmt(peakClosing!.closing)} closing.`
      : "Belum ada closing pada periode ini."
  );
  highlights.push(
    (sources[0]?.count || 0) > 0
      ? `Sumber terbesar: ${SOURCE_LABEL[topSource] || topSource} dengan ${nfmt(sources[0].count)} leads (${sources[0].pct.toFixed(1)}%).`
      : "Sumber leads belum ada datanya pada periode ini."
  );

  const periodLabel = running
    ? `${Number(first.slice(8, 10))} sampai ${Number(periodEnd.slice(8, 10))} ${MONTHS_ID[monthIdx]} ${year}`
    : monthLabel;

  return {
    month: `${year}-${pad(monthIdx + 1)}`,
    monthLabel,
    periodLabel,
    running,
    periodStart: first,
    periodEnd,
    dayCount,
    totals,
    conversion,
    averagePerDay,
    sources,
    topSource,
    highlights,
    peakLeadsDate,
    peakClosingDate,
    peakLeads: peakLeads?.total || 0,
    peakClosing: peakClosing?.closing || 0,
  };
}

export function summaryText(summary: LeadsSummary): string {
  return [
    `Laporan Leads SAMAQU — ${summary.monthLabel}`,
    `Total leads: ${nfmt(summary.totals.total)}`,
    `Total closing: ${nfmt(summary.totals.closing)}`,
    `Konversi: ${summary.conversion.toFixed(1)}%`,
    `Sumber terbesar: ${SOURCE_LABEL[summary.topSource] || summary.topSource} (${nfmt(summary.sources[0]?.count || 0)})`,
  ].join("\n");
}

export function reportFileName(summary: LeadsSummary): string {
  const [y, mm] = summary.month.split("-");
  return `Laporan-Leads-SAMAQU-${MONTHS_ID[Number(mm) - 1]}-${y}.pdf`;
}

/* ────────────────────────────── tipografi & palet ────────────────────────────── */

export const PAGE_W = 595.28;
export const PAGE_H = 841.89;
export const MARGIN = 44;
export const CW = PAGE_W - MARGIN * 2; // 507.28
export const FOOTER_Y = 30;
export const FOOTER_TOP = FOOTER_Y + 32; // batas bawah konten

// Palet selaras halaman web /ops/leads/laporan: sky (leads) + orange (closing) di atas slate.
export const NAVY = "#0f172a";
export const INK = "#0f172a";
export const TEXT = "#334155";
export const SUB = "#64748b";
export const FAINT = "#94a3b8";
export const LINE = "#e2e8f0";
export const SOFT = "#f8fafc";
export const TRACK = "#eef2f6";
export const SKY = "#0ea5e9";
export const SKY_SOFT = "#e0f2fe";
export const ORANGE = "#f97316";
export const ORANGE_SOFT = "#ffedd5";
export const GREEN = "#16a34a";
export const GREEN_SOFT = "#dcfce7";

/** Warna per sumber leads (dipakai di bar sumber). */
const SOURCE_COLOR: Record<string, string> = {
  "Meta ads": "#3b82f6",
  WA: "#10b981",
  IG: "#ec4899",
  Website: "#6366f1",
};

export const hex = (h: string) => {
  const s = h.replace("#", "");
  return rgb(parseInt(s.slice(0, 2), 16) / 255, parseInt(s.slice(2, 4), 16) / 255, parseInt(s.slice(4, 6), 16) / 255);
};

export interface ReportFonts {
  regular: Uint8Array | ArrayBuffer;
  bold: Uint8Array | ArrayBuffer;
}

/** Font Inter di-embed dari repo (bukan font bawaan PDF viewer). */
export function loadReportFonts(): ReportFonts {
  const dir = path.join(process.cwd(), "src", "assets", "fonts");
  return {
    regular: fs.readFileSync(path.join(dir, "Inter-Regular.ttf")),
    bold: fs.readFileSync(path.join(dir, "Inter-SemiBold.ttf")),
  };
}

export interface Ctx {
  doc: PDFDocument;
  regular: PDFFont;
  bold: PDFFont;
  page: PDFPage;
  y: number;
}

/** Persegi panjang sudut membulat (r = radius). `y` = sisi BAWAH, seperti drawRectangle. */
export function rrect(
  page: PDFPage,
  o: { x: number; y: number; w: number; h: number; r?: number; fill?: string; border?: string; borderWidth?: number }
) {
  const r = Math.max(0, Math.min(o.r ?? 0, o.w / 2, o.h / 2));
  const bw = o.border ? o.borderWidth ?? 0.7 : 0;
  if (r === 0) {
    page.drawRectangle({
      x: o.x,
      y: o.y,
      width: o.w,
      height: o.h,
      color: o.fill ? hex(o.fill) : undefined,
      borderColor: o.border ? hex(o.border) : undefined,
      borderWidth: bw,
    });
    return;
  }
  const { w, h } = o;
  // drawSvgPath: titik asal di kiri-ATAS, sumbu y ke bawah → y yang dikirim = sisi atas.
  const d =
    `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} ` +
    `H ${r} A ${r} ${r} 0 0 1 0 ${h - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
  page.drawSvgPath(d, {
    x: o.x,
    y: o.y + o.h,
    color: o.fill ? hex(o.fill) : undefined,
    borderColor: o.border ? hex(o.border) : undefined,
    borderWidth: bw,
  });
}

export function hline(page: PDFPage, y: number, x1 = MARGIN, x2 = MARGIN + CW, color = LINE, thickness = 0.6) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color: hex(color) });
}

export function text(page: PDFPage, font: PDFFont, value: string, o: { x: number; y: number; size?: number; color?: string }) {
  page.drawText(value, { x: o.x, y: o.y, size: o.size ?? 10, font, color: hex(o.color ?? INK) });
}

export function textRight(page: PDFPage, font: PDFFont, value: string, o: { right: number; y: number; size?: number; color?: string }) {
  const size = o.size ?? 10;
  page.drawText(value, { x: o.right - font.widthOfTextAtSize(value, size), y: o.y, size, font, color: hex(o.color ?? INK) });
}

export function textCenter(page: PDFPage, font: PDFFont, value: string, o: { center: number; y: number; size?: number; color?: string }) {
  const size = o.size ?? 10;
  page.drawText(value, { x: o.center - font.widthOfTextAtSize(value, size) / 2, y: o.y, size, font, color: hex(o.color ?? INK) });
}

/** Perkecil ukuran huruf sampai teks muat di lebar `max`. */
export function fitSize(font: PDFFont, value: string, max: number, start: number, min = 6): number {
  let size = start;
  while (size > min && font.widthOfTextAtSize(value, size) > max) size -= 0.25;
  return size;
}

export function wrap(value: string, font: PDFFont, size: number, maxWidth: number): string[] {
  // Normalisasi spasi tak biasa (NBSP / narrow no-break space dari toLocaleString).
  const clean = String(value).replace(/[    ⁠]/g, " ").replace(/\s+/g, " ").trim();
  // Batas aman 6%: sebagian glyph (tanda hubung panjang / tanda kurung) diukur lebih kecil
  // oleh fontkit daripada lebar gambar sebenarnya, jadi jangan pas-pasan.
  const limit = maxWidth * 0.94;
  const words = clean.split(" ");
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(candidate, size) <= limit) {
      line = candidate;
      continue;
    }
    if (line) out.push(line);
    if (font.widthOfTextAtSize(w, size) > limit) {
      let chunk = "";
      for (const ch of w) {
        if (font.widthOfTextAtSize(chunk + ch, size) <= limit) chunk += ch;
        else {
          out.push(chunk);
          chunk = ch;
        }
      }
      line = chunk;
    } else {
      line = w;
    }
  }
  if (line) out.push(line);
  return out;
}

/** Judul bagian: balok aksen sky di kiri + teks tebal. */
export function sectionTitle(ctx: Ctx, title: string, sub?: string) {
  rrect(ctx.page, { x: MARGIN, y: ctx.y - 3, w: 3, h: 13, r: 1.5, fill: SKY });
  text(ctx.page, ctx.bold, title, { x: MARGIN + 10, y: ctx.y, size: 11.5, color: INK });
  if (sub) textRight(ctx.page, ctx.regular, sub, { right: MARGIN + CW, y: ctx.y + 0.5, size: 8, color: FAINT });
  ctx.y -= 20;
}

/* ────────────────────────────── blok halaman 1 ────────────────────────────── */

const BAND_H = 96;

export function drawBand(page: PDFPage, regular: PDFFont, bold: PDFFont, o: { title: string; line: string; generatedAt: string; pill?: string }) {
  const top = PAGE_H;
  const bottom = PAGE_H - BAND_H;
  rrect(page, { x: 0, y: bottom, w: PAGE_W, h: BAND_H, fill: NAVY });
  // garis aksen di tepi bawah band
  rrect(page, { x: 0, y: bottom, w: PAGE_W, h: 3, fill: SKY });
  rrect(page, { x: 0, y: bottom, w: MARGIN + 46, h: 3, fill: ORANGE });

  text(page, bold, "SAMAQU", { x: MARGIN, y: top - 30, size: 12, color: "#ffffff" });
  const wm = bold.widthOfTextAtSize("SAMAQU", 12);
  text(page, regular, "LAPORAN INTERNAL", { x: MARGIN + wm + 9, y: top - 29.5, size: 7, color: "#7dd3fc" });
  textRight(page, regular, `Dibuat ${o.generatedAt}`, { right: MARGIN + CW, y: top - 29.5, size: 7.5, color: FAINT });

  text(page, bold, o.title, { x: MARGIN, y: top - 62, size: 23, color: "#ffffff" });
  text(page, regular, o.line, { x: MARGIN, y: top - 80, size: 9.5, color: "#cbd5e1" });

  if (o.pill) {
    const size = 7;
    const w = bold.widthOfTextAtSize(o.pill, size) + 18;
    rrect(page, { x: MARGIN + CW - w, y: top - 66, w, h: 17, r: 8.5, fill: ORANGE });
    textCenter(page, bold, o.pill, { center: MARGIN + CW - w / 2, y: top - 61, size, color: "#ffffff" });
  }
}

function drawKpi(ctx: Ctx, summary: LeadsSummary) {
  const page = ctx.page;
  const cards = [
    { label: "Total leads", value: nfmt(summary.totals.total), note: `${summary.dayCount} hari periode`, fill: SKY, ink: "#ffffff", sub: "#e0f2fe" },
    { label: "Total closing", value: nfmt(summary.totals.closing), note: "status closing", fill: ORANGE, ink: "#ffffff", sub: "#ffedd5" },
    { label: "Tingkat konversi", value: `${summary.conversion.toFixed(1)}%`, note: "closing ÷ leads", fill: SOFT, ink: INK, sub: SUB },
    { label: "Closing Meta Ads", value: nfmt(summary.totals.closingMetaAds), note: "dari total closing", fill: SOFT, ink: INK, sub: SUB },
    { label: "Rata-rata per hari", value: summary.averagePerDay.toFixed(1), note: "leads per hari", fill: SOFT, ink: INK, sub: SUB },
  ];
  const gap = 7;
  const w = (CW - gap * (cards.length - 1)) / cards.length;
  const h = 68;
  cards.forEach((c, i) => {
    const x = MARGIN + i * (w + gap);
    const y = ctx.y - h;
    const hero = c.fill === SKY || c.fill === ORANGE;
    rrect(page, { x, y, w, h, r: 10, fill: c.fill, border: hero ? undefined : LINE });
    const labelSize = fitSize(ctx.regular, c.label, w - 22, 7.6);
    text(page, ctx.regular, c.label, { x: x + 11, y: y + h - 18, size: labelSize, color: c.sub });
    const valueSize = fitSize(ctx.bold, c.value, w - 22, 22, 12);
    text(page, ctx.bold, c.value, { x: x + 11, y: y + h - 42, size: valueSize, color: c.ink });
    text(page, ctx.regular, c.note, { x: x + 11, y: y + 10, size: 7, color: c.sub });
  });
  ctx.y -= h;
}

function drawSourceRows(ctx: Ctx, summary: LeadsSummary) {
  const page = ctx.page;
  const rowH = 22;
  const max = Math.max(1, ...summary.sources.map((s) => s.count));
  const barX = MARGIN + 130;
  const barW = 200;
  const numRight = MARGIN + CW - 64;
  const pctRight = MARGIN + CW - 4;

  summary.sources.forEach((s) => {
    const mid = ctx.y - rowH / 2;
    const color = SOURCE_COLOR[s.name] || SKY;
    page.drawCircle({ x: MARGIN + 6, y: mid, size: 3.2, color: hex(color) });
    text(page, ctx.regular, SOURCE_LABEL[s.name] || s.name, { x: MARGIN + 18, y: mid - 3.5, size: 10, color: INK });
    rrect(page, { x: barX, y: mid - 3.5, w: barW, h: 7, r: 3.5, fill: TRACK });
    const fillW = (s.count / max) * barW;
    if (fillW > 0) rrect(page, { x: barX, y: mid - 3.5, w: Math.max(fillW, 7), h: 7, r: 3.5, fill: color });
    textRight(page, ctx.bold, nfmt(s.count), { right: numRight, y: mid - 3.5, size: 10, color: INK });
    textRight(page, ctx.regular, `${s.pct.toFixed(1)}%`, { right: pctRight, y: mid - 3.5, size: 9.5, color: SUB });
    ctx.y -= rowH;
    hline(page, ctx.y, MARGIN, MARGIN + CW, "#f1f5f9", 0.6);
  });

  const sum = summary.sources.reduce((t, s) => t + s.count, 0);
  const mid = ctx.y - rowH / 2;
  text(page, ctx.bold, "Total sumber", { x: MARGIN + 18, y: mid - 3.5, size: 10, color: INK });
  textRight(page, ctx.bold, nfmt(sum), { right: numRight, y: mid - 3.5, size: 10, color: INK });
  textRight(page, ctx.regular, "100,0%", { right: pctRight, y: mid - 3.5, size: 9.5, color: SUB });
  ctx.y -= rowH;
}

function weeklyBlocks(rows: DailyLeadRow[]) {
  const out: { label: string; days: number; total: number; closing: number; rate: number; partial: boolean }[] = [];
  for (let i = 0; i < rows.length; i += 7) {
    const chunk = rows.slice(i, i + 7);
    if (chunk.length === 0) continue;
    const total = chunk.reduce((s, r) => s + r.total, 0);
    const closing = chunk.reduce((s, r) => s + r.closing, 0);
    const a = Number(chunk[0].tanggal.slice(8, 10));
    const b = Number(chunk[chunk.length - 1].tanggal.slice(8, 10));
    const month = MONTHS_ID_SHORT[Number(chunk[0].tanggal.slice(5, 7)) - 1];
    out.push({
      label: a === b ? `${a} ${month}` : `${a}-${b} ${month}`,
      days: chunk.length,
      total,
      closing,
      rate: total > 0 ? (closing / total) * 100 : 0,
      partial: chunk.length < 7,
    });
  }
  return out;
}

function drawWeeklyTable(ctx: Ctx, rows: DailyLeadRow[]) {
  const page = ctx.page;
  const blocks = weeklyBlocks(rows);
  const cols = {
    periode: MARGIN + 4,
    hari: MARGIN + 100,
    leadsNum: MARGIN + 214,
    barX: MARGIN + 226,
    barW: 110,
    closing: MARGIN + 398,
    rateRight: MARGIN + CW - 4,
  };

  const headY = ctx.y;
  const label = (v: string, x: number, right = false) => {
    const o = { y: headY, size: 7.2, color: FAINT };
    if (right) textRight(page, ctx.regular, v, { ...o, right: x });
    else text(page, ctx.regular, v, { ...o, x });
  };
  label("PERIODE", cols.periode);
  label("HARI", cols.hari);
  label("LEADS", cols.leadsNum, true);
  label("CLOSING", cols.closing, true);
  label("KONVERSI", cols.rateRight, true);
  ctx.y -= 7;
  hline(page, ctx.y, MARGIN, MARGIN + CW, LINE, 0.8);

  if (blocks.length === 0) {
    text(page, ctx.regular, "Belum ada data pada periode ini.", { x: cols.periode, y: ctx.y - 16, size: 10, color: SUB });
    ctx.y -= 24;
    return;
  }

  const rowH = 21;
  const maxLeads = Math.max(1, ...blocks.map((b) => b.total));
  const fullBlocks = blocks.filter((b) => !b.partial);
  const bestRate = fullBlocks.length > 1 ? Math.max(...fullBlocks.map((b) => b.rate)) : -1;

  blocks.forEach((b) => {
    const mid = ctx.y - rowH / 2;
    const base = mid - 3.5;
    text(page, ctx.regular, b.label, { x: cols.periode, y: base, size: 9.5, color: INK });
    text(page, ctx.regular, b.partial ? `${b.days} (sebagian)` : String(b.days), { x: cols.hari, y: base, size: 9.5, color: SUB });
    textRight(page, ctx.bold, nfmt(b.total), { right: cols.leadsNum, y: base, size: 9.5, color: INK });
    rrect(page, { x: cols.barX, y: mid - 3, w: cols.barW, h: 6, r: 3, fill: TRACK });
    const fw = (b.total / maxLeads) * cols.barW;
    if (fw > 0) rrect(page, { x: cols.barX, y: mid - 3, w: Math.max(fw, 6), h: 6, r: 3, fill: SKY });
    textRight(page, ctx.regular, nfmt(b.closing), { right: cols.closing, y: base, size: 9.5, color: INK });

    const rateText = `${b.rate.toFixed(1)}%`;
    const best = bestRate >= 0 && !b.partial && b.rate === bestRate;
    const pw = Math.max(40, ctx.bold.widthOfTextAtSize(rateText, 8.5) + 14);
    rrect(page, { x: cols.rateRight - pw, y: mid - 8, w: pw, h: 16, r: 8, fill: best ? GREEN_SOFT : "#f1f5f9" });
    textCenter(page, ctx.bold, rateText, { center: cols.rateRight - pw / 2, y: base + 0.5, size: 8.5, color: best ? GREEN : TEXT });

    ctx.y -= rowH;
    hline(page, ctx.y, MARGIN, MARGIN + CW, "#f1f5f9", 0.6);
  });
}

function highlightLines(summary: LeadsSummary, rows: DailyLeadRow[]): string[] {
  const blocks = weeklyBlocks(rows);
  const lines = [...summary.highlights];
  if (blocks.length >= 2) {
    const a = blocks[blocks.length - 2];
    const b = blocks[blocks.length - 1];
    const diff = b.total - a.total;
    const pct = a.total > 0 ? (diff / a.total) * 100 : 0;
    lines.push(
      `Perbandingan dua blok terakhir: ${a.label} ${nfmt(a.total)} leads (konversi ${a.rate.toFixed(1)}%) dan ${b.label} ${nfmt(b.total)} leads (konversi ${b.rate.toFixed(1)}%). Selisih ${diff >= 0 ? "+" : "-"}${nfmt(Math.abs(diff))} leads (${pct >= 0 ? "+" : "-"}${Math.abs(pct).toFixed(1)}%).`
    );
  } else if (blocks.length === 1) {
    lines.push(`Periode ini hanya mencakup satu blok mingguan (${blocks[0].label}) sehingga belum ada pembanding.`);
  }
  return lines;
}

function analysisNote(summary: LeadsSummary, rows: DailyLeadRow[]): string[] {
  const blocks = weeklyBlocks(rows);
  const out: string[] = [];
  if (summary.totals.total === 0) {
    out.push("Tidak ada leads tercatat pada periode ini, sehingga belum ada angka yang bisa dianalisis.");
    return out;
  }
  out.push(
    `Fakta: ${nfmt(summary.totals.total)} leads masuk dengan ${nfmt(summary.totals.closing)} closing (konversi ${summary.conversion.toFixed(1)}%), rata-rata ${summary.averagePerDay.toFixed(1)} leads per hari.`
  );
  if (blocks.length >= 2) {
    const a = blocks[blocks.length - 2];
    const b = blocks[blocks.length - 1];
    const dLeads = b.total - a.total;
    const dClose = b.closing - a.closing;
    out.push(
      `${b.label} dibanding ${a.label}: leads ${dLeads >= 0 ? "naik" : "turun"} ${nfmt(Math.abs(dLeads))}, closing ${dClose >= 0 ? "naik" : "turun"} ${nfmt(Math.abs(dClose))}.`
    );
  }
  out.push(
    "Catatan: bagian ini hanya memuat perbandingan angka dari data yang sama. Belum ada analisis penyebab karena tidak ada data pendukung lain di laporan ini."
  );
  return out;
}

/** Kartu "Sorotan periode": daftar poin di dalam kotak lembut. Mengembalikan tinggi yang dipakai. */
const HL_SIZE = 9;
const HL_LEAD = 12.5;
function highlightsHeight(lines: string[], font: PDFFont): number {
  const n = lines.reduce((t, l) => t + wrap(l, font, HL_SIZE, CW - 44).length, 0);
  return n * HL_LEAD + (lines.length - 1) * 3 + 22;
}

function drawHighlights(ctx: Ctx, lines: string[]) {
  const page = ctx.page;
  const h = highlightsHeight(lines, ctx.regular);
  rrect(page, { x: MARGIN, y: ctx.y - h, w: CW, h, r: 10, fill: SOFT, border: LINE });
  let y = ctx.y - 14;
  lines.forEach((line, idx) => {
    page.drawCircle({ x: MARGIN + 16, y: y + 3.2, size: 2, color: hex(idx === 1 ? ORANGE : SKY) });
    wrap(line, ctx.regular, HL_SIZE, CW - 44).forEach((l) => {
      text(page, ctx.regular, l, { x: MARGIN + 26, y, size: HL_SIZE, color: TEXT });
      y -= HL_LEAD;
    });
    y -= 3;
  });
  ctx.y -= h;
}

/* ────────────────────────────── grafik tren harian ────────────────────────────── */

function niceStep(max: number): number {
  const raw = Math.max(1, max) / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return Math.max(1, step * mag); // sumbu hitungan bulat: tidak ada tanda 0,5 leads
}

const CHART_H = 130;

function drawTrendChart(ctx: Ctx, rows: DailyLeadRow[], chartH = CHART_H) {
  const page = ctx.page;
  const x0 = MARGIN;
  const y0 = ctx.y - chartH;
  rrect(page, { x: x0, y: y0, w: CW, h: chartH, r: 12, fill: "#ffffff", border: LINE });

  text(page, ctx.bold, "Tren harian", { x: x0 + 16, y: ctx.y - 22, size: 10.5, color: INK });
  text(page, ctx.regular, "Leads dan closing per hari", { x: x0 + 16 + ctx.bold.widthOfTextAtSize("Tren harian", 10.5) + 8, y: ctx.y - 21.5, size: 8, color: FAINT });

  // legenda (kanan atas)
  const lg = (label: string, color: string, right: number) => {
    const wLabel = ctx.regular.widthOfTextAtSize(label, 8);
    textRight(page, ctx.regular, label, { right, y: ctx.y - 21.5, size: 8, color: SUB });
    rrect(page, { x: right - wLabel - 12, y: ctx.y - 22, w: 8, h: 8, r: 2.5, fill: color });
    return right - wLabel - 12 - 12;
  };
  const next = lg("Closing", ORANGE, x0 + CW - 16);
  lg("Leads", SKY, next);

  const plotL = x0 + 16 + 20;
  const plotR = x0 + CW - 16;
  const plotT = ctx.y - 40;
  const plotB = y0 + 24;
  const plotH = plotT - plotB;
  const plotW = plotR - plotL;

  const maxVal = Math.max(1, ...rows.map((r) => Math.max(r.total, r.closing)));
  const step = niceStep(maxVal);
  const top = step * Math.ceil(maxVal / step);
  const yOf = (v: number) => plotB + (v / top) * plotH;

  for (let v = 0; v <= top + 0.001; v += step) {
    const y = yOf(v);
    hline(page, y, plotL, plotR, v === 0 ? "#cbd5e1" : "#eef2f6", v === 0 ? 0.8 : 0.5);
    textRight(page, ctx.regular, String(v), { right: plotL - 6, y: y - 2.5, size: 6.5, color: FAINT });
  }

  const n = Math.max(1, rows.length);
  const slot = plotW / n;
  const barW = Math.min(8, slot * 0.34);
  const labelEvery = slot >= 14 ? 1 : 2;
  rows.forEach((r, i) => {
    const cx = plotL + slot * i + slot / 2;
    const draw = (v: number, color: string, x: number) => {
      if (v <= 0) return;
      const h = yOf(v) - plotB;
      if (h >= 3) rrect(page, { x, y: plotB, w: barW, h, r: Math.min(2, barW / 2), fill: color });
      else rrect(page, { x, y: plotB, w: barW, h: Math.max(h, 1), fill: color });
    };
    draw(r.total, SKY, cx - barW - 0.5);
    draw(r.closing, ORANGE, cx + 0.5);
    if (i % labelEvery === 0) {
      textCenter(page, ctx.regular, String(Number(r.tanggal.slice(8, 10))), { center: cx, y: plotB - 11, size: 6.5, color: FAINT });
    }
  });

  ctx.y = y0;
}

/* ────────────────────────────── halaman 2: tabel harian ────────────────────────────── */

const COL_TANGGAL = 88;
const COL_SOURCE = 56;
const COL_TOTAL = 66;
const COL_CLOSING = 66;

function tableColumns() {
  const tanggal = MARGIN;
  const sources = REPORT_SOURCES.map((_, i) => tanggal + COL_TANGGAL + i * COL_SOURCE);
  const total = tanggal + COL_TANGGAL + REPORT_SOURCES.length * COL_SOURCE;
  const closing = total + COL_TOTAL;
  const closingMeta = closing + COL_CLOSING;
  return { tanggal, sources, total, closing, closingMeta };
}

function drawTableHeader(ctx: Ctx, h: number) {
  const page = ctx.page;
  const cols = tableColumns();
  const right = MARGIN + CW;
  rrect(page, { x: MARGIN, y: ctx.y - h, w: CW, h, r: 8, fill: NAVY });
  const o = { size: 7.6, color: "#e2e8f0" };
  text(page, ctx.bold, "Tanggal", { x: cols.tanggal + 12, y: ctx.y - h + h / 2 - 2.7, ...o });
  REPORT_SOURCES.forEach((s, i) => {
    textRight(page, ctx.bold, SOURCE_LABEL[s], { right: cols.sources[i] + COL_SOURCE - 8, y: ctx.y - h + h / 2 - 2.7, ...o });
  });
  const two = (l1: string, l2: string, r: number) => {
    textRight(page, ctx.bold, l1, { right: r, y: ctx.y - h + h / 2 + 1.5, ...o });
    textRight(page, ctx.bold, l2, { right: r, y: ctx.y - h + h / 2 - 7, ...o });
  };
  two("Total", "leads", cols.total + COL_TOTAL - 8);
  two("Total", "closing", cols.closing + COL_CLOSING - 8);
  two("Closing", "Meta Ads", right - 12);
  ctx.y -= h;
}

function drawTableRow(ctx: Ctx, row: DailyLeadRow, o: { zebra: boolean; rowH: number; total?: boolean }) {
  const page = ctx.page;
  const cols = tableColumns();
  const right = MARGIN + CW;
  const y = ctx.y - o.rowH;
  const size = o.rowH < 20 ? 8.5 : 9.5;
  const baseline = y + (o.rowH - size * 0.72) / 2;
  const dow = new Date(`${row.tanggal}T00:00:00Z`).getUTCDay();

  if (o.total) {
    rrect(page, { x: MARGIN, y, w: CW, h: o.rowH, r: 8, fill: SKY_SOFT });
  } else if (o.zebra) {
    rrect(page, { x: MARGIN, y, w: CW, h: o.rowH, fill: SOFT });
  }

  const font = o.total ? ctx.bold : ctx.regular;
  const num = (v: number, rightX: number, strong = false) =>
    textRight(page, strong || o.total ? ctx.bold : ctx.regular, nfmt(v), {
      right: rightX,
      y: baseline,
      size,
      color: !o.total && v === 0 ? "#cbd5e1" : INK,
    });

  if (o.total) {
    text(page, ctx.bold, "Total", { x: cols.tanggal + 12, y: baseline, size, color: INK });
  } else {
    const day = Number(row.tanggal.slice(8, 10));
    const label = `${day} ${MONTHS_ID_SHORT[Number(row.tanggal.slice(5, 7)) - 1]} · ${DAY_SHORT[dow]}`;
    text(page, ctx.regular, label, { x: cols.tanggal + 12, y: baseline, size, color: dow === 0 ? "#dc2626" : INK });
  }
  REPORT_SOURCES.forEach((s, i) => num(row.perSumber[s] || 0, cols.sources[i] + COL_SOURCE - 8));
  num(row.total, cols.total + COL_TOTAL - 8, true);
  num(row.closing, cols.closing + COL_CLOSING - 8, true);
  num(row.closingMetaAds, right - 12);
  void font;

  ctx.y = y;
}

/* ────────────────────────────── halaman Agent / Admin / dibantu Surya ────────────────────────────── */

/** Angka Agent dari AI Performance Center (`/api/ops/ai-performance` → `stats`), satu sumber dengan dashboard itu. */
export interface AgentStats {
  leadsFromChat?: number | null;
  closing?: number | null;
  nominal?: number | null;
}

export interface GroupStat {
  key: "agent" | "admin" | "helper";
  name: string;
  caption: string;
  color: string;
  leads: number;
  closing: number;
  nominal: number;
  shareClosing: number;
  shareNominal: number;
  /** Kelompok sisa: leads, konversi, dan rata-rata tidak punya pembagi yang adil, jadi tidak ditampilkan. */
  noLeads: boolean;
}

const AGENT_COLOR = SKY;
const HELPER_COLOR = "#475569";
/** Warna tiap admin (urut nominal). Admin baru otomatis kebagian warna berikutnya. */
const ADMIN_PALETTE = ["#f97316", "#14b8a6", "#e11d48", "#8b5cf6", "#eab308", "#22c55e", "#ec4899", "#6366f1"];
/** Nama orang yang menyelesaikan closing di luar Agent dan admin ber-PIC (sisa). Sama dengan halaman laporan. */
const HELPER_NAME = "Surya";

/**
 * Logika SAMA dengan `buildAgentAdminHelper` di halaman /ops/leads/laporan: Agent = AI Performance Center;
 * Admin = tiap nama PIC selain "Agent" (kolom `leads.pic`); Dibantu Surya = SISA closing dan nominal
 * (total dikurangi Agent dan semua admin).
 */
export function buildGroupStats(
  totals: { closing: number; nominal: number },
  ai: AgentStats,
  leads: LeadRow[]
): GroupStat[] {
  const agent = {
    leads: Number(ai?.leadsFromChat) || 0,
    closing: Number(ai?.closing) || 0,
    nominal: Number(ai?.nominal) || 0,
  };

  const byName = new Map<string, { name: string; leads: number; closing: number; nominal: number }>();
  for (const l of leads || []) {
    const name = String(l.pic ?? "").trim();
    if (!name || name.toLowerCase() === "agent") continue;
    const key = name.toLowerCase();
    if (!byName.has(key)) byName.set(key, { name, leads: 0, closing: 0, nominal: 0 });
    const row = byName.get(key)!;
    row.leads += 1;
    if (l.status === "closing") {
      row.closing += 1;
      row.nominal += Number(l.nominal) || 0;
    }
  }
  const admins = [...byName.values()].sort((a, b) => b.nominal - a.nominal || b.leads - a.leads);

  const adminClosing = admins.reduce((s, a) => s + a.closing, 0);
  const adminNominal = admins.reduce((s, a) => s + a.nominal, 0);
  const helper = {
    closing: Math.max(0, (Number(totals.closing) || 0) - agent.closing - adminClosing),
    nominal: Math.max(0, (Number(totals.nominal) || 0) - agent.nominal - adminNominal),
  };

  const totalClosing = agent.closing + adminClosing + helper.closing;
  const totalNominal = agent.nominal + adminNominal + helper.nominal;
  const share = (v: number, t: number) => (t > 0 ? (v / t) * 100 : 0);

  const out: GroupStat[] = [
    {
      key: "agent",
      name: "Agent",
      caption: "AI agent WhatsApp",
      color: AGENT_COLOR,
      ...agent,
      shareClosing: share(agent.closing, totalClosing),
      shareNominal: share(agent.nominal, totalNominal),
      noLeads: false,
    },
  ];
  admins.forEach((a, i) => {
    out.push({
      key: "admin",
      name: a.name,
      caption: "Admin · lead ber-PIC",
      color: ADMIN_PALETTE[i % ADMIN_PALETTE.length],
      leads: a.leads,
      closing: a.closing,
      nominal: a.nominal,
      shareClosing: share(a.closing, totalClosing),
      shareNominal: share(a.nominal, totalNominal),
      noLeads: false,
    });
  });
  out.push({
    key: "helper",
    name: `Dibantu ${HELPER_NAME}`,
    caption: "Sisa closing manual",
    color: HELPER_COLOR,
    leads: 0,
    closing: helper.closing,
    nominal: helper.nominal,
    shareClosing: share(helper.closing, totalClosing),
    shareNominal: share(helper.nominal, totalNominal),
    noLeads: true,
  });
  return out;
}

const rp = (n: number) => `Rp ${nfmt(Math.round(n))}`;
const pctText = (n: number) => `${n.toFixed(1)}%`;

const GROUP_CARD_H = 224;

/** Satu kartu kelompok: ikon inisial + nama, blok warna (closing + nominal penuh), bar share nominal, tiga baris info. */
function drawGroupCard(ctx: Ctx, g: GroupStat, x: number, top: number, w: number) {
  const page = ctx.page;
  const y = top - GROUP_CARD_H;
  const pad = 12;
  rrect(page, { x, y, w, h: GROUP_CARD_H, r: 12, fill: "#ffffff", border: LINE });

  // kepala: lingkaran inisial + nama + keterangan
  page.drawCircle({ x: x + pad + 12, y: top - pad - 12, size: 12, color: hex(g.color) });
  textCenter(page, ctx.bold, (g.key === "helper" ? HELPER_NAME : g.name).charAt(0).toUpperCase(), {
    center: x + pad + 12,
    y: top - pad - 15.5,
    size: 10,
    color: "#ffffff",
  });
  const nameX = x + pad + 30;
  const nameMax = w - pad * 2 - 30;
  text(page, ctx.bold, g.name, { x: nameX, y: top - pad - 9, size: fitSize(ctx.bold, g.name, nameMax, 10.5, 7), color: INK });
  text(page, ctx.regular, g.caption, { x: nameX, y: top - pad - 20, size: fitSize(ctx.regular, g.caption, nameMax, 7.5, 6), color: SUB });

  // blok warna
  const heroH = 74;
  const heroTop = top - pad - 34;
  const heroY = heroTop - heroH;
  rrect(page, { x: x + pad, y: heroY, w: w - pad * 2, h: heroH, r: 9, fill: g.color });
  text(page, ctx.bold, g.key === "helper" ? "CLOSING · ANGKA SISA" : "CLOSING", {
    x: x + pad + 10,
    y: heroTop - 15,
    size: fitSize(ctx.bold, "CLOSING · ANGKA SISA", w - pad * 2 - 62, 6.8, 5.5),
    color: "#ffffff",
  });
  // persen porsi closing (pil putih)
  const pill = pctText(g.shareClosing);
  const pw = ctx.bold.widthOfTextAtSize(pill, 7.5) + 12;
  rrect(page, { x: x + w - pad - 8 - pw, y: heroTop - 21, w: pw, h: 14, r: 7, fill: "#ffffff" });
  textCenter(page, ctx.bold, pill, { center: x + w - pad - 8 - pw / 2, y: heroTop - 17, size: 7.5, color: g.color });
  text(page, ctx.bold, nfmt(g.closing), { x: x + pad + 10, y: heroTop - 44, size: 26, color: "#ffffff" });
  const nom = rp(g.nominal);
  text(page, ctx.bold, nom, { x: x + pad + 10, y: heroTop - 62, size: fitSize(ctx.bold, nom, w - pad * 2 - 20, 11.5, 7.5), color: "#ffffff" });

  // share nominal
  let cy = heroY - 18;
  text(page, ctx.bold, "SHARE NOMINAL", { x: x + pad, y: cy, size: 6.5, color: SUB });
  textRight(page, ctx.bold, pctText(g.shareNominal), { right: x + w - pad, y: cy, size: 8, color: INK });
  cy -= 10;
  rrect(page, { x: x + pad, y: cy - 6, w: w - pad * 2, h: 6, r: 3, fill: TRACK });
  const fw = ((w - pad * 2) * Math.max(0, Math.min(100, g.shareNominal))) / 100;
  if (fw > 0) rrect(page, { x: x + pad, y: cy - 6, w: Math.max(fw, 6), h: 6, r: 3, fill: g.color });

  // tiga baris info
  const avg = g.closing > 0 ? g.nominal / g.closing : 0;
  const rows: [string, string][] = [
    ["Leads", g.noLeads ? "—" : nfmt(g.leads)],
    ["Konversi", g.noLeads ? "—" : pctText(g.leads > 0 ? (g.closing / g.leads) * 100 : 0)],
    ["Rata-rata", g.noLeads ? "—" : g.closing > 0 ? rp(avg) : "—"],
  ];
  cy -= 14;
  rows.forEach(([label, value], i) => {
    hline(page, cy + 4, x + pad, x + w - pad, "#f1f5f9", 0.6);
    text(page, ctx.regular, label, { x: x + pad, y: cy - 8, size: 8, color: SUB });
    textRight(page, ctx.bold, value, { right: x + w - pad, y: cy - 8, size: fitSize(ctx.bold, value, w - pad * 2 - 44, 9, 6.5), color: INK });
    cy -= 20;
    void i;
  });
}

/** Gambar seluruh halaman kelompok (judul band sudah digambar pemanggil). */
function drawGroupsPage(ctx: Ctx, groups: GroupStat[]) {
  const page = ctx.page;
  const totalClosing = groups.reduce((s, g) => s + g.closing, 0);
  const totalNominal = groups.reduce((s, g) => s + g.nominal, 0);

  // 1) bar porsi closing (bertumpuk) + legenda
  sectionTitle(ctx, "Porsi closing", `${nfmt(totalClosing)} closing · ${rp(totalNominal)}`);
  const barH = 14;
  const gapW = 2;
  const active = groups.filter((g) => g.closing > 0);
  const usable = CW - gapW * Math.max(0, active.length - 1);
  rrect(page, { x: MARGIN, y: ctx.y - barH, w: CW, h: barH, r: 7, fill: TRACK });
  let bx = MARGIN;
  active.forEach((g) => {
    const w = (g.closing / Math.max(1, totalClosing)) * usable;
    if (w > 0) rrect(page, { x: bx, y: ctx.y - barH, w, h: barH, r: Math.min(5, w / 2), fill: g.color });
    bx += w + gapW;
  });
  ctx.y -= barH + 16;
  let lx = MARGIN;
  groups.forEach((g) => {
    const label = `${g.name}  ${pctText(g.shareClosing)}`;
    const lw = ctx.regular.widthOfTextAtSize(label, 8.5) + 22;
    if (lx + lw > MARGIN + CW) return; // legenda tidak boleh melebar keluar halaman
    page.drawCircle({ x: lx + 3.5, y: ctx.y + 3, size: 3.2, color: hex(g.color) });
    text(page, ctx.regular, label, { x: lx + 12, y: ctx.y, size: 8.5, color: TEXT });
    lx += lw + 6;
  });
  ctx.y -= 26;

  // 2) kartu kelompok (maks 4 per baris)
  sectionTitle(ctx, "Rincian per kelompok");
  const perRow = Math.min(4, Math.max(1, groups.length));
  const gap = 10;
  const w = (CW - gap * (perRow - 1)) / perRow;
  for (let i = 0; i < groups.length; i += perRow) {
    groups.slice(i, i + perRow).forEach((g, j) => drawGroupCard(ctx, g, MARGIN + j * (w + gap), ctx.y, w));
    ctx.y -= GROUP_CARD_H + 12;
  }
  ctx.y -= 6;

  // 3) cara membaca angka
  sectionTitle(ctx, "Cara membaca angka ini");
  const notes = [
    `Persen di pojok kartu = porsi dari total closing (${nfmt(totalClosing)} closing, ${rp(totalNominal)}). "Share nominal" = porsi dari total nominal. Semua kartu menjumlah ke total halaman.`,
    'Agent: sama dengan AI Performance Center. "Leads" = lead yang nomornya ada di percakapan WhatsApp bulan ini (termasuk chat yang diambil alih); closing dan nominal hanya yang dicatat bot sendiri.',
    "Admin: dihitung dari kolom PIC lead. Admin baru muncul otomatis.",
    `Dibantu ${HELPER_NAME}: sisa closing (total dikurangi Agent dan admin), bukan hasil ukur, jadi leads, konversi, dan rata-ratanya tidak ditampilkan.`,
    "Konversi Agent dan admin memakai pembagi yang berbeda, jadi jangan dibandingkan langsung.",
  ];
  const lines = notes.map((n) => wrap(n, ctx.regular, 8.5, CW - 40));
  const h = lines.reduce((t, l) => t + l.length * 11.5 + 3, 0) + 20;
  rrect(page, { x: MARGIN, y: ctx.y - h, w: CW, h, r: 10, fill: SOFT, border: LINE });
  let ny = ctx.y - 16;
  lines.forEach((ls) => {
    page.drawCircle({ x: MARGIN + 15, y: ny + 3, size: 1.8, color: hex(SKY) });
    ls.forEach((l) => {
      text(page, ctx.regular, l, { x: MARGIN + 24, y: ny, size: 8.5, color: TEXT });
      ny -= 11.5;
    });
    ny -= 3;
  });
  ctx.y -= h;
}

/* ────────────────────────────── footer ────────────────────────────── */

export function drawFooters(doc: PDFDocument, regular: PDFFont, bold: PDFFont) {
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    hline(page, FOOTER_Y + 14, MARGIN, MARGIN + CW, LINE, 0.6);
    page.drawCircle({ x: MARGIN + 3, y: FOOTER_Y + 2.8, size: 2.2, color: hex(SKY) });
    page.drawText("SAMAQU Internal · rahasia", { x: MARGIN + 11, y: FOOTER_Y, size: 8, font: regular, color: hex(FAINT) });
    const t = `Halaman ${i + 1} dari ${pages.length}`;
    page.drawText(t, { x: MARGIN + CW - regular.widthOfTextAtSize(t, 8), y: FOOTER_Y, size: 8, font: regular, color: hex(FAINT) });
    void bold;
  });
}

/* ────────────────────────────── perakit laporan ────────────────────────────── */

export function tableRows(summary: LeadsSummary, dailyRows: DailyLeadRow[]): DailyLeadRow[] {
  const byDate = new Map(dailyRows.map((r) => [r.tanggal, r]));
  const out: DailyLeadRow[] = [];
  for (let day = 1; day <= summary.dayCount; day++) {
    const iso = `${summary.month}-${pad(day)}`;
    out.push(byDate.get(iso) || { tanggal: iso, perSumber: {}, perSumberClosing: {}, total: 0, closing: 0, closingMetaAds: 0 });
  }
  return out;
}

export interface BuiltLeadsReport {
  bytes: Uint8Array;
  summary: LeadsSummary & { dailyRowsInPeriod: DailyLeadRow[] };
  rows: DailyLeadRow[];
  pageCount: number;
}

export async function buildLeadsReportPdf(
  input: LeadsReportInput & { fonts?: ReportFonts; agent?: AgentStats | null }
): Promise<BuiltLeadsReport> {
  const now = input.now ?? new Date();
  const summary = summarizeLeadsReport({ month: input.month, leads: input.leads, now });
  const allDaily = buildDailyRows(input.leads || []).filter((r) => r.tanggal >= summary.periodStart && r.tanggal <= summary.periodEnd);
  const full = { ...summary, dailyRowsInPeriod: allDaily };
  const rows = tableRows(summary, allDaily);

  const fonts = input.fonts ?? loadReportFonts();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  // PENTING: subset TIDAK dipakai. Subsetting pdf-lib memutus sebagian glyph Inter
  // (huruf/angka hilang di hasil render), jadi font di-embed utuh — ukuran PDF tetap
  // di bawah 1 MB dan teksnya benar.
  const regular = await doc.embedFont(fonts.regular, { subset: false, features: { calt: false, ccmp: false } });
  const bold = await doc.embedFont(fonts.bold, { subset: false, features: { calt: false, ccmp: false } });

  /* ═══ Halaman 1 — ringkasan eksekutif ═══ */
  const ctx: Ctx = { doc, regular, bold, page: doc.addPage([PAGE_W, PAGE_H]), y: PAGE_H };
  drawBand(ctx.page, regular, bold, {
    title: "Laporan Leads dan Closing",
    line: `Periode ${summary.periodLabel}  ·  ${summary.dayCount} hari`,
    generatedAt: generatedAtID(now),
    pill: summary.running ? "DATA BERJALAN" : undefined,
  });
  ctx.y = PAGE_H - BAND_H - 20;

  const blocks = weeklyBlocks(allDaily);
  const highlights = [...highlightLines(summary, allDaily), ...analysisNote(summary, allDaily)];

  // Tinggi tiap bagian (dihitung di muka) supaya jarak antar bagian dibagi rata dan halaman 1 selalu seimbang.
  const titleH = 20;
  const kpiH = 68;
  const sourcesH = (summary.sources.length + 1) * 22;
  const weeklyH = 7 + 12 + Math.max(1, blocks.length) * 21;
  const hlH = highlightsHeight(highlights, regular);
  // Jarak tambahan tetap antar bagian (+10, -4, +6, +6) ikut dihitung; bila bulan punya banyak blok minggu / catatan panjang,
  // tinggi grafik tren diperkecil (minimal 112) supaya kartu sorotan tidak menabrak footer.
  const extras = 18;
  const minGap = 12;
  const fixed = kpiH + titleH + sourcesH + titleH + weeklyH + titleH + hlH + extras;
  const available = ctx.y - FOOTER_TOP;
  const chartH = Math.max(112, Math.min(CHART_H, available - fixed - minGap * 4));
  const gap = Math.max(minGap, Math.min(22, (available - fixed - chartH) / 4));

  drawKpi(ctx, summary);

  ctx.y -= gap + 10;
  sectionTitle(ctx, "Sumber leads", `${nfmt(summary.totals.total)} leads`);
  drawSourceRows(ctx, summary);

  ctx.y -= gap - 4;
  drawTrendChart(ctx, rows, chartH);

  ctx.y -= gap + 6;
  sectionTitle(ctx, "Perbandingan mingguan");
  drawWeeklyTable(ctx, allDaily);

  ctx.y -= gap + 6;
  sectionTitle(ctx, "Sorotan dan catatan analisis");
  drawHighlights(ctx, highlights);

  const slimBand = (title: string, sub: string) => {
    rrect(ctx.page, { x: 0, y: PAGE_H - 56, w: PAGE_W, h: 56, fill: NAVY });
    rrect(ctx.page, { x: 0, y: PAGE_H - 56, w: PAGE_W, h: 2.5, fill: SKY });
    rrect(ctx.page, { x: 0, y: PAGE_H - 56, w: MARGIN + 46, h: 2.5, fill: ORANGE });
    text(ctx.page, bold, title, { x: MARGIN, y: PAGE_H - 28, size: 15, color: "#ffffff" });
    text(ctx.page, regular, sub, { x: MARGIN, y: PAGE_H - 43, size: 8, color: "#cbd5e1" });
    textRight(ctx.page, bold, "SAMAQU", { right: MARGIN + CW, y: PAGE_H - 30, size: 10, color: "#ffffff" });
    ctx.y = PAGE_H - 56 - 18;
  };
  /* ═══ Halaman 2 — Agent / Admin / dibantu Surya (hanya bila angka AI Performance tersedia) ═══ */
  if (input.agent) {
    const periodLeads = (input.leads || []).filter((l) => l.tanggal >= summary.periodStart && l.tanggal <= summary.periodEnd);
    const nominalClosing = periodLeads.reduce((t, l) => (l.status === "closing" ? t + (Number(l.nominal) || 0) : t), 0);
    const groups = buildGroupStats({ closing: summary.totals.closing, nominal: nominalClosing }, input.agent, periodLeads);
    ctx.page = doc.addPage([PAGE_W, PAGE_H]);
    slimBand("Agent, Admin, dan dibantu Surya", `${summary.periodLabel}${summary.running ? " · data berjalan" : ""} · satu sumber dengan AI Performance Center`);
    drawGroupsPage(ctx, groups);
  }

  /* ═══ Halaman rekap data harian ═══ */
  ctx.page = doc.addPage([PAGE_W, PAGE_H]);
  slimBand("Rekap Data Harian", `${summary.periodLabel}${summary.running ? " · data berjalan" : ""} · ${summary.dayCount} hari`);

  const headH = 28;
  const notesBlock = 44;
  const availRows = ctx.y - headH - FOOTER_TOP - notesBlock - 10;
  const rowH = Math.max(18, Math.min(26, Math.floor(availRows / (Math.max(1, rows.length) + 1))));

  drawTableHeader(ctx, headH);
  ctx.y -= 2;
  const totals = summary.totals;
  const totalRow: DailyLeadRow = {
    tanggal: summary.periodEnd,
    perSumber: totals.perSumber,
    perSumberClosing: {},
    total: totals.total,
    closing: totals.closing,
    closingMetaAds: totals.closingMetaAds,
  };

  rows.forEach((row, i) => {
    const last = i === rows.length - 1;
    const needed = rowH + (last ? rowH + 6 : 0);
    if (ctx.y - needed < FOOTER_TOP) {
      ctx.page = doc.addPage([PAGE_W, PAGE_H]);
      slimBand("Rekap Data Harian (lanjutan)", `${summary.periodLabel}${summary.running ? " · data berjalan" : ""}`);
      drawTableHeader(ctx, headH);
      ctx.y -= 2;
    }
    drawTableRow(ctx, row, { zebra: i % 2 === 1, rowH });
  });

  if (ctx.y - rowH - 6 < FOOTER_TOP) {
    ctx.page = doc.addPage([PAGE_W, PAGE_H]);
    slimBand("Rekap Data Harian (lanjutan)", `${summary.periodLabel}${summary.running ? " · data berjalan" : ""}`);
    drawTableHeader(ctx, headH);
    ctx.y -= 2;
  }
  ctx.y -= 6;
  drawTableRow(ctx, totalRow, { zebra: false, rowH, total: true });

  // Catatan definisi & sumber data
  ctx.y -= 16;
  const notesText = [
    "Konversi = Total closing ÷ Total leads pada periode laporan. Closing Meta Ads = leads berstatus closing dengan sumber Meta Ads.",
    "Hari tanpa data tetap ditampilkan dengan angka 0. Sumber data: tabel leads pada dashboard internal SAMAQU (/ops/leads).",
  ];
  notesText.forEach((n) => {
    wrap(n, regular, 7.8, CW).forEach((l) => {
      text(ctx.page, regular, l, { x: MARGIN, y: ctx.y, size: 7.8, color: FAINT });
      ctx.y -= 10.5;
    });
  });

  drawFooters(doc, regular, bold);

  const bytes = await doc.save();
  return { bytes, summary: full, rows, pageCount: doc.getPageCount() };
}
