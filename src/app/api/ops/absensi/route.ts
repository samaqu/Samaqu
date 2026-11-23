import { NextRequest, NextResponse } from "next/server";
import { opsIdentity, unauthorized } from "@/lib/ops-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { computeAbsensi, wibDay, wibDayStart, type SeenRow, type StatusLogRow } from "@/lib/absensi";

/**
 * GET /api/ops/absensi?month=YYYY-MM → absensi harian semua admin untuk satu bulan (WIB).
 *
 *  - SEMUA admin melihat: masuk, istirahat, pulang, penanda "lupa pulang" / "berjalan".
 *  - HANYA owner dan leader (penanggung jawab) menerima: jam kerja per hari dan total bulanan.
 *    Bagi admin lain angka jam kerja TIDAK dikirim sama sekali (dihapus di server, bukan sekadar disembunyikan di tampilan).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store, private" };
const PAGE = 1000;

export async function GET(req: NextRequest) {
  const me = await opsIdentity(req);
  if (!me) return unauthorized();

  const nowMs = Date.now();
  const rawMonth = new URL(req.url).searchParams.get("month") || "";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(rawMonth) ? rawMonth : wibDay(nowMs).slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;

  // Catatan mulai 7 hari sebelum bulan itu (sesi yang berawal di akhir bulan lalu), sampai awal bulan berikutnya.
  const fromMs = wibDayStart(`${month}-01`) - 7 * 86_400_000;
  const toMs = wibDayStart(`${nextMonth}-01`);
  const fromDay = wibDay(fromMs);
  const toDay = `${nextMonth}-01`;

  const canSeeHours = me.role === "owner" || me.role === "leader";
  const db = getSupabaseAdmin();

  const logs: StatusLogRow[] = [];
  for (let from = 0; from < 20 * PAGE; from += PAGE) {
    const { data, error } = await db
      .from("admin_status_log")
      .select("user_id, status, at, source")
      .gte("at", new Date(fromMs).toISOString())
      .lt("at", new Date(toMs).toISOString())
      .order("at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noStore });
    logs.push(...((data || []) as StatusLogRow[]));
    if (!data || data.length < PAGE) break;
  }

  const { data: seenData, error: seenError } = await db
    .from("admin_seen_daily")
    .select("user_id, day, last_seen")
    .gte("day", fromDay)
    .lt("day", toDay)
    .limit(5000);
  if (seenError) return NextResponse.json({ error: seenError.message }, { status: 500, headers: noStore });

  const { data: admins } = await db.from("admins").select("user_id, display_name, title, email, active");

  const users = (admins || []).map((a) => ({
    userId: String(a.user_id),
    name: String(a.display_name || "").trim() || String(a.email || "").split("@")[0],
    title: String(a.title || "").trim(),
    active: a.active !== false,
  }));

  // Akun yang sudah dihapus dari tabel admins tidak ditampilkan (catatannya tetap tersimpan di database, hanya tidak dikirim).
  const known = new Set(users.map((u) => u.userId));
  const days = computeAbsensi({ logs, seen: (seenData || []) as SeenRow[], month, nowMs }).filter((d) => known.has(d.userId));

  const out = days.map((d) => ({
    userId: d.userId,
    day: d.day,
    masuk: d.masuk,
    pulang: d.pulang,
    breakMs: d.breakMs,
    forgotPulang: d.forgotPulang,
    ongoing: d.ongoing,
    ...(canSeeHours ? { workMs: d.workMs } : {}),
  }));

  let totals: { userId: string; workMs: number; days: number; forgot: number }[] | undefined;
  if (canSeeHours) {
    const map = new Map<string, { userId: string; workMs: number; days: number; forgot: number }>();
    for (const d of days) {
      const t = map.get(d.userId) || { userId: d.userId, workMs: 0, days: 0, forgot: 0 };
      t.workMs += d.workMs;
      if (d.workMs > 0 || d.masuk) t.days += 1;
      if (d.forgotPulang) t.forgot += 1;
      map.set(d.userId, t);
    }
    totals = [...map.values()];
  }

  return NextResponse.json({ month, canSeeHours, users, days: out, ...(totals ? { totals } : {}) }, { headers: noStore });
}
