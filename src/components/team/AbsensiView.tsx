"use client";

/**
 * Tab Absensi (di halaman Tim Admin).
 *
 *  1. "Absensi Saya": jam besar, status, jam masuk/pulang, jadwal, tombol Absen Masuk / Istirahat / Absen Pulang.
 *  2. Rekap bulanan (hari hadir, jam kerja, terlambat, lupa absen pulang, kehadiran %), ditulis dengan kalimat jelas.
 *  3. Riwayat per hari berbentuk kartu (tanpa singkatan, rapi juga di HP).
 *
 * Admin biasa hanya menerima data dirinya sendiri; Owner dan Leader menerima semua admin dan bisa memilih
 * siapa yang dilihat. Pembatasan ini dijaga di SERVER (/api/ops/absensi), bukan hanya di tampilan.
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
  workMs: number;
  overtimeMs: number;
  late: boolean;
  forgotPulang: boolean;
  ongoing: boolean;
}
interface AbsensiUser {
  userId: string;
  name: string;
  title: string;
  active: boolean;
}
interface Summary {
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
  canSeeOthers: boolean;
  mine: {
    userId: string;
    status: WorkStatus;
    statusAt: string | null;
    today: AbsensiDay | null;
  };
  users: AbsensiUser[];
  summaries: Record<string, Summary>;
  days: AbsensiDay[];
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
  new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(`${day}T12:00:00+07:00`));

/** "10.02 WIB" atau null bila belum ada. */
const clockWib = (iso: string | null | undefined) =>
  iso ? `${new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jakarta" }).format(new Date(iso))} WIB` : null;

/** Menit sejak 00:00 → "08.00". */
const hm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}.${String(min % 60).padStart(2, "0")}`;

/** Durasi ditulis lengkap: "1 jam 22 menit", "3 menit", "2 jam". */
function durationLong(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min <= 0) return ms > 0 ? "Kurang dari 1 menit" : "0 menit";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} jam ${m} menit`;
  if (h) return `${h} jam`;
  return `${m} menit`;
}

const chip = (bg: string, fg: string): React.CSSProperties => ({ background: bg, color: fg, borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 700, display: "inline-block", whiteSpace: "nowrap" });
const card: React.CSSProperties = { border: `1px solid ${LINE}`, borderRadius: 18, background: "#fff" };

