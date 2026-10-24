import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { canSeePrices, forbidden, productionGuard } from "@/lib/ops-auth";
import {
  getDataCheckReport,
  getHppReport,
  getInventoryReport,
  getOrderProfitReport,
  getReportOptions,
  getSummaryReport,
  resolveReportRange,
  simulateRequirement,
} from "@/lib/produksi-reports";

/**
 * Laporan Produksi Fase 6 — BACA SAJA.
 *
 * GET  ?tab=options|ringkasan|persediaan|hpp|laba|cek&start&end
 * POST ?tab=kebutuhan  body: { category, fabric_type_id, color, series, size_qtys }
 *
 * Owner: semua tab. Leader: hanya kebutuhan + daftar bahan menipis (tanpa harga).
 * Admin/Admin Operasional ditolak 403 oleh productionGuard.
 */

export async function GET(req: NextRequest) {
  const access = await productionGuard(req);
  if (!access.ok) return access.response;

  const { searchParams } = new URL(req.url);
  const tab = searchParams.get("tab") || "ringkasan";
  const { start, end } = resolveReportRange(searchParams.get("start"), searchParams.get("end"));
  const admin = getSupabaseAdmin();

  try {
    if (tab === "options") {
      return NextResponse.json(await getReportOptions(admin));
    }

    if (tab === "persediaan") {
      const isOwner = access.role === "owner";
      const lowOnly = searchParams.get("low_only") === "1";
      return NextResponse.json(
        await getInventoryReport(admin, {
          lowOnly: isOwner ? lowOnly : true,
          showPrices: isOwner,
        }),
      );
    }

    if (tab !== "kebutuhan" && access.role !== "owner") {
      return forbidden("Laporan ini hanya untuk Owner");
    }

    switch (tab) {
      case "ringkasan":
        return NextResponse.json(await getSummaryReport(admin, start, end));
      case "hpp":
        return NextResponse.json(
          await getHppReport(admin, start, end, searchParams.get("schedule_id")),
        );
      case "laba":
        return NextResponse.json(await getOrderProfitReport(admin, start, end));
      case "cek":
        return NextResponse.json(await getDataCheckReport(admin));
      case "kebutuhan":
        return NextResponse.json(
          { error: "Gunakan POST untuk simulasi kebutuhan bahan." },
          { status: 405 },
        );
      default:
        return NextResponse.json({ error: "Tab laporan tidak dikenal." }, { status: 400 });
    }
  } catch (error) {
    console.error("[PRODUKSI-LAPORAN] GET gagal:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal memuat laporan." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const access = await productionGuard(req);
  if (!access.ok) return access.response;

  const { searchParams } = new URL(req.url);
  const tab = searchParams.get("tab") || "kebutuhan";
  if (tab !== "kebutuhan") {
    return NextResponse.json({ error: "Aksi laporan tidak dikenal." }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const admin = getSupabaseAdmin();
    return NextResponse.json(await simulateRequirement(admin, body, canSeePrices(access.role)));
  } catch (error) {
    console.error("[PRODUKSI-LAPORAN] Simulasi gagal:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal menghitung kebutuhan bahan." },
      { status: 500 },
    );
  }
}
