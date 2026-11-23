/**
 * PDF "Perbandingan Respons Bot vs Admin" (untuk dibawa ke Ardo). Ringkasan GABUNGAN tanpa nama per orang.
 * Memakai gaya dan pembantu gambar yang sama dengan PDF Laporan Leads dan Laporan Transaksi. Angka berasal dari
 * lib/sla.ts lewat lib/performa-data.ts (satu sumber dengan halaman Performa Admin).
 */

import { PDFDocument } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  CW,
  FAINT,
  FOOTER_TOP,
  GREEN,
  INK,
  LINE,
  MARGIN,
  NAVY,
  ORANGE,
  PAGE_H,
  PAGE_W,
  SKY,
  SOFT,
  SUB,
  TEXT,
  TRACK,
  drawBand,
  drawFooters,
  fitSize,
  generatedAtID,
  loadReportFonts,
  nfmt,
  rrect,
  sectionTitle,
  text,
  textRight,
  wrap,
  type Ctx,
  type ReportFonts,
} from "@/lib/leads-report-pdf";
import type { SlaConfig, SpeedStats, TeamSpeed } from "@/lib/sla";

export interface PerformaReportInput {
  from: string;
  to: string;
  config: SlaConfig;
  bot: SpeedStats;
  team: TeamSpeed;
  counts: { total: number; bot: number; panel: number; phone: number; unanswered: number; expired: number };
  fonts?: ReportFonts;
  now?: Date;
}