function Field({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div style={{ display: "grid", gap: 2, alignContent: "start" }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: SUB, textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</span>
      <b style={{ fontSize: 15, color: muted ? SUB : INK, fontWeight: muted ? 600 : 800 }}>{value}</b>
    </div>
  );
}

export default function AbsensiView() {
  const [month, setMonth] = useState(jakartaMonth());
  const [data, setData] = useState<AbsensiResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  /** "me" = diri sendiri, "all" = semua admin (Owner/Leader), selain itu = user id admin tertentu. */
  const [viewing, setViewing] = useState<string>("me");

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
    // Segarkan saat status diganti (header/kartu) dan tiap menit, supaya durasi yang berjalan ikut bergerak.
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

  const mine = data?.mine;
  const nameOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of data?.users || []) map.set(u.userId, u.name);
    return map;
  }, [data]);

  const canSeeOthers = Boolean(data?.canSeeOthers);
  const selectedId = viewing === "all" ? null : viewing === "me" ? mine?.userId ?? null : viewing;
  const isSelf = selectedId !== null && selectedId === mine?.userId;
  const isCurrent = month === jakartaMonth();

  const shownDays = useMemo(() => {
    const list = (data?.days || []).filter((d) => selectedId === null || d.userId === selectedId);
    return list.sort((a, b) => (a.day === b.day ? 0 : a.day < b.day ? 1 : -1));
  }, [data, selectedId]);

  function requestStatus(status: WorkStatus) {
    if (busy) return;
    setBusy(true);
    window.dispatchEvent(new CustomEvent(STATUS_REQUEST_EVENT, { detail: { status } }));
    // Kalau dibatalkan (mis. konfirmasi Absen Pulang ditolak) tidak ada perubahan; lepas tombol setelah sebentar.
    setTimeout(() => setBusy(false), 4000);
  }

  const navBtn: React.CSSProperties = { border: `1px solid ${LINE}`, background: "#fff", color: INK, borderRadius: 999, width: 34, height: 34, fontSize: 16, fontWeight: 800, cursor: "pointer" };
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
  const pickBtn = (active: boolean): React.CSSProperties => ({
    border: `1px solid ${active ? INK : LINE}`,
    background: active ? INK : "#fff",
    color: active ? "#fff" : INK,
    borderRadius: 999,
    padding: "6px 14px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  });

  // — kartu Absensi Saya —
  const today = wibDay(now);
  const workToday = isWorkday(today);
  const nowMin = wibMinutes(now);
  const belumMasuk = mine ? mine.status === "pulang" && needsCheckIn(mine.status, mine.statusAt, now) : false;
  const statusChip = !mine
    ? null
    : mine.status === "aktif"
      ? { label: "Sedang Bekerja", bg: "#dcfce7", fg: "#166534" }
      : mine.status === "istirahat"
        ? { label: "Sedang Istirahat", bg: "#fef3c7", fg: "#92400e" }
        : belumMasuk
          ? { label: "Belum Masuk", bg: "#f1f5f9", fg: "#475569" }
          : { label: "Sudah Pulang", bg: "#e0e7ff", fg: "#3730a3" };
  const lateNow = Boolean(mine?.today?.late) || (belumMasuk && workToday && nowMin > SCHEDULE.startMin + SCHEDULE.graceMin);

  // — rekap —
  const summary = selectedId ? data?.summaries[selectedId] : undefined;
  const tone =
    summary?.kehadiran == null ? { bg: "#f1f5f9", fg: "#475569", bar: "#94a3b8" } : summary.kehadiran >= 90 ? { bg: "#dcfce7", fg: "#166534", bar: "#16a34a" } : summary.kehadiran >= 75 ? { bg: "#fef3c7", fg: "#92400e", bar: "#f59e0b" } : { bg: "#fee2e2", fg: "#991b1b", bar: "#ef4444" };
  const rekapTitle = isCurrent ? "Rekap Bulan Berjalan" : `Rekap ${monthLabel(month)}`;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {isCurrent && mine && statusChip ? (
        <div style={{ ...card, padding: "20px 22px", display: "grid", gap: 14 }}>
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
              <span style={{ fontSize: 13, color: SUB }}>
                Masuk: <b style={{ color: INK }}>{clockWib(mine.today?.masuk) ?? "Belum masuk"}</b> · Pulang: <b style={{ color: INK }}>{clockWib(mine.today?.pulang) ?? "Belum pulang"}</b>
              </span>
              {mine.today ? (
                <span style={{ fontSize: 13, color: SUB }}>
                  Sudah bekerja: <b style={{ color: INK }}>{durationLong(mine.today.workMs)}</b>
                  {mine.today.breakMs > 0 ? ` · istirahat ${durationLong(mine.today.breakMs)}` : ""}
                </span>
              ) : null}
            </div>
          </div>

          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: "10px 14px", display: "grid", gap: 2 }}>
            <b style={{ fontSize: 13, color: INK }}>Jadwal hari ini</b>
            <span style={{ fontSize: 13, color: "#92400e" }}>
              {workToday
                ? `Jam kerja ${hm(SCHEDULE.startMin)}–${hm(SCHEDULE.endMin)} WIB · Istirahat ${hm(SCHEDULE.breakStartMin)}–${hm(SCHEDULE.breakEndMin)} WIB · Toleransi terlambat ${SCHEDULE.graceMin} menit`
                : "Hari ini di luar jadwal kerja (jadwal kerja Senin sampai Sabtu)."}
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

      {/* pemilih bulan + (Owner/Leader) pemilih admin */}
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button type="button" style={navBtn} aria-label="Bulan sebelumnya" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
            ‹
          </button>
          <b style={{ fontSize: 16, color: INK, minWidth: 150, textAlign: "center" }}>{monthLabel(month)}</b>
          <button type="button" style={{ ...navBtn, opacity: isCurrent ? 0.4 : 1 }} aria-label="Bulan berikutnya" disabled={isCurrent} onClick={() => setMonth((m) => shiftMonth(m, 1))}>
            ›
          </button>
          <span style={{ fontSize: 12.5, color: SUB }}>Semua jam dalam WIB.</span>
        </div>
        {canSeeOthers && data && data.users.length > 1 ? (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12.5, color: SUB, fontWeight: 700, marginRight: 4 }}>Lihat absensi:</span>
            <button type="button" style={pickBtn(viewing === "me")} onClick={() => setViewing("me")}>
              Saya
            </button>
            {data.users
              .filter((u) => u.userId !== mine?.userId)
              .map((u) => (
                <button key={u.userId} type="button" style={pickBtn(viewing === u.userId)} onClick={() => setViewing(u.userId)}>
                  {u.name}
                </button>
              ))}
            <button type="button" style={pickBtn(viewing === "all")} onClick={() => setViewing("all")}>
              Semua admin
            </button>
          </div>
        ) : null}
      </div>

      {error ? <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 12, padding: "10px 14px", fontSize: 13, fontWeight: 600 }}>{error}</div> : null}

      {/* rekap satu admin */}
      {data && selectedId && summary ? (
        <div style={{ ...card, padding: "20px 22px", display: "grid", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "grid", gap: 2 }}>
              <b style={{ fontSize: 17, color: INK }}>{rekapTitle}</b>
              <span style={{ fontSize: 13, color: SUB }}>
                {isSelf ? `${monthLabel(month)}, atas nama Anda` : `${monthLabel(month)}, atas nama ${nameOf.get(selectedId) || "admin"}`}
              </span>
            </div>
            <span style={chip(tone.bg, tone.fg)}>{summary.kehadiran == null ? "Kehadiran belum bisa dihitung" : `Kehadiran ${summary.kehadiran}%`}</span>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ height: 10, background: "#f1f5f9", borderRadius: 999, overflow: "hidden" }}>
              <div style={{ width: `${summary.kehadiran ?? 0}%`, height: "100%", background: tone.bar, borderRadius: 999 }} />
            </div>
            <span style={{ fontSize: 13.5, color: INK }}>
              {summary.workdays > 0
                ? `Hadir ${summary.hadirWorkdays} hari dari ${summary.workdays} hari kerja yang sudah berjalan.`
                : "Belum ada hari kerja yang berjalan di bulan ini."}
            </span>
          </div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            {[
              { k: "Total jam kerja", v: durationLong(summary.workMs), sub: summary.overtimeMs > 0 ? `Termasuk lembur ${durationLong(summary.overtimeMs)}` : "Dihitung dari waktu berstatus Aktif" },
              { k: "Terlambat", v: `${summary.late} kali`, sub: `Absen masuk lewat pukul ${hm(SCHEDULE.startMin + SCHEDULE.graceMin)} WIB` },
              { k: "Lupa absen pulang", v: `${summary.forgot} kali`, sub: "Hari yang jam pulangnya perlu dikoreksi" },
              { k: "Hari ada absen masuk", v: `${summary.hadir} hari`, sub: "Termasuk hari di luar jadwal kerja" },
            ].map((c) => (
              <div key={c.k} style={{ background: "#f8fafc", borderRadius: 14, padding: "12px 14px", display: "grid", gap: 3, alignContent: "start" }}>
                <span style={{ fontSize: 12.5, color: SUB, fontWeight: 700 }}>{c.k}</span>
                <b style={{ fontSize: 20, color: INK }}>{c.v}</b>
                <span style={{ fontSize: 12.5, color: SUB }}>{c.sub}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ringkasan semua admin (Owner/Leader) */}
      {data && selectedId === null ? (
        <div style={{ ...card, padding: "18px 22px", display: "grid", gap: 12 }}>
          <b style={{ fontSize: 17, color: INK }}>{rekapTitle}: semua admin</b>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            {data.users.map((u) => {
              const s = data.summaries[u.userId];
              if (!s) return null;
              return (
                <div key={u.userId} style={{ background: "#f8fafc", borderRadius: 14, padding: "12px 14px", display: "grid", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                    <b style={{ fontSize: 15, color: INK }}>{u.name}</b>
                    <span style={chip("#fff", INK)}>{s.kehadiran == null ? "Kehadiran –" : `Kehadiran ${s.kehadiran}%`}</span>
                  </div>
                  <span style={{ fontSize: 13, color: SUB }}>Jam kerja: <b style={{ color: INK }}>{durationLong(s.workMs)}</b></span>
                  <span style={{ fontSize: 13, color: SUB }}>
                    Terlambat <b style={{ color: INK }}>{s.late} kali</b> · Lupa absen pulang <b style={{ color: INK }}>{s.forgot} kali</b>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* riwayat per hari */}
      <div style={{ display: "grid", gap: 10 }}>
        <b style={{ fontSize: 17, color: INK }}>
          Riwayat {selectedId === null ? "semua admin" : isSelf ? "saya" : nameOf.get(selectedId) || "admin"}
        </b>
        {loading && !data ? (
          <p style={{ color: SUB, fontSize: 13 }}>Memuat…</p>
        ) : shownDays.length === 0 ? (
          <div style={{ border: `1px dashed ${LINE}`, borderRadius: 14, padding: 18, color: SUB, fontSize: 13.5, background: "#fff" }}>
            Belum ada catatan absensi di bulan ini. Catatan terkumpul dari tombol Absen Masuk, Istirahat, dan Absen Pulang.
          </div>
        ) : (
          shownDays.map((d) => {
            const workday = isWorkday(d.day);
            const onTime = Boolean(d.masuk) && workday && !d.late;
            return (
              <div key={`${d.day}-${d.userId}`} style={{ ...card, borderRadius: 16, padding: "14px 18px", display: "grid", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <b style={{ fontSize: 15, color: INK }}>{dayLabel(d.day)}</b>
                    {selectedId === null ? <span style={chip("#e0e7ff", "#3730a3")}>{nameOf.get(d.userId) || "Admin"}</span> : null}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {d.ongoing ? <span style={chip("#e0f2fe", "#075985")}>Sedang berjalan</span> : null}
                    {d.late ? <span style={chip("#fef3c7", "#92400e")}>Terlambat</span> : null}
                    {onTime ? <span style={chip("#dcfce7", "#166534")}>Tepat waktu</span> : null}
                    {d.overtimeMs > 0 ? <span style={chip("#ede9fe", "#5b21b6")}>Lembur {durationLong(d.overtimeMs)}</span> : null}
                    {d.forgotPulang ? <span style={chip("#fee2e2", "#991b1b")}>Lupa absen pulang</span> : null}
                  </div>
                </div>
                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
                  <Field label="Masuk" value={clockWib(d.masuk) ?? "Belum masuk"} muted={!d.masuk} />
                  <Field label="Istirahat" value={d.breakMs > 0 ? durationLong(d.breakMs) : d.ongoing ? "Belum istirahat" : "Tidak istirahat"} muted={d.breakMs <= 0} />
                  <Field label="Pulang" value={clockWib(d.pulang) ?? (d.masuk ? "Belum pulang" : "–")} muted={!d.pulang} />
                  <Field label="Jam kerja" value={durationLong(d.workMs)} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
