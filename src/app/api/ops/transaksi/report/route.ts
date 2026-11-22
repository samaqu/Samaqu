import { NextRequest, NextResponse } from "next/server";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";
import { GET as transaksiGET } from "../route";
import {
  buildTransaksiReportPdf,
  transaksiReportFileName,
  type TxOrder,
} from "@/lib/transaksi-report-pdf";
import { loadReportFonts } from "@/lib/leads-report-pdf";

/**
 * GET /api/ops/transaksi/report?bulan=YYYY-MM
 *
 * PDF "Laporan Transaksi" untuk satu bulan (tombol Export PDF di menu Transaksi, dipakai bersama panel admin
 * dan dashboard office). Hanya membaca data.
 *
 * Data pesanan diambil lewat handler `/api/ops/transaksi` yang SAMA dengan yang memberi makan tabel di layar
 * (bukan query kedua), jadi isi PDF persis sama dengan halaman: pesanan + item + status + tanggal WIB.
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
    const listUrl = new URL(`/api/ops/transaksi?start=${start}&end=${end}&limit=2000`, req.url);
    const listRes = await transaksiGET(new NextRequest(listUrl, { headers: req.headers }));
    if (!listRes.ok) {
      const payload = (await listRes.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error || `Gagal memuat transaksi (${listRes.status})`);
    }
    const payload = (await listRes.json()) as { items?: TxOrder[] };
    const orders = payload.items || [];

    let fonts;
    try {
      fonts = loadReportFonts();
    } catch (fontErr) {
      console.error("[OPS] Font laporan tidak terbaca:", fontErr);
      fonts = undefined;
    }

    const report = await buildTransaksiReportPdf({ month: bulan, orders, fonts });

    return new NextResponse(Buffer.from(report.bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${transaksiReportFileName(bulan)}"`,
        "Cache-Control": "no-store, private, max-age=0",
        "X-Report-Pages": String(report.pageCount),
      },
    });
  } catch (err: any) {
    console.error("[OPS] Gagal membuat laporan transaksi:", err);
    return NextResponse.json(
      { error: err?.message || "Gagal membuat laporan transaksi" },
      { status: 500, headers: { "Cache-Control": "no-store, private, max-age=0" } }
    );
  }
}
