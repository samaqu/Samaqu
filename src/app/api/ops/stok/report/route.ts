import { NextRequest, NextResponse } from "next/server";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";
import { GET as transaksiGET } from "../../transaksi/route";
import { GET as variantsGET } from "../../product-variants/route";
import { buildStokReportPdf, stokReportFileName, type StokVariantRow } from "@/lib/stok-report-pdf";
import type { TxOrder } from "@/lib/transaksi-report-pdf";
import { loadReportFonts } from "@/lib/leads-report-pdf";

/**
 * GET /api/ops/stok/report?bulan=YYYY-MM
 *
 * PDF "Laporan Stok & Kain Terjual" untuk satu bulan (tombol Export PDF di tab Laporan Stok menu Produk, dipakai
 * bersama panel admin dan dashboard office). Hanya membaca data.
 *
 * Sumber data = handler yang SAMA dengan yang memberi makan layar: `/api/ops/transaksi` (pesanan + item bulan itu) dan
 * `/api/ops/product-variants` (stok efektif per produk, warna, ukuran), bukan query kedua, jadi angka PDF = angka halaman.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const raw = new URL(req.url).searchParams.get("bulan") || "";
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const fallback = `${wib.getUTCFullYear()}-${String(wib.getUTCMonth() + 1).padStart(2, "0")}`;
  const bulan = /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : fallback;

  const [y, mm] = bulan.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, mm, 0)).getUTCDate();
  const start = `${bulan}-01`;
  const end = `${bulan}-${String(lastDay).padStart(2, "0")}`;

  try {
    const [ordersRes, variantsRes] = await Promise.all([
      transaksiGET(new NextRequest(new URL(`/api/ops/transaksi?start=${start}&end=${end}&limit=2000`, req.url), { headers: req.headers })),
      variantsGET(new NextRequest(new URL("/api/ops/product-variants", req.url), { headers: req.headers })),
    ]);
    if (!ordersRes.ok) {
      const payload = (await ordersRes.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error || `Gagal memuat transaksi (${ordersRes.status})`);
    }
    if (!variantsRes.ok) {
      const payload = (await variantsRes.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error || `Gagal memuat stok produk (${variantsRes.status})`);
    }
    const orders = ((await ordersRes.json()) as { items?: TxOrder[] }).items || [];
    const variants = ((await variantsRes.json()) as { items?: StokVariantRow[] }).items || [];

    let fonts;
    try {
      fonts = loadReportFonts();
    } catch (fontErr) {
      console.error("[OPS] Font laporan tidak terbaca:", fontErr);
      fonts = undefined;
    }

    const report = await buildStokReportPdf({ month: bulan, orders, variants, fonts });

    return new NextResponse(Buffer.from(report.bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${stokReportFileName(bulan)}"`,
        "Cache-Control": "no-store, private, max-age=0",
        "X-Report-Pages": String(report.pageCount),
      },
    });
  } catch (err: any) {
    console.error("[OPS] Gagal membuat laporan stok:", err);
    return NextResponse.json(
      { error: err?.message || "Gagal membuat laporan stok" },
      { status: 500, headers: { "Cache-Control": "no-store, private, max-age=0" } }
    );
  }
}
