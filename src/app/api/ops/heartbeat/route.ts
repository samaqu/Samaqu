import { NextRequest, NextResponse } from "next/server";
import { opsIdentity, unauthorized } from "@/lib/ops-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { wibDay, wibDayStart } from "@/lib/absensi";

/**
 * POST /api/ops/heartbeat → catat "terakhir terlihat" AKUN SENDIRI.
 * Dipanggil panel tiap ±2 menit selama tab terlihat. Baris yang diubah selalu milik pemanggil.
 *
 * Yang dikerjakan:
 *  1. Lupa klik Pulang kemarin? Status yang tersisa dari hari WIB sebelumnya ditutup otomatis jadi 'pulang'
 *     (catatan source='auto' di admin_status_log, waktunya = jam terakhir terlihat), sehingga hari ini mulai bersih.
 *  2. admins.last_seen_at diperbarui, dan admin_seen_daily (pertama/terakhir terlihat hari ini) diisi.
 * Penulisan dilewati bila angka tersimpan masih baru (< 60 detik) supaya tab ganda tidak menulis berulang.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MIN_GAP_MS = 60_000;
const noStore = { "Cache-Control": "no-store, private" };

export async function POST(req: NextRequest) {
  const me = await opsIdentity(req);
  if (!me) return unauthorized();

  const admin = getSupabaseAdmin();
  const { data: row, error: readError } = await admin
    .from("admins")
    .select("last_seen_at, status, status_at")
    .eq("user_id", me.userId)
    .maybeSingle();
  if (readError) {
    // Kolom belum ada (migrasi belum jalan) atau galat sesaat: panel tidak perlu tahu, cukup diam.
    return NextResponse.json({ ok: false }, { status: 200, headers: noStore });
  }

  const nowMs = Date.now();
  const lastSeenMs = row?.last_seen_at ? Date.parse(String(row.last_seen_at)) : 0;
  if (lastSeenMs && nowMs - lastSeenMs < MIN_GAP_MS) {
    return NextResponse.json({ ok: true, skipped: true }, { headers: noStore });
  }

  const today = wibDay(nowMs);

  // 1) Status sisa dari hari sebelumnya (lupa klik Pulang) → tutup otomatis.
  let closedPrevious: string | null = null;
  const statusAtMs = row?.status_at ? Date.parse(String(row.status_at)) : 0;
  if ((row?.status === "aktif" || row?.status === "istirahat") && statusAtMs && statusAtMs < wibDayStart(today)) {
    // Batas wajar: jam terakhir terlihat; kalau tidak ada yang lebih baru dari status itu, pakai saat status dipasang.
    const closeMs = Math.max(statusAtMs, lastSeenMs);
    const closeAt = new Date(Math.min(closeMs, wibDayStart(today) - 1000)).toISOString();
    const { error: closeError } = await admin
      .from("admins")
      .update({ status: "pulang", status_at: closeAt })
      .eq("user_id", me.userId)
      .eq("status", row.status);
    if (closeError) {
      console.error("[OPS-HEARTBEAT] gagal menutup status kemarin:", closeError.message);
    } else {
      const { error: logError } = await admin
        .from("admin_status_log")
        .insert({ user_id: me.userId, status: "pulang", at: closeAt, source: "auto" });
      if (logError) console.error("[OPS-HEARTBEAT] gagal mencatat Pulang otomatis:", logError.message);
      closedPrevious = closeAt;
    }
  }

  // 2) Terakhir terlihat (umum + per hari).
  const nowIso = new Date(nowMs).toISOString();
  const { error } = await admin.from("admins").update({ last_seen_at: nowIso }).eq("user_id", me.userId);
  if (error) console.error("[OPS-HEARTBEAT] gagal menulis last_seen_at:", error.message);

  // Payload tanpa first_seen: saat baris hari ini sudah ada, first_seen lama dipertahankan.
  const { error: dailyError } = await admin
    .from("admin_seen_daily")
    .upsert({ user_id: me.userId, day: today, last_seen: nowIso }, { onConflict: "user_id,day" });
  if (dailyError) console.error("[OPS-HEARTBEAT] gagal menulis admin_seen_daily:", dailyError.message);

  // `closedPrevious` memberi tahu panel bahwa status kemarin baru saja ditutup, supaya banner "belum absen masuk" langsung tampil.
  return NextResponse.json({ ok: !error, ...(closedPrevious ? { closedPrevious } : {}) }, { headers: noStore });
}
