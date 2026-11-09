import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";
import { asText, pengeluaranDbError } from "@/lib/pengeluaran";

/**
 * Master barang packing untuk modul Pengeluaran.
 *
 * GET   daftar barang (aktif dulu, lalu urut nama)
 * POST  tambah barang { nama, satuan }
 * PATCH ubah satu barang { id, nama?, satuan?, aktif? }
 *
 * Barang yang sudah pernah dipakai TIDAK dihapus (riwayat pengeluaran harus tetap utuh),
 * cukup dinonaktifkan lewat `aktif: false` — itulah sebabnya tidak ada DELETE di sini.
 */

const bad = (message: string) => NextResponse.json({ error: message }, { status: 400 });

export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const { data, error } = await getSupabaseAdmin()
    .from("expense_items")
    .select("*")
    .order("aktif", { ascending: false })
    .order("nama", { ascending: true });

  if (error) {
    return NextResponse.json({ error: pengeluaranDbError(error, "memuat") }, { status: 500 });
  }

  return NextResponse.json({ items: data || [] });
}

export async function POST(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  try {
    const body = (await req.json().catch(() => null)) as Record<string, any> | null;
    const nama = asText(body?.nama, 120);
    if (!nama) return bad("Nama barang wajib diisi");

    const { data, error } = await getSupabaseAdmin()
      .from("expense_items")
      .insert({ nama, satuan: asText(body?.satuan, 30) })
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") return bad("Nama barang sudah ada. Pakai nama lain atau ubah yang sudah ada.");
      return NextResponse.json({ error: pengeluaranDbError(error, "menyimpan") }, { status: 400 });
    }

    return NextResponse.json({ item: data });
  } catch (e) {
    console.error("[OPS] pengeluaran barang POST:", e);
    return NextResponse.json({ error: "Gagal menyimpan barang" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  try {
    const body = (await req.json().catch(() => null)) as Record<string, any> | null;
    const id = asText(body?.id, 64);
    if (!id) return bad("id wajib diisi");

    const values: Record<string, unknown> = {};
    if ("nama" in (body || {})) {
      const nama = asText(body?.nama, 120);
      if (!nama) return bad("Nama barang wajib diisi");
      values.nama = nama;
    }
    if ("satuan" in (body || {})) values.satuan = asText(body?.satuan, 30);
    if ("aktif" in (body || {})) values.aktif = Boolean(body?.aktif);

    if (Object.keys(values).length === 0) return bad("Tidak ada perubahan");

    const { data, error } = await getSupabaseAdmin()
      .from("expense_items")
      .update(values)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) {
      if (error.code === "23505") return bad("Nama barang sudah ada. Pakai nama lain.");
      return NextResponse.json({ error: pengeluaranDbError(error, "mengubah") }, { status: 400 });
    }
    if (!data) return NextResponse.json({ error: "Barang tidak ditemukan" }, { status: 404 });

    return NextResponse.json({ item: data });
  } catch (e) {
    console.error("[OPS] pengeluaran barang PATCH:", e);
    return NextResponse.json({ error: "Gagal mengubah barang" }, { status: 500 });
  }
}
