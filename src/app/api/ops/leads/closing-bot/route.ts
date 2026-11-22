import { NextRequest, NextResponse } from "next/server";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";
import { jakartaMonthBounds } from "@/lib/ops-followup";

/**
 * Closing yang dicatat bot sendiri (tabel `wa_closings` di database Academy, diisi tool `catat_closing`).
 * Sumber yang sama dengan angka "Berhasil closing" di AI Performance, jadi Laporan Leads bisa membedakan
 * closing oleh bot dari closing yang diselesaikan manusia tanpa bergantung pada jejak "ambil alih".
 *
 * BACA-SAJA. Mengembalikan kunci nomor (9 digit terakhir) supaya halaman bisa mencocokkan ke `leads.kontak`
 * tanpa menyebar nomor utuh. Kalau Academy belum dikonfigurasi atau gagal dibaca, `available: false` dan halaman
 * tampil seperti biasa tanpa pemisahan.
 */

const PAGE = 1000;

const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");

/** Kunci pencocokan nomor: 9 digit terakhir (08xx, 628xx, dan 8xx menjadi sama). Terlalu pendek = tidak dipakai. */
function phoneKey(value: unknown): string {
  const d = digits(value);
  return d.length >= 8 ? d.slice(-9) : "";
}

export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const base = (process.env.ACADEMY_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.ACADEMY_SERVICE_ROLE_KEY || "";
  if (!base || !key) {
    return NextResponse.json({ available: false, reason: "Academy belum dikonfigurasi", keys: [], count: 0, nominal: 0 });
  }

  try {
    const params = new URL(req.url).searchParams;
    const month = jakartaMonthBounds(params.get("bulan") || params.get("month"));

    const rows: { sender?: string | null; nominal?: number | string | null }[] = [];
    for (let from = 0; ; from += PAGE) {
      const url = new URL(`${base}/rest/v1/wa_closings`);
      url.searchParams.set("select", "sender,nominal");
      url.searchParams.set("created_at", `gte.${month.startIso}`);
      url.searchParams.append("created_at", `lt.${month.endIso}`);
      url.searchParams.set("order", "created_at.asc");
      url.searchParams.set("limit", String(PAGE));
      url.searchParams.set("offset", String(from));
      const res = await fetch(url, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Gagal membaca wa_closings (${res.status}).`);
      const page = (await res.json().catch(() => [])) as typeof rows;
      if (!Array.isArray(page) || page.length === 0) break;
      rows.push(...page);
      if (page.length < PAGE) break;
    }

    const keys = [...new Set(rows.map((row) => phoneKey(row.sender)).filter(Boolean))];
    const nominal = rows.reduce((sum, row) => sum + (Number(row.nominal) || 0), 0);
    return NextResponse.json({ available: true, month: month.value, count: rows.length, nominal, keys });
  } catch (error) {
    // Pemisahan closing bot hanyalah tambahan: kegagalan di sini tidak boleh merusak Laporan Leads.
    const message = error instanceof Error ? error.message : "Gagal memuat closing bot.";
    return NextResponse.json({ available: false, reason: message, keys: [], count: 0, nominal: 0 });
  }
}
