import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";
import { readFirstSheetTable } from "@/lib/xlsx-lite";
import { JNT_INVOICE_SQL_FILE, normalizeAwb, parseJntResiTable, type JntInvoiceItemInput } from "@/lib/jnt-invoice";
import { ensureInvoice, groupItemsByPeriod, isMissingTable } from "@/lib/jnt-invoice-db";

/**
 * Upload ekspor "Resi Saya" J&T (Ekspor → Data semua halaman) untuk menu Ongkir J&T.
 *
 *   POST /api/ops/ongkir-jnt/upload   (multipart: `file` = .xlsx, `period` = bulan yang dipilih)
 *
 * IDEMPOTEN: kunci barisnya nomor resi (`jnt_invoice_items.awb_no` unik). Upload ulang
 * file yang sama tidak menambah beban — baris yang sudah ada cuma dihitung "sudah ada".
 *
 * Bulan tagihan diambil dari TANGGAL PENGIRIMAN tiap baris, bukan dari pilihan di layar:
 * beban ongkir harus masuk ke bulan pengiriman, dan satu file bisa memuat dua bulan.
 * `period` kiriman UI cuma dipakai untuk melaporkan berapa baris yang di luar bulan itu.
 */

const MAX_BYTES = 8 * 1024 * 1024;
const INSERT_CHUNK = 200;

export async function POST(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !file || typeof file === "string") {
    return NextResponse.json({ error: "File Excel belum dipilih." }, { status: 400 });
  }

  const selectedPeriod = String(form.get("period") || "").trim();
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength === 0) {
    return NextResponse.json({ error: "File kosong." }, { status: 400 });
  }
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "File terlalu besar (maksimal 8 MB)." }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseJntResiTable(readFirstSheetTable(buffer), selectedPeriod || null);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "Gagal membaca file Excel." }, { status: 400 });
  }

  if (parsed.items.length === 0) {
    return NextResponse.json(
      { error: "Tidak ada baris resi yang bisa dibaca dari file ini.", failedRows: parsed.failed.slice(0, 30) },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdmin();
  const byPeriod: { period: string; new: number; existing: number }[] = [];
  let inserted = 0;
  let existingCount = 0;

  // Sebaran bulan dari ISI FILE — dipakai apa adanya kalau tabelnya belum ada, supaya
  // upload tetap memberi angka (pratinjau) dan bukan tombol mati.
  const groups = groupItemsByPeriod(parsed.items);
  const previewByPeriod = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, list]) => ({ period, new: list.length, existing: 0 }));

  try {
    for (const [period, items] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const invoice = await ensureInvoice(admin, period);
      const awbs = items.map((item) => item.awb_no);

      const existing = new Set<string>();
      for (let i = 0; i < awbs.length; i += INSERT_CHUNK) {
        const { data, error } = await admin
          .from("jnt_invoice_items")
          .select("awb_no")
          .in("awb_no", awbs.slice(i, i + INSERT_CHUNK));
        if (error) throw error;
        for (const row of data || []) existing.add(normalizeAwb(row.awb_no as string));
      }

      const fresh = items.filter((item) => !existing.has(item.awb_no));

      for (let i = 0; i < fresh.length; i += INSERT_CHUNK) {
        const rows = fresh.slice(i, i + INSERT_CHUNK).map((item: JntInvoiceItemInput) => ({
          invoice_id: invoice.id,
          awb_no: item.awb_no,
          delivery_date: item.delivery_date,
          city: item.city,
          district: item.district,
          service: item.service,
          weight: item.weight,
          gross_cost: item.gross_cost,
          discount: item.discount,
          net_cost: item.net_cost,
          has_discount: item.has_discount,
        }));
        const { error } = await admin.from("jnt_invoice_items").insert(rows);
        if (error) throw error;
      }

      inserted += fresh.length;
      existingCount += existing.size;
      byPeriod.push({ period, new: fresh.length, existing: existing.size });

      await stampOrderMatches(admin, invoice.id, fresh.map((item) => item.awb_no));
    }
  } catch (error) {
    if (isMissingTable(error as { code?: string; message?: string })) {
      // Tabel belum dibuat: kembalikan hasil BACA file sebagai pratinjau (saved: false)
      // — tidak ada satu baris pun yang ditulis ke database.
      return NextResponse.json({
        tableReady: false,
        saved: false,
        sqlFile: JNT_INVOICE_SQL_FILE,
        period: selectedPeriod || previewByPeriod[0]?.period || "",
        total: parsed.items.length,
        new: 0,
        existing: 0,
        failed: parsed.failed.length,
        outsidePeriod: parsed.outsidePeriod.length,
        byPeriod: previewByPeriod,
        failedRows: parsed.failed.slice(0, 30),
        outsideRows: parsed.outsidePeriod.slice(0, 15),
        totals: parsed.totals,
      });
    }
    console.error("[OPS] Gagal menyimpan baris resi J&T:", error);
    return NextResponse.json({ error: "Gagal menyimpan baris resi ke database." }, { status: 500 });
  }

  return NextResponse.json({
    tableReady: true,
    saved: true,
    period: selectedPeriod || byPeriod[0]?.period || "",
    total: parsed.items.length,
    new: inserted,
    existing: existingCount,
    failed: parsed.failed.length,
    outsidePeriod: parsed.outsidePeriod.length,
    byPeriod,
    failedRows: parsed.failed.slice(0, 30),
    outsideRows: parsed.outsidePeriod.slice(0, 15),
    totals: parsed.totals,
  });
}

/**
 * Simpan hasil pencocokan resi → pesanan pada baris yang baru masuk (agar modul lain
 * bisa membaca `order_number`/`shipping_cost` langsung dari tabel). Halaman sendiri
 * selalu menghitung ulang saat dibaca, jadi kolom ini pelengkap, bukan sumber angka.
 */
async function stampOrderMatches(admin: ReturnType<typeof getSupabaseAdmin>, invoiceId: string, awbs: string[]) {
  if (awbs.length === 0) return;

  const map = new Map<string, { order_number: string; shipping_cost: number }>();
  for (let i = 0; i < awbs.length; i += INSERT_CHUNK) {
    const { data, error } = await admin
      .from("orders")
      .select("order_number, awb_no, shipping_cost")
      .in("awb_no", awbs.slice(i, i + INSERT_CHUNK));
    if (error) {
      console.error("[OPS] Gagal mencocokkan resi ke pesanan:", error);
      return;
    }
    for (const row of data || []) {
      const key = normalizeAwb(row.awb_no as string);
      if (key) map.set(key, { order_number: row.order_number as string, shipping_cost: Number(row.shipping_cost || 0) });
    }
  }

  const updates = [...map.entries()];
  for (let i = 0; i < updates.length; i += 20) {
    await Promise.all(
      updates.slice(i, i + 20).map(([awb, hit]) =>
        admin
          .from("jnt_invoice_items")
          .update({ order_number: hit.order_number, shipping_cost: hit.shipping_cost })
          .eq("invoice_id", invoiceId)
          .eq("awb_no", awb),
      ),
    );
  }
}
