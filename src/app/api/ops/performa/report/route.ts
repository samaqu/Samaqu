import { NextRequest, NextResponse } from "next/server";
import { forbidden, opsIdentity, unauthorized } from "@/lib/ops-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { loadReportFonts } from "@/lib/leads-report-pdf";
import { coverageCounts, effectiveStartMs, loadEpisodes, loadSlaConfig, resolveRange } from "@/lib/performa-data";
import { buildPerformaReportPdf, performaReportFileName } from "@/lib/performa-report-pdf";
import { summarizeBot, summarizeTeam } from "@/lib/sla";

/**
 * GET /api/ops/performa/report?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * PDF "Perbandingan Respons Bot vs Admin" untuk dibawa ke Ardo. HANYA Owner dan Leader (403 untuk peran lain,
 * dijaga di server). Ringkasan gabungan tanpa nama per orang. Hanya membaca data; angkanya satu sumber dengan
 * halaman Performa Admin (lib/performa-data.ts + lib/sla.ts).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store, private, max-age=0" };

export async function GET(req: NextRequest) {
  const me = await opsIdentity(req);
  if (!me) return unauthorized();
  if (me.role !== "owner" && me.role !== "leader") return forbidden("Hanya Owner dan Leader yang dapat mengekspor perbandingan ini.");

  try {
    const nowMs = Date.now();
    const range = resolveRange(new URL(req.url).searchParams, nowMs);
    const db = getSupabaseAdmin();
    const config = await loadSlaConfig(db);
    const effectiveMs = effectiveStartMs(config);

    const loaded = await loadEpisodes(db, range, config, nowMs);
    if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: 500, headers: noStore });

    let fonts;
    try {
      fonts = loadReportFonts();
    } catch (fontErr) {
      console.error("[OPS] Font laporan tidak terbaca:", fontErr);
      fonts = undefined;
    }

    const report = await buildPerformaReportPdf({
      from: range.from,
      to: range.to,
      config,
      // Bot: seluruh periode. Admin: hanya chat yang mulai sejak tanggal mulai berlaku.
      bot: summarizeBot(loaded.episodes),
      team: summarizeTeam(loaded.episodes.filter((e) => e.startAt >= effectiveMs), config),
      counts: coverageCounts(loaded.episodes, effectiveMs),
      fonts,
      now: new Date(nowMs),
    });

    return new NextResponse(Buffer.from(report.bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${performaReportFileName(range.from, range.to)}"`,
        "X-Report-Pages": String(report.pageCount),
        ...noStore,
      },
    });
  } catch (err: any) {
    console.error("[OPS] Gagal membuat PDF performa:", err);
    return NextResponse.json({ error: err?.message || "Gagal membuat PDF perbandingan" }, { status: 500, headers: noStore });
  }
}
