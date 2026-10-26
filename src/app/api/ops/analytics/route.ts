import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";

/**
 * Trafik web dari penghitung SISI SERVER (tabel `web_visits`, diisi `src/middleware.ts`).
 *
 * Beda dengan Vercel Analytics: request yang sampai ke server tidak bisa diblokir ad blocker,
 * jadi angka ini lebih dekat ke kunjungan sebenarnya. Yang dihitung hanya halaman publik —
 * /ops, /panel-admin, /admin, /affiliate & /api tidak pernah dicatat.
 *
 * Data mentah disimpan per kunjungan; visitor unik = 1 hash per hari. Fungsi SQL-nya ada di
 * supabase/migrations/20261026_web_analytics.sql.
 */

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Tanggal kalender WIB (YYYY-MM-DD). */
const wibDay = (time: number) => new Date(time + WIB_OFFSET_MS).toISOString().slice(0, 10);

const DAY_MS = 24 * 60 * 60 * 1000;

type DailyRow = { day: string; pageviews: number | string; visitors: number | string };

export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get("days")) || 7, 1), 90);
  const now = Date.now();
  const until = wibDay(now);
  const since = wibDay(now - (days - 1) * DAY_MS);

  const admin = getSupabaseAdmin();
  const [daily, range, top] = await Promise.all([
    admin.rpc("samaqu_web_daily", { p_since: since, p_until: until }),
    admin.rpc("samaqu_web_range", { p_since: since, p_until: until }),
    admin.rpc("samaqu_web_top_paths", { p_since: since, p_until: until, p_limit: 5 }),
  ]);

  const firstError = daily.error || range.error || top.error;
  if (firstError) {
    // Migrasi belum dijalankan → beri pesan yang bisa langsung ditindak, bukan "gagal".
    const missing = /does not exist|schema cache|Could not find the function/i.test(firstError.message);
    return NextResponse.json(
      {
        error: missing
          ? "Tabel/fungsi analitik belum ada. Jalankan supabase/migrations/20261026_web_analytics.sql di Supabase."
          : firstError.message,
      },
      { status: missing ? 503 : 500 },
    );
  }

  const byDay = new Map<string, DailyRow>((daily.data || []).map((row: DailyRow) => [String(row.day), row]));

  // Isi hari yang kosong dengan 0 supaya grafik tidak bolong.
  const series = Array.from({ length: days }, (_, index) => {
    const day = wibDay(now - (days - 1 - index) * DAY_MS);
    const row = byDay.get(day);
    return {
      day,
      pageviews: Number(row?.pageviews) || 0,
      visitors: Number(row?.visitors) || 0,
    };
  });

  const todayRow = series[series.length - 1] || { day: until, pageviews: 0, visitors: 0 };
  const rangeRow = (range.data || [])[0];

  return NextResponse.json({
    days,
    since,
    until,
    today: todayRow,
    totals: {
      pageviews: Number(rangeRow?.pageviews) || 0,
      visitors: Number(rangeRow?.visitors) || 0,
    },
    series,
    top: (top.data || []).map((row: { path: string; pageviews: number | string; visitors: number | string }) => ({
      path: String(row.path),
      pageviews: Number(row.pageviews) || 0,
      visitors: Number(row.visitors) || 0,
    })),
  });
}
