import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, opsActorEmail, unauthorized } from "@/lib/ops-auth";
import { BIZ_OFFSET_MS } from "@/lib/ops-followup";
import {
  PENGELUARAN_TIPE,
  asDateKey,
  asInt,
  asText,
  buildPengeluaranSummary,
  pengeluaranDbError,
  readPengeluaranPeriod,
  type PengeluaranTipe,
} from "@/lib/pengeluaran";

/**
 * Modul Pengeluaran (menu Keuangan > Pengeluaran).
 *
 * GET    ?bulan=&tahun=&tipe=   daftar + ringkasan per tipe (batas hari WIB)
 * POST                          tambah pengeluaran (packing: total = qty × harga satuan)
 * PATCH                         ubah satu pengeluaran
 * DELETE ?id= (atau body.id)    hapus satu pengeluaran
 *
 * Semua akses DB lewat service role (`getSupabaseAdmin`) setelah lolos `isOpsAdmin`.
 * Tabel: `expenses` + `expense_items` (migration 20261109_pengeluaran.sql).
 */

const bad = (message: string) => NextResponse.json({ error: message }, { status: 400 });

function isTipe(value: unknown): value is PengeluaranTipe {
  return PENGELUARAN_TIPE.includes(value as PengeluaranTipe);
}

type BuildResult =
  | { ok: true; values: Record<string, unknown> }
  | { ok: false; response: NextResponse };

/** Validasi ketat + bangun nilai kolom. Total packing selalu dihitung server. */
async function buildValues(
  admin: ReturnType<typeof getSupabaseAdmin>,
  body: Record<string, any>,
  tipe: PengeluaranTipe,
): Promise<BuildResult> {
  const tanggal = asDateKey(body?.tanggal);
  if (!tanggal) return { ok: false, response: bad("Tanggal wajib diisi") };

  const common = {
    tanggal,
    catatan: asText(body?.catatan, 1000),
    metode_bayar: asText(body?.metode_bayar, 60),
    updated_at: new Date().toISOString(),
  };

  if (tipe === "packing") {
    const itemId = asText(body?.item_id, 64);
    if (!itemId) return { ok: false, response: bad("Pilih barang packing dulu") };

    const { data: item, error } = await admin
      .from("expense_items")
      .select("id, nama")
      .eq("id", itemId)
      .maybeSingle();

    if (error) {
      return { ok: false, response: NextResponse.json({ error: pengeluaranDbError(error, "memuat barang") }, { status: 500 }) };
    }
    if (!item) return { ok: false, response: bad("Barang packing tidak ditemukan. Tambahkan dulu di Kelola Barang.") };

    const qty = asInt(body?.qty);
    const hargaSatuan = asInt(body?.harga_satuan);
    if (qty === null || qty <= 0) return { ok: false, response: bad("Qty wajib lebih dari 0") };
    if (hargaSatuan === null || hargaSatuan < 0) return { ok: false, response: bad("Harga satuan wajib diisi") };

    const jumlah = qty * hargaSatuan;
    if (jumlah <= 0) return { ok: false, response: bad("Total pengeluaran harus lebih dari 0") };

    return {
      ok: true,
      values: {
        ...common,
        tipe,
        item_id: itemId,
        // Salinan nama barang saat dicatat, supaya riwayat tidak berubah kalau master diedit.
        nama_barang: String(item.nama),
        qty,
        harga_satuan: hargaSatuan,
        jumlah,
        kategori: null,
        deskripsi: asText(body?.deskripsi, 1000),
      },
    };
  }

  const kategori = asText(body?.kategori, 80);
  if (!kategori) return { ok: false, response: bad("Kategori wajib diisi untuk pengeluaran operasional") };

  const jumlah = asInt(body?.jumlah);
  if (jumlah === null || jumlah <= 0) return { ok: false, response: bad("Jumlah wajib lebih dari 0") };

  return {
    ok: true,
    values: {
      ...common,
      tipe,
      kategori,
      deskripsi: asText(body?.deskripsi, 1000),
      jumlah,
      item_id: null,
      nama_barang: null,
      qty: null,
      harga_satuan: null,
    },
  };
}