const MON = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MON[m - 1]} ${y}`;
};
export const periodLabel = (from: string, to: string) => (from === to ? dayLabel(from) : `${dayLabel(from)} – ${dayLabel(to)}`);

export function performaReportFileName(from: string, to: string): string {
  return `Perbandingan-Respons-Bot-vs-Admin-SAMAQU-${from === to ? from : `${from}_${to}`}.pdf`;
}

const idn = (v: number, d = 1) => v.toFixed(d).replace(".", ",");
/** Menit → "40 detik", "3,2 menit", "1 jam 05 menit". */
export function fmtDuration(min: number | null): string {
  if (min === null) return "—";
  if (min < 1) return `${Math.round(min * 60)} detik`;
  if (min < 60) return `${idn(min)} menit`;
  const h = Math.floor(min / 60);
  return `${h} jam ${String(Math.round(min - h * 60)).padStart(2, "0")} menit`;
}

const hoursText = (c: SlaConfig) => `${c.opDays.length === 7 ? "setiap hari" : c.opDays.map((d) => DAY_NAMES[d]).join(", ")} ${c.openTime.replace(":", ".")}–${c.closeTime.replace(":", ".")}`;

/** Kalimat kesimpulan yang mudah dipahami (diuji tanpa PDF). */
export function insightLines(i: Pick<PerformaReportInput, "config" | "bot" | "team" | "counts">): string[] {
  const out: string[] = [];
  const { bot, team, counts, config } = i;
  if (bot.count > 0) {
    out.push(`Bot menjawab ${nfmt(bot.count)} chat dengan kecepatan tengah ${fmtDuration(bot.medianMin)}. Sembilan dari sepuluh chat dijawab dalam ${fmtDuration(bot.p90Min)}.`);
  } else {
    out.push("Belum ada chat yang dijawab bot pada periode ini.");
  }
  if (team.count > 0) {
    out.push(
      `Admin menjawab ${nfmt(team.count)} chat lewat panel yang bisa diukur, dengan kecepatan tengah ${fmtDuration(team.medianMin)} (menit kerja). ${team.slaPct === null ? "" : `${idn(team.slaPct)}% tercapai target ${config.targetResponseMin} menit.`}`.trim(),
    );
  } else {
    out.push("Belum ada balasan admin lewat panel yang bisa diukur pada periode ini, sehingga kecepatan admin belum bisa dibandingkan.");
  }
  if (bot.medianMin !== null && team.medianMin !== null && bot.medianMin > 0) {
    const ratio = team.medianMin / bot.medianMin;
    out.push(ratio >= 1.5 ? `Pada kecepatan tengah, bot sekitar ${idn(ratio, ratio >= 10 ? 0 : 1)} kali lebih cepat dari admin.` : "Pada kecepatan tengah, bot dan admin relatif setara.");
  }
  if (counts.phone > 0) {
    out.push(`${nfmt(counts.phone)} chat dibalas admin lewat HP. Jam balasannya tidak diketahui, jadi tidak ikut dihitung kecepatannya.`);
  }
  return out;
}

export function methodNotes(c: SlaConfig): string[] {
  return [
    `Bot dihitung dalam menit biasa karena bekerja malam dan hari Minggu. Admin dihitung dalam menit kerja, yaitu hanya menit di jam operasional (${hoursText(c)}).`,
    "Bot dan admin bekerja di jam berbeda, jadi angka ini untuk gambaran umum, bukan lomba di chat yang sama.",
    "Beberapa pesan beruntun dari pelanggan yang sama dihitung satu kali, dari pesan pertama sampai balasan pertama.",
    "Chat yang masuk di luar jam operasional tidak dihitung dalam SLA admin (dijawab bot). Balasan admin dari HP dihitung selesai tetapi tidak diukur.",
    `Target SLA: balasan pertama dalam ${c.targetResponseMin} menit, warning setelah ${c.warningMin} menit, terlambat setelah ${c.lateMin} menit.`,
    "Ringkasan ini gabungan seluruh admin, tanpa nama per orang.",
  ];
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

export async function buildPerformaReportPdf(input: PerformaReportInput): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const now = input.now ?? new Date();
  const fonts = input.fonts ?? loadReportFonts();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(fonts.regular, { subset: false, features: { calt: false, ccmp: false } });
  const bold = await doc.embedFont(fonts.bold, { subset: false, features: { calt: false, ccmp: false } });

  const { bot, team, counts, config } = input;
  const period = periodLabel(input.from, input.to);
  const ctx: Ctx = { doc, regular, bold, page: doc.addPage([PAGE_W, PAGE_H]), y: PAGE_H };
  drawBand(ctx.page, regular, bold, {
    title: "Perbandingan Respons Bot vs Admin",
    line: `Periode ${period}  ·  ${nfmt(counts.total)} rangkaian chat dianalisis`,
    generatedAt: generatedAtID(now),
  });
  ctx.y = PAGE_H - 96 - 20;

  const ensure = (need: number) => {
    if (ctx.y - need >= FOOTER_TOP) return;
    ctx.page = doc.addPage([PAGE_W, PAGE_H]);
    slimBand(ctx, "Perbandingan Respons Bot vs Admin", period);
  };

  /* ─── 1. Kesimpulan ─── */
  sectionTitle(ctx, "Kesimpulan", period);
  {
    const lines = insightLines({ config, bot, team, counts });
    const size = 9.6;
    const lh = 13.5;
    const wrapped = lines.map((l) => wrap(l, regular, size, CW - 44));
    const rows = wrapped.reduce((t, w) => t + w.length, 0);
    const h = 18 + rows * lh + (lines.length - 1) * 5;
    ensure(h + 8);
    rrect(ctx.page, { x: MARGIN, y: ctx.y - h, w: CW, h, r: 10, fill: SOFT, border: LINE });
    let y = ctx.y - 20;
    wrapped.forEach((ws) => {
      rrect(ctx.page, { x: MARGIN + 12, y: y + 2.2, w: 4, h: 4, r: 2, fill: SKY });
      ws.forEach((l, i) => {
        text(ctx.page, regular, l, { x: MARGIN + 24, y: y - i * lh, size, color: TEXT });
      });
      y -= ws.length * lh + 5;
    });
    ctx.y -= h + 18;
  }

  /* ─── 2. Dua kartu ─── */
  {
    const h = 122;
    ensure(h + 24);
    const gap = 10;
    const w = (CW - gap) / 2;
    const card = (x: number, fill: string, sub: string, title: string, big: string, rows: [string, string][]) => {
      const y = ctx.y - h;
      rrect(ctx.page, { x, y, w, h, r: 12, fill });
      text(ctx.page, regular, title, { x: x + 14, y: y + h - 20, size: 8.4, color: sub });
      text(ctx.page, bold, big, { x: x + 14, y: y + h - 52, size: fitSize(bold, big, w - 28, 28, 14), color: "#ffffff" });
      text(ctx.page, regular, "kecepatan tengah (median) balasan pertama", { x: x + 14, y: y + h - 66, size: 7.6, color: sub });
      rows.forEach(([k, v], i) => {
        const ry = y + 38 - i * 13;
        text(ctx.page, regular, k, { x: x + 14, y: ry, size: 8, color: sub });
        textRight(ctx.page, bold, v, { right: x + w - 14, y: ry, size: 8.6, color: "#ffffff" });
      });
    };
    card(MARGIN, SKY, "#e0f2fe", "BOT WHATSAPP", fmtDuration(bot.medianMin), [
      ["Chat dibalas bot", nfmt(bot.count)],
      ["9 dari 10 chat dibalas dalam", fmtDuration(bot.p90Min)],
    ]);
    card(MARGIN + w + gap, ORANGE, "#ffedd5", "ADMIN (GABUNGAN TIM)", fmtDuration(team.medianMin), [
      ["Chat dibalas lewat panel (terukur)", nfmt(team.count)],
      ["9 dari 10 chat dibalas dalam", fmtDuration(team.p90Min)],
      [`SLA tercapai (target ${config.targetResponseMin} menit)`, team.slaPct === null ? "—" : `${idn(team.slaPct)}%`],
    ]);
    ctx.y -= h + 18;
  }

  /* ─── 3. Diagram batang ─── */
  {
    ensure(150);
    sectionTitle(ctx, "Perbandingan kecepatan", "makin pendek batang, makin cepat");
    const groups: { title: string; bot: number | null; admin: number | null }[] = [
      { title: "Kecepatan tengah (median)", bot: bot.medianMin, admin: team.medianMin },
      { title: "9 dari 10 chat dibalas dalam", bot: bot.p90Min, admin: team.p90Min },
    ];
    const max = Math.max(1e-9, ...groups.flatMap((g) => [g.bot ?? 0, g.admin ?? 0]));
    const labelW = 150;
    const trackX = MARGIN + labelW;
    const trackW = CW - labelW - 86;
    groups.forEach((g) => {
      text(ctx.page, bold, g.title, { x: MARGIN, y: ctx.y - 10, size: 9, color: INK });
      ([["Bot", g.bot, SKY], ["Admin", g.admin, ORANGE]] as const).forEach(([name, value, color], i) => {
        const by = ctx.y - 24 - i * 17;
        text(ctx.page, regular, name, { x: MARGIN + 100, y: by + 2, size: 8.4, color: SUB });
        rrect(ctx.page, { x: trackX, y: by - 2, w: trackW, h: 11, r: 5.5, fill: TRACK });
        if (value !== null) {
          const bw = Math.max(5, (value / max) * trackW);
          rrect(ctx.page, { x: trackX, y: by - 2, w: bw, h: 11, r: 5.5, fill: color });
        }
        textRight(ctx.page, bold, fmtDuration(value), { right: MARGIN + CW, y: by + 1, size: 8.8, color: INK });
      });
      ctx.y -= 56;
    });
    ctx.y -= 12;
  }

  /* ─── 4. Cakupan: siapa yang menjawab ─── */
  {
    ensure(110);
    sectionTitle(ctx, "Siapa yang menjawab chat", `${nfmt(counts.total)} rangkaian chat`);
    const open = counts.unanswered + counts.expired;
    const segs = [
      { label: "Dijawab bot", n: counts.bot, color: SKY },
      { label: "Admin lewat panel", n: counts.panel, color: ORANGE },
      { label: "Admin lewat HP", n: counts.phone, color: GREEN },
      { label: "Belum terjawab / tidak tertutup", n: open, color: FAINT },
    ];
    const total = Math.max(1, segs.reduce((t, s) => t + s.n, 0));
    rrect(ctx.page, { x: MARGIN, y: ctx.y - 14, w: CW, h: 14, r: 7, fill: TRACK });
    let x = MARGIN;
    segs.forEach((s) => {
      if (s.n <= 0) return;
      const w = Math.max(3, (s.n / total) * CW);
      rrect(ctx.page, { x, y: ctx.y - 14, w: Math.min(w, MARGIN + CW - x), h: 14, r: 0, fill: s.color });
      x += w;
    });
    // ujung bulat: tutup sudut dengan pita tipis TRACK sudah cukup rapi karena batang penuh; legenda di bawahnya
    const colW = CW / 2;
    segs.forEach((s, i) => {
      const lx = MARGIN + (i % 2) * colW;
      const ly = ctx.y - 34 - Math.floor(i / 2) * 15;
      rrect(ctx.page, { x: lx, y: ly - 1, w: 8, h: 8, r: 2, fill: s.color });
      text(ctx.page, regular, s.label, { x: lx + 14, y: ly, size: 8.6, color: TEXT });
      textRight(ctx.page, bold, `${nfmt(s.n)} (${idn((s.n / total) * 100, 0)}%)`, { right: lx + colW - 14, y: ly, size: 8.6, color: INK });
    });
    ctx.y -= 74;
  }

  /* ─── 5. Cara membaca ─── */
  {
    const notes = methodNotes(config);
    const size = 8.2;
    const lh = 10.8;
    const wrapped = notes.map((n) => wrap(n, regular, size, CW - 18));
    const h = wrapped.reduce((t, w) => t + w.length * lh + 3, 0) + 6;
    ensure(h + 22);
    sectionTitle(ctx, "Cara membaca angka");
    let y = ctx.y - 2;
    wrapped.forEach((ws) => {
      text(ctx.page, regular, "•", { x: MARGIN + 2, y, size, color: SUB });
      ws.forEach((l, i) => text(ctx.page, regular, l, { x: MARGIN + 14, y: y - i * lh, size, color: SUB }));
      y -= ws.length * lh + 3;
    });
    ctx.y = y;
  }

  drawFooters(doc, regular, bold);
  const bytes = await doc.save();
  return { bytes, pageCount: doc.getPageCount() };
}
