import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";
import { jakartaMonthBounds } from "@/lib/ops-followup";
import {
  JNT_EXPENSE_BASIS_LABEL,
  JNT_INVOICE_SQL_FILE,
  JNT_ORDER_BASIS_LABEL,
  toNumber,
  type JntInvoiceHeader,
} from "@/lib/jnt-invoice";
import { isMissingTable, readJntInvoiceSummary } from "@/lib/jnt-invoice-db";

/**
 * Menu Ops → Keuangan → "Ongkir J&T": tagihan bulanan J&T vs ongkir yang dibayar customer.
 *
 *   GET  /api/ops/ongkir-jnt?period=YYYY-MM   → header + rincian per resi + ringkasan
 *   POST /api/ops/ongkir-jnt                  → simpan header tagihan (angka dari invoice PDF)
 *
 * Upload rincian resi (ekspor "Resi Saya" J&T) ada di route terpisah: ./upload.
 *
 * Angka sengaja dipisah per basis tanggal dan TIDAK digabung:
 *   · beban J&T       → bulan TANGGAL PENGIRIMAN (delivery_date)
 *   · omzet & ongkir customer → bulan TANGGAL PESANAN (orders.created_at)
 * Diskon J&T diperlakukan sebagai pengurang biaya (net_cost), bukan pendapatan.
 * Tabelnya dibuat lewat migration yang dijalankan manual — selama belum, balasan
 * berisi `tableReady: false` + nama file SQL-nya.
 */

const STATUSES: JntInvoiceHeader["status"][] = ["unpaid", "paid"];

function periodParam(value: string | null): string {
  const bounds = jakartaMonthBounds(value);
  return bounds.value;
}

function textOrNull(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function dateOrNull(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const period = periodParam(req.nextUrl.searchParams.get("period"));
  const admin = getSupabaseAdmin();

  try {
    const { invoice, items, summary } = await readJntInvoiceSummary(admin, period);
    return NextResponse.json({
      tableReady: true,
      period,
      monthLabel: jakartaMonthBounds(period).label,
      sqlFile: JNT_INVOICE_SQL_FILE,
      basis: { expense: JNT_EXPENSE_BASIS_LABEL, order: JNT_ORDER_BASIS_LABEL },
      invoice,
      items,
      summary,
    });
  } catch (error) {
    if (isMissingTable(error as { code?: string; message?: string })) {
      return NextResponse.json({
        tableReady: false,
        period,
        monthLabel: jakartaMonthBounds(period).label,
        sqlFile: JNT_INVOICE_SQL_FILE,
        basis: { expense: JNT_EXPENSE_BASIS_LABEL, order: JNT_ORDER_BASIS_LABEL },
        invoice: null,
        items: [],
        summary: null,
      });
    }
    console.error("[OPS] Gagal membaca tagihan J&T:", error);
    return NextResponse.json({ error: "Gagal membaca data tagihan J&T." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const period = String(raw.period || "").trim();
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return NextResponse.json({ error: "Bulan tagihan tidak valid (format YYYY-MM)." }, { status: 400 });
  }

  const status = STATUSES.includes(raw.status as JntInvoiceHeader["status"])
    ? (raw.status as JntInvoiceHeader["status"])
    : "unpaid";

  const row = {
    period,
    invoice_number: textOrNull(raw.invoice_number),
    invoice_date: dateOrNull(raw.invoice_date),
    due_date: dateOrNull(raw.due_date),
    gross_total: toNumber(String(raw.gross_total ?? "")) ?? 0,
    discount_total: toNumber(String(raw.discount_total ?? "")) ?? 0,
    ppn_total: toNumber(String(raw.ppn_total ?? "")) ?? 0,
    paid_total: toNumber(String(raw.paid_total ?? "")) ?? 0,
    status,
    notes: textOrNull(raw.notes),
    updated_at: new Date().toISOString(),
  };

  const admin = getSupabaseAdmin();

  try {
    const { data, error } = await admin
      .from("jnt_invoices")
      .upsert(row, { onConflict: "period" })
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json({ tableReady: true, invoice: data });
  } catch (error) {
    if (isMissingTable(error as { code?: string; message?: string })) {
      return NextResponse.json(
        { tableReady: false, sqlFile: JNT_INVOICE_SQL_FILE, error: "Tabel tagihan J&T belum dibuat." },
        { status: 409 },
      );
    }
    console.error("[OPS] Gagal menyimpan tagihan J&T:", error);
    return NextResponse.json({ error: "Gagal menyimpan tagihan J&T." }, { status: 500 });
  }
}
