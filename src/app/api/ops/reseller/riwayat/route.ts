import { NextRequest, NextResponse } from "next/server";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";
import { buildCsv, parseRiwayatFilters } from "@/lib/reseller/riwayat";
import { loadRiwayat } from "@/lib/reseller/riwayat-server";

// Data pesanan selalu segar; jangan di-cache.
export const dynamic = "force-dynamic";

const PAGE_SIZE_DEFAULT = 25;
const PAGE_SIZE_MAX = 100;

/**
 * Riwayat pesanan reseller (admin ops & panel admin) — BACA SAJA.
 *
 * Query: reseller_id, bulan (YYYY-MM) | dari + sampai (YYYY-MM-DD), status (tahap pesanan), q
 * (nomor pesanan / resi / nama penerima), page, pageSize.
 * `format=csv` mengirim SEMUA hasil filter (bukan hanya satu halaman) sebagai file CSV.
 * Kartu ringkasan dihitung dari seluruh hasil filter; pesanan dibatalkan tampil tetapi tidak dihitung.
 */
export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const url = new URL(req.url);
  const filters = parseRiwayatFilters(url.searchParams);

  let result;
  try {
    result = await loadRiwayat(filters);
  } catch (e) {
    console.error("[OPS-RESELLER] Gagal membaca riwayat pesanan:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Gagal memuat riwayat pesanan" }, { status: 500 });
  }

  if (url.searchParams.get("format") === "csv") {
    const stamp = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, "");
    // BOM UTF-8 supaya Excel membaca huruf dengan benar.
    return new NextResponse("﻿" + buildCsv(result.orders), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="riwayat-pesanan-reseller-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const page = Math.max(1, Math.round(Number(url.searchParams.get("page"))) || 1);
  const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Math.round(Number(url.searchParams.get("pageSize"))) || PAGE_SIZE_DEFAULT));
  const from = (page - 1) * pageSize;
  const slice = result.orders.slice(from, from + pageSize);

  return NextResponse.json({
    data: slice,
    total: result.orders.length,
    page,
    pageSize,
    has_more: from + pageSize < result.orders.length,
    summary: result.summary,
  });
}
