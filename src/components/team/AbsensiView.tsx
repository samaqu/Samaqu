"use client";

/**
 * Tab Absensi (di halaman Tim Admin).
 *
 *  1. "Absensi Saya": jam besar, status, jam masuk/pulang, jadwal, tombol Absen Masuk / Istirahat / Absen Pulang,
 *     dan rekap bulan berjalan (hari hadir, jam kerja, terlambat, lupa pulang, kehadiran %).
 *  2. Tabel tim per hari (transparansi): masuk, istirahat, pulang semua admin.
 *
 * Data dihitung server (/api/ops/absensi). Jam kerja admin LAIN hanya dikirim server ke Owner dan Leader;
 * jam kerja milik sendiri selalu terlihat di kartu pribadi.
 * Tombol kartu tidak mengganti status sendiri: ia MEMINTA header (STATUS_REQUEST_EVENT) supaya satu jalur,
 * termasuk konfirmasi Absen Pulang.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { STATUS_CHANGED_EVENT, STATUS_REQUEST_EVENT, needsCheckIn, type WorkStatus } from "@/lib/admin-status";
import { SCHEDULE, isWorkday, wibDay, wibMinutes } from "@/lib/absensi";

interface AbsensiDay {
  userId: string;
  day: string;
  masuk: string | null;
  pulang: string | null;
  breakMs: number;
  late: boolean;
  forgotPulang: boolean;
  ongoing: boolean;
  workMs?: number;
  overtimeMs?: number;
}
interface AbsensiUser {
  userId: string;
  name: string;
  title: string;
  active: boolean;
}
interface MySummary {
  workdays: number;
  hadir: number;
  hadirWorkdays: number;
  late: number;
  forgot: number;
  workMs: number;
  overtimeMs: number;
  kehadiran: number | null;
}
interface AbsensiResponse {
  month: string;
  canSeeHours: boolean;
  mine: {
    userId: string;
    status: WorkStatus;
    statusAt: string | null;
    today: { masuk: string | null; pulang: string | null; breakMs: number; workMs: number; overtimeMs: number; late: boolean; forgotPulang: boolean; ongoing: boolean } | null;
    summary: MySummary;
  };
  users: AbsensiUser[];
  days: AbsensiDay[];
  totals?: { userId: string; workMs: number; days: number; forgot: number }[];
}

const INK = "#1f2937";
const SUB = "#6b7280";
const LINE = "#e5e7eb";

const jakartaMonth = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" }).format(new Date());

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));

const dayLabel = (day: string) =>
  new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "short", timeZone: "Asia/Jakarta" }).format(new Date(`${day}T12:00:00+07:00`));

const clock = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jakarta" }).format(new Date(iso)) : "–";

const hm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

function duration(ms: number | undefined): string {
  if (ms === undefined) return "";
  const min = Math.round(ms / 60000);
  if (min <= 0) return "–";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}j ${m}m` : `${m}m`;
}

const chip = (bg: string, fg: string): React.CSSProperties => ({ background: bg, color: fg, borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 700, display: "inline-block" });

export default function AbsensiView() {
  const [month, setMonth] = useState(jakartaMonth());
  const [data, setData] = useState<AbsensiResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (target: string) => {
    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const res = await fetch(`/api/ops/absensi?month=${encodeURIComponent(target)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Gagal (HTTP ${res.status})`);
      setData(json as AbsensiResponse);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat absensi.");
    } finally {
      setLoading(false);
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load(month);
    // Segarkan saat status diganti (header/kartu) dan tiap menit, supaya durasi "Berjalan" ikut bergerak.
    const refresh = () => void load(month);
    window.addEventListener(STATUS_CHANGED_EVENT, refresh);
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 60_000);
    return () => {
      window.removeEventListener(STATUS_CHANGED_EVENT, refresh);
      clearInterval(id);
    };
  }, [load, month]);

  // Jam besar berjalan tiap detik (hanya tampilan; angka absen selalu dari server).
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const nameOf = useMemo(() => {
    const map = new Map<string, AbsensiUser>();
    for (const u of data?.users || []) map.set(u.userId, u);
    return map;
  }, [data]);

  const grouped = useMemo(() => {
    const byDay = new Map<string, AbsensiDay[]>();
    for (const d of data?.days || []) {
      const list = byDay.get(d.day) || [];
      list.push(d);
      byDay.set(d.day, list);
    }
    return [...byDay.entries()];
  }, [data]);

  const canSeeHours = Boolean(data?.canSeeHours);
  const isCurrent = month === jakartaMonth();

  function requestStatus(status: WorkStatus) {
    if (busy) return;
    setBusy(true);
    window.dispatchEvent(new CustomEvent(STATUS_REQUEST_EVENT, { detail: { status } }));
    // Kalau dibatalkan (mis. konfirmasi Absen Pulang ditolak) tidak ada perubahan; lepas tombol setelah sebentar.
    setTimeout(() => setBusy(false), 4000);
  }

  const navBtn: React.CSSProperties = {
    border: `1px solid ${LINE}`,
    background: "#fff",
    color: INK,
    borderRadius: 999,
    width: 34,
    height: 34,
    fontSize: 16,
    fontWeight: 800,
    cursor: "pointer",
  };
  const th: React.CSSProperties = { textAlign: "left", fontSize: 11.5, color: SUB, fontWeight: 700, padding: "8px 10px", textTransform: "uppercase", letterSpacing: 0.3 };
  const td: React.CSSProperties = { padding: "9px 10px", fontSize: 13.5, color: INK, borderTop: `1px solid ${LINE}` };
  const bigBtn = (primary: boolean): React.CSSProperties => ({
    border: primary ? 0 : `1px solid ${LINE}`,
    background: primary ? INK : "#fff",
    color: primary ? "#fff" : INK,
    borderRadius: 14,
    padding: "13px 22px",
    fontSize: 15,
    fontWeight: 800,
    cursor: busy ? "wait" : "pointer",
    opacity: busy ? 0.7 : 1,
  });

  // — kartu Absensi Saya —
  const mine = data?.mine;
  const today = wibDay(now);
  const workToday = isWorkday(today);
  const nowMin = wibMinutes(now);
  const belumMasuk = mine ? mine.status === "pulang" && needsCheckIn(mine.status, mine.statusAt, now) : false;
  const statusChip = !mine
    ? null
    : mine.status === "aktif"
      ? { label: "Sedang Bekerja", bg: "#dcfce7", fg: "#166534" }
      : mine.status === "istirahat"
        ? { label: "Istirahat", bg: "#fef3c7", fg: "#92400e" }
        : belumMasuk
          ? { label: "Belum Masuk", bg: "#f1f5f9", fg: "#475569" }
          : { label: "Sudah Pulang", bg: "#e0e7ff", fg: "#3730a3" };
  const lateNow = Boolean(mine?.today?.late) || (belumMasuk && workToday && nowMin > SCHEDULE.startMin + SCHEDULE.graceMin);

  const s = mine?.summary;
  const kehadiranTone = s?.kehadiran == null ? { bg: "#f1f5f9", fg: "#475569" } : s.kehadiran >= 90 ? { bg: "#dcfce7", fg: "#166534" } : s.kehadiran >= 75 ? { bg: "#fef3c7", fg: "#92400e" } : { bg: "#fee2e2", fg: "#991b1b" };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {isCurrent && mine && statusChip ? (
        <div style={{ border: `1px solid ${LINE}`, borderRadius: 18, background: "#fff", padding: "20px 22px", display: "grid", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: SUB, textTransform: "uppercase", letterSpacing: 0.4 }}>Absensi saya</span>
              <b style={{ fontSize: 42, lineHeight: 1.05, color: INK, fontVariantNumeric: "tabular-nums", letterSpacing: -1 }}>
                {new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Jakarta" }).format(now)}
              </b>
              <span style={{ fontSize: 13.5, color: SUB }}>
                {new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(now)} · WIB
              </span>
            </div>
            <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
              <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <span style={chip(statusChip.bg, statusChip.fg)}>{statusChip.label}</span>
                {lateNow ? <span style={chip("#fee2e2", "#991b1b")}>Terlambat</span> : null}
              </span>
              <span style={{ fontSize: 12.5, color: SUB }}>
                Masuk: <b style={{ color: INK }}>{clock(mine.today?.masuk ?? null)}</b> · Pulang: <b style={{ color: INK }}>{clock(mine.today?.pulang ?? null)}</b>
              </span>
              {mine.today ? (
                <span style={{ fontSize: 12.5, color: SUB }}>
                  Kerja hari ini: <b style={{ color: INK }}>{duration(mine.today.workMs)}</b>
                  {mine.today.breakMs > 0 ? ` · istirahat ${duration(mine.today.breakMs)}` : ""}
                </span>
              ) : null}
            </div>
          </div>

          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: "10px 14px", display: "grid", gap: 2 }}>
            <b style={{ fontSize: 13, color: INK }}>Jadwal hari ini</b>
            <span style={{ fontSize: 13, color: "#92400e" }}>
              {workToday
                ? `${hm(SCHEDULE.startMin)}–${hm(SCHEDULE.endMin)} · istirahat ${hm(SCHEDULE.breakStartMin)}–${hm(SCHEDULE.breakEndMin)} · toleransi ${SCHEDULE.graceMin} menit`
                : "Hari ini di luar jadwal kerja (Senin–Sabtu)."}
            </span>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {mine.status === "pulang" ? (
              <button type="button" style={bigBtn(true)} disabled={busy} onClick={() => requestStatus("aktif")}>
                {busy ? "Mencatat…" : belumMasuk ? "Absen Masuk" : "Absen Masuk lagi"}
              </button>
            ) : null}
            {mine.status === "aktif" ? (
              <>
                <button type="button" style={bigBtn(false)} disabled={busy} onClick={() => requestStatus("istirahat")}>
                  Istirahat
                </button>
                <button type="button" style={bigBtn(true)} disabled={busy} onClick={() => requestStatus("pulang")}>
                  Absen Pulang
                </button>
              </>
            ) : null}
            {mine.status === "istirahat" ? (
              <>
                <button type="button" style={bigBtn(false)} disabled={busy} onClick={() => requestStatus("aktif")}>
                  Lanjut kerja
                </button>
                <button type="button" style={bigBtn(true)} disabled={busy} onClick={() => requestStatus("pulang")}>
                  Absen Pulang
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {mine && s ? (
        <div style={{ border: `1px solid ${LINE}`, borderRadius: 18, background: "#fff", padding: "18px 22px", display: "grid", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <b style={{ fontSize: 16, color: INK }}>{isCurrent ? "Rekap Bulan Berjalan" : `Rekap ${monthLabel(month)}`}</b>
            <span style={chip(kehadiranTone.bg, kehadiranTone.fg)}>{s.kehadiran == null ? "Kehadiran –" : `Kehadiran ${s.kehadiran}%`}</span>
          </div>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
            {[
              { k: "Hari hadir", v: `${s.hadirWorkdays} / ${s.workdays}`, sub: "hari kerja" },
              { k: "Jam kerja", v: duration(s.workMs), sub: s.overtimeMs > 0 ? `termasuk lembur ${duration(s.overtimeMs)}` : "total bulan ini" },
              { k: "Terlambat", v: `${s.late}×`, sub: `lewat ${hm(SCHEDULE.startMin + SCHEDULE.graceMin)}` },
              { k: "Lupa pulang", v: `${s.forgot}×`, sub: "perlu dikoreksi" },
            ].map((c) => (
              <div key={c.k} style={{ border: `1px solid ${LINE}`, borderRadius: 14, padding: "12px 14px", display: "grid", gap: 2 }}>
                <span style={{ fontSize: 12, color: SUB, fontWeight: 700 }}>{c.k}</span>
                <b style={{ fontSize: 22, color: INK }}>{c.v}</b>
                <span style={{ fontSize: 11.5, color: SUB }}>{c.sub}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
        <b style={{ fontSize: 15, color: INK, marginRight: 6 }}>Absensi tim</b>
        <button type="button" style={navBtn} aria-label="Bulan sebelumnya" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
          ‹
        </button>
        <b style={{ fontSize: 15, color: INK, minWidth: 140, textAlign: "center" }}>{monthLabel(month)}</b>
        <button type="button" style={{ ...navBtn, opacity: isCurrent ? 0.4 : 1 }} aria-label="Bulan berikutnya" disabled={isCurrent} onClick={() => setMonth((m) => shiftMonth(m, 1))}>
          ›
        </button>
        <span style={{ fontSize: 12, color: SUB }}>Jam dalam WIB. Status dipilih admin sendiri.</span>
      </div>

      {error ? <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 12, padding: "10px 14px", fontSize: 13, fontWeight: 600 }}>{error}</div> : null}

      {canSeeHours && data?.totals && data.totals.length > 0 ? (
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          {data.totals.map((t) => {
            const u = nameOf.get(t.userId);
            return (
              <div key={t.userId} style={{ border: `1px solid ${LINE}`, borderRadius: 14, background: "#fff", padding: 14, display: "grid", gap: 4, alignContent: "start" }}>
                <span style={{ fontSize: 12, color: SUB, fontWeight: 700 }}>{u?.name || "Admin"}</span>
                <b style={{ fontSize: 22, color: INK }}>{duration(t.workMs)}</b>
                <span style={{ fontSize: 12, color: SUB }}>
                  {t.days} hari kerja{t.forgot ? ` · ${t.forgot}× lupa pulang` : ""}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}

      {loading && !data ? (
        <p style={{ color: SUB, fontSize: 13 }}>Memuat…</p>
      ) : grouped.length === 0 ? (
        <div style={{ border: `1px dashed ${LINE}`, borderRadius: 14, padding: 18, color: SUB, fontSize: 13.5, background: "#fff" }}>
          Belum ada catatan absensi di bulan ini. Catatan terkumpul dari tombol Absen Masuk, Istirahat, dan Absen Pulang.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {grouped.map(([day, rows]) => (
            <div key={day} style={{ border: `1px solid ${LINE}`, borderRadius: 14, background: "#fff", overflowX: "auto" }}>
              <div style={{ padding: "10px 14px", fontWeight: 800, color: INK, fontSize: 14, background: "#f8fafc", borderBottom: `1px solid ${LINE}`, borderRadius: "14px 14px 0 0" }}>{dayLabel(day)}</div>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                <thead>
                  <tr>
                    <th style={th}>Admin</th>
                    <th style={th}>Masuk</th>
                    <th style={th}>Istirahat</th>
                    <th style={th}>Pulang</th>
                    {canSeeHours ? <th style={th}>Jam kerja</th> : null}
                    <th style={th}>Catatan</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.day}-${r.userId}`}>
                      <td style={{ ...td, fontWeight: 700 }}>{nameOf.get(r.userId)?.name || "(akun dihapus)"}</td>
                      <td style={td}>{clock(r.masuk)}</td>
                      <td style={td}>{duration(r.breakMs)}</td>
                      <td style={td}>{clock(r.pulang)}</td>
                      {canSeeHours ? (
                        <td style={{ ...td, fontWeight: 700 }}>
                          {duration(r.workMs)}
                          {r.overtimeMs ? <span style={{ fontWeight: 600, color: SUB, fontSize: 12 }}> (+{duration(r.overtimeMs)} lembur)</span> : null}
                        </td>
                      ) : null}
                      <td style={td}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {r.ongoing ? <span style={chip("#e0f2fe", "#075985")}>Berjalan</span> : null}
                          {r.late ? <span style={chip("#fef3c7", "#92400e")}>Terlambat</span> : null}
                          {r.forgotPulang ? <span style={chip("#fee2e2", "#991b1b")}>Lupa pulang</span> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