export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const sp = new URL(req.url).searchParams;
  const { bulan, tahun, from, to } = readPengeluaranPeriod(sp.get("bulan"), sp.get("tahun"), BIZ_OFFSET_MS);
  const tipeParam = sp.get("tipe");

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("expenses")
    .select("*")
    .gte("tanggal", from)
    .lte("tanggal", to)
    .order("tanggal", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: pengeluaranDbError(error, "memuat") }, { status: 500 });
  }

  const rows = data || [];
  const packing = rows.filter((row) => row.tipe === "packing");
  const operasional = rows.filter((row) => row.tipe === "operasional");
  const items = isTipe(tipeParam) ? rows.filter((row) => row.tipe === tipeParam) : rows;

  return NextResponse.json({
    items,
    summary: {
      packing: buildPengeluaranSummary(packing),
      operasional: buildPengeluaranSummary(operasional),
    },
    periode: { bulan, tahun, from, to },
  });
}

export async function POST(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  try {
    const body = (await req.json().catch(() => null)) as Record<string, any> | null;
    if (!body) return bad("Data pengeluaran tidak terbaca");

    const tipe = String(body.tipe ?? "").trim();
    if (!isTipe(tipe)) return bad("Tipe pengeluaran harus packing atau operasional");

    const admin = getSupabaseAdmin();
    const built = await buildValues(admin, body, tipe);
    if (!built.ok) return built.response;

    const requestId = asText(body.request_id, 120) || randomUUID();
    const { data, error } = await admin
      .from("expenses")
      .insert({
        ...built.values,
        request_id: requestId,
        created_by: await opsActorEmail(req),
      })
      .select("*")
      .single();

    if (error) {
      // Double submit: request_id unik, jadi kirim baris yang sudah ada (tidak menulis dua kali).
      if (error.code === "23505") {
        const { data: existing } = await admin.from("expenses").select("*").eq("request_id", requestId).maybeSingle();
        if (existing) return NextResponse.json({ item: existing, duplicate: true });
      }
      return NextResponse.json({ error: pengeluaranDbError(error, "menyimpan") }, { status: 400 });
    }

    return NextResponse.json({ item: data });
  } catch (e) {
    console.error("[OPS] pengeluaran POST:", e);
    return NextResponse.json({ error: "Gagal menyimpan pengeluaran" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  try {
    const body = (await req.json().catch(() => null)) as Record<string, any> | null;
    const id = asText(body?.id, 64);
    if (!id) return bad("id wajib diisi");

    const admin = getSupabaseAdmin();
    const { data: existing, error: readError } = await admin.from("expenses").select("*").eq("id", id).maybeSingle();
    if (readError) {
      return NextResponse.json({ error: pengeluaranDbError(readError, "memuat") }, { status: 500 });
    }
    if (!existing) return NextResponse.json({ error: "Pengeluaran tidak ditemukan" }, { status: 404 });

    const tipe = existing.tipe as PengeluaranTipe;
    if (!isTipe(tipe)) return bad("Tipe pengeluaran tidak dikenal");

    // Field yang tidak dikirim tetap memakai nilai tersimpan.
    const merged = {
      tanggal: existing.tanggal,
      item_id: existing.item_id,
      qty: existing.qty,
      harga_satuan: existing.harga_satuan,
      jumlah: existing.jumlah,
      kategori: existing.kategori,
      deskripsi: existing.deskripsi,
      metode_bayar: existing.metode_bayar,
      catatan: existing.catatan,
      ...body,
    };

    const built = await buildValues(admin, merged, tipe);
    if (!built.ok) return built.response;

    const { data, error } = await admin.from("expenses").update(built.values).eq("id", id).select("*").single();
    if (error) {
      return NextResponse.json({ error: pengeluaranDbError(error, "mengubah") }, { status: 400 });
    }

    return NextResponse.json({ item: data });
  } catch (e) {
    console.error("[OPS] pengeluaran PATCH:", e);
    return NextResponse.json({ error: "Gagal mengubah pengeluaran" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  try {
    const body = await req.json().catch(() => null);
    const id = asText(body?.id ?? new URL(req.url).searchParams.get("id"), 64);
    if (!id) return bad("id wajib diisi");

    const { error, count } = await getSupabaseAdmin().from("expenses").delete({ count: "exact" }).eq("id", id);
    if (error) {
      return NextResponse.json({ error: pengeluaranDbError(error, "menghapus") }, { status: 400 });
    }
    if (!count) return NextResponse.json({ error: "Pengeluaran tidak ditemukan" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[OPS] pengeluaran DELETE:", e);
    return NextResponse.json({ error: "Gagal menghapus pengeluaran" }, { status: 500 });
  }
}
