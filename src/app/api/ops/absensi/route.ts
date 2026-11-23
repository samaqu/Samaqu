import { NextRequest, NextResponse } from "next/server";
import { opsIdentity, unauthorized } from "@/lib/ops-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { SCHEDULE, computeAbsensi, summarize, wibDay, wibDayStart, type AbsensiSummary, type SeenRow, type StatusLogRow } from "@/lib/absensi";

/**
 * GET /api/ops/absensi?month=YYYY-MM → absensi untuk satu bulan (WIB), menurut peran pemanggil.
 *
 *  - Admin biasa : HANYA data dirinya sendiri (riwayat harian + rekap). Data admin lain tidak dikirim sama sekali.
 *  - Owner/Leader: data semua admin (untuk penilaian), dipilih di tampilan lewat pemilih admin.
 * Pembatasan ini dijaga di SERVER: admin biasa tidak bisa melihat absensi orang lain walau membuka Network/Inspect.
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

  const canSeeOthers = me.role === "owner" || me.role === "leader";
  const db = getSupabaseAdmin();

  const logs: StatusLogRow[] = [];
  for (let from = 0; from < 20 * PAGE; from += PAGE) {
    let query = db
      .from("admin_status_log")
      .select("user_id, status, at, source")
      .gte("at", new Date(fromMs).toISOString())
      .lt("at", new Date(toMs).toISOString())
      .order("at", { ascending: true })
      .range(from, from + PAGE - 1);
    // Admin biasa: hanya baris miliknya yang pernah dibaca dari database.
    if (!canSeeOthers) query = query.eq("user_id", me.userId);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noStore });
    logs.push(...((data || []) as StatusLogRow[]));
    if (!data || data.length < PAGE) break;
  }

  let seenQuery = db.from("admin_seen_daily").select("user_id, day, last_seen").gte("day", fromDay).lt("day", toDay).limit(5000);
  if (!canSeeOthers) seenQuery = seenQuery.eq("user_id", me.userId);
  const { data: seenData, error: seenError } = await seenQuery;
  if (seenError) return NextResponse.json({ error: seenError.message }, { status: 500, headers: noStore });

  const { data: admins } = await db.from("admins").select("user_id, display_name, title, email, active, status, status_at, is_bot");

  // Akun yang sudah dihapus dari tabel admins tidak ditampilkan (catatannya tetap tersimpan, hanya tidak dikirim).
  // Akun bot (is_bot) tidak punya absensi: dikecualikan.
  const users = (admins || [])
    .filter((a) => a.is_bot !== true)
    .map((a) => ({
      userId: String(a.user_id),
      name: String(a.display_name || "").trim() || String(a.email || "").split("@")[0],
      title: String(a.title || "").trim(),
      active: a.active !== false,
    }))
    .filter((u) => canSeeOthers || u.userId === me.userId);

  const known = new Set(users.map((u) => u.userId));
  const days = computeAbsensi({ logs, seen: (seenData || []) as SeenRow[], month, nowMs }).filter((d) => known.has(d.userId));

  const summaries: Record<string, AbsensiSummary> = {};
  for (const u of users) {
    summaries[u.userId] = summarize(days.filter((d) => d.userId === u.userId), month, nowMs);
  }

  const mineRow = (admins || []).find((a) => String(a.user_id) === me.userId);
  const myDays = days.filter((d) => d.userId === me.userId);
  const mine = {
    userId: me.userId,
    status: mineRow?.status === "aktif" || mineRow?.status === "istirahat" ? mineRow.status : "pulang",
    statusAt: mineRow?.status_at ? String(mineRow.status_at) : null,
    today: myDays.find((d) => d.day === wibDay(nowMs)) || null,
  };

  return NextResponse.json({ month, canSeeOthers, schedule: SCHEDULE, mine, users, summaries, days }, { headers: noStore });
}
