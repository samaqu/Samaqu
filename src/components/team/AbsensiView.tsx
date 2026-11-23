"use client";

/**
 * Tab Absensi (di halaman Tim Admin): jam masuk, istirahat, pulang tiap admin per hari.
 *
 * Data dihitung server (/api/ops/absensi) dari klik status di header + jam terakhir terlihat.
 * Semua admin melihat masuk/istirahat/pulang; jam kerja & total bulanan hanya dikirim server ke Owner dan Penanggung Jawab.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { STATUS_CHANGED_EVENT } from "@/lib/admin-status";

interface AbsensiDay {
  userId: string;
  day: string;
  masuk: string | null;
  pulang: string | null;
  breakMs: number;
  forgotPulang: boolean;
  ongoing: boolean;
  workMs?: number;
}
interface AbsensiUser {
  userId: string;
  name: string;
  title: string;
  active: boolean;
}
interface AbsensiResponse {
  month: string;
  canSeeHours: boolean;
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

function duration(ms: number | undefined): string {
  if (ms === undefined) return "";
  const min = Math.round(ms / 60000);
  if (min <= 0) return "–";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}j ${m}m` : `${m}m`;
}

export default function AbsensiView() {
  const [month, setMonth] = useState(jakartaMonth());
  const [data, setData] = useState<AbsensiResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

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
    }
  }, []);

  useEffect(() => {
    void load(month);
    // Segarkan saat status diganti dari header (tab yang sama) dan tiap menit, supaya durasi "Berjalan" ikut bergerak.
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

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button type="button" style={navBtn} aria-label="Bulan sebelumnya" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
          ‹
        </button>
        <b style={{ fontSize: 15, color: INK, minWidth: 140, textAlign: "center" }}>{monthLabel(month)}</b>
        <button type="button" style={{ ...navBtn, opacity: isCurrent ? 0.4 : 1 }} aria-label="Bulan berikutnya" disabled={isCurrent} onClick={() => setMonth((m) => shiftMonth(m, 1))}>
          ›
        </button>
        <span style={{ fontSize: 12, color: SUB }}>Jam dalam WIB. Status dipilih admin sendiri di header panel.</span>
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
          Belum ada catatan absensi di bulan ini. Catatan terkumpul dari klik status (Aktif, Istirahat, Pulang) di header panel.
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
                      {canSeeHours ? <td style={{ ...td, fontWeight: 700 }}>{duration(r.workMs)}</td> : null}
                      <td style={td}>
                        {r.ongoing ? <span style={{ background: "#e0f2fe", color: "#075985", borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>Berjalan</span> : null}
                        {r.forgotPulang ? <span style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>Lupa pulang</span> : null}
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
