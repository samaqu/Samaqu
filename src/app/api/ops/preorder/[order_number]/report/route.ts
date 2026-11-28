import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";
import { buildPreorderProductionPdf, productionPdfFileName } from "@/lib/preorder-production-pdf";
import { loadReportFonts } from "@/lib/leads-report-pdf";

/**
 * GET /api/ops/preorder/[order_number]/report
 *
 * PDF "Export PDF Produksi" untuk SATU pre-order (tombol di detail pesanan, menu Transaksi/Pre-Order):
 * Kain, Produk, Series, Ukuran, Qty per item, plus Tgl Pesanan Masuk dan Tgl Deadline. Hanya membaca data.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, context: { params: Promise<{ order_number: string }> }) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const { order_number: orderNumber } = await context.params;
  if (!orderNumber?.trim()) {
    return NextResponse.json({ error: "Nomor pesanan wajib diisi" }, { status: 400 });
  }

  try {
    const admin = getSupabaseAdmin();
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id, order_number, customer_name, created_at, is_preorder, preorder_deadline")
      .eq("order_number", orderNumber.trim())
      .maybeSingle();
    if (orderError) throw new Error(orderError.message);
    if (!order) return NextResponse.json({ error: "Pesanan tidak ditemukan" }, { status: 404 });
    if (order.is_preorder !== true) {
      return NextResponse.json({ error: "Pesanan ini bukan pre-order" }, { status: 400 });
    }
    if (!order.preorder_deadline) {
      return NextResponse.json(
        { error: "Pre-order ini belum punya tanggal deadline. Isi dulu lewat tombol \"Ubah\"." },
        { status: 400 },
      );
    }

    const { data: items, error: itemsError } = await admin
      .from("order_items")
      .select("product_name, series, kain, color, size, quantity")
      .eq("order_id", order.id);
    if (itemsError) throw new Error(itemsError.message);

    let fonts;
    try {
      fonts = loadReportFonts();
    } catch (fontErr) {
      console.error("[OPS] Font PDF produksi tidak terbaca:", fontErr);
      fonts = undefined;
    }

    const report = await buildPreorderProductionPdf({
      order_number: order.order_number,
      customer_name: order.customer_name,
      created_at: order.created_at,
      preorder_deadline: order.preorder_deadline,
      items: items || [],
      fonts,
    });

    return new NextResponse(Buffer.from(report.bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${productionPdfFileName(order.order_number)}"`,
        "Cache-Control": "no-store, private, max-age=0",
        "X-Report-Pages": String(report.pageCount),
      },
    });
  } catch (err: unknown) {
    console.error("[OPS] Gagal membuat PDF produksi pre-order:", err);
    const message = err instanceof Error ? err.message : "Gagal membuat PDF produksi";
    return NextResponse.json({ error: message }, { status: 500, headers: { "Cache-Control": "no-store, private, max-age=0" } });
  }
}
