"use client";

/**
 * Halaman "Performa Admin": kecepatan respons chat WhatsApp + SLA.
 *  - Tab "Performa saya": SETIAP peran hanya melihat data dirinya sendiri (dijaga di server, /api/ops/performa).
 *  - Tab "Bot vs Admin" dan "Pengaturan SLA": hanya Owner dan Leader (ringkasan gabungan tanpa nama per orang).
 * Rumus ada di lib/sla.ts. Warna memakai variabel tema panel; hanya warna status (terlambat) yang tetap.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { wibDay } from "@/lib/absensi";

interface Config {
  name: string;
  targetResponseMin: number;
  warningMin: number;
  lateMin: number;
  openTime: string;
  closeTime: string;
  opDays: number[];
  queueAlertThreshold: number;
  countOutsideHours: boolean;
}
interface Perf {
  handled: number;
  finished: number;
  viaPhone: number;
  pending: number;
  avgResponseMin: number | null;
  late: number;
  warning: number;
  slaPct: number | null;
  measured: number;
}
interface Stats {
  count: number;
  medianMin: number | null;
  p90Min: number | null;
  avgMin: number | null;
}
interface Waiting {
  sender: string;
  name: string;
  startAt: string;
  waitMin: number;
  inHours: boolean;
  level: "ok" | "warning" | "late" | "luar-jam";
}
interface Data {
  range: { from: string; to: string };
  config: Config;
  canManage: boolean;
  me: { name: string; email: string };
  perf: Perf;
  daily: { day: string; perf: Perf }[];
  waiting: Waiting[];
  comparison: { bot: Stats; team: Stats & { viaPhone: number; slaPct: number | null }; episodes: number; unanswered: number } | null;
}

const LATE = { fg: "#b91c1c", bg: "#fee2e2" };
const WARN = { fg: "var(--orange)", bg: "var(--orange-bg)" };
const GOOD = { fg: "var(--green)", bg: "var(--green-bg)" };
const NEUTRAL = { fg: "var(--mut)", bg: "var(--pink-bg)" };
const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const DAY_LONG = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const id = (v: number, d = 1) => v.toFixed(d).replace(".", ",");
/** Menit → kalimat singkat yang mudah dibaca: "40 detik", "3,2 menit", "1 jam 05 menit". */
function fmtMin(v: number | null): string {
  if (v === null) return "—";
  if (v < 1) return `${Math.round(v * 60)} detik`;
  if (v < 60) return `${id(v)} menit`;
  const h = Math.floor(v / 60);
  return `${h} jam ${String(Math.round(v - h * 60)).padStart(2, "0")} menit`;
}
const dayParts = (day: string) => {
  const d = new Date(`${day}T00:00:00Z`);
  return { dow: d.getUTCDay(), date: d.getUTCDate(), month: MONTHS[d.getUTCMonth()] };
};
const fmtDay = (day: string) => {
  const p = dayParts(day);
  return `${DAY_LONG[p.dow]}, ${p.date} ${p.month}`;
};
const daysText = (days: number[]) => (days.length === 7 ? "setiap hari" : days.map((d) => DAY_NAMES[d]).join(", "));
const shiftDay = (day: string, delta: number) => new Date(Date.parse(`${day}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10);

/** 6281234567890 → 0812-3456-7890 */
function fmtPhone(s: string): string {
  const digits = String(s).replace(/\D/g, "");
  const local = digits.startsWith("62") ? `0${digits.slice(2)}` : digits;
  return local.length > 8 ? `${local.slice(0, 4)}-${local.slice(4, 8)}-${local.slice(8)}` : local;
}
const initials = (name: string, phone: string) => {
  const parts = name.replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (parts.length) return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  return phone.slice(-2);
};

const card: React.CSSProperties = { background: "#fff", border: "1px solid var(--card-line)", borderRadius: 20, padding: "18px 20px", boxShadow: "0 6px 18px rgba(0,0,0,.04)" };
const label: React.CSSProperties = { fontSize: 11.5, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", color: "var(--mut)" };
const btn: React.CSSProperties = { border: "1px solid var(--card-line)", background: "#fff", color: "var(--plum)", borderRadius: 12, height: 36, padding: "0 14px", fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };

const Icon = ({ d, size = 18 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const I_CHAT = "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z";
const I_TIMER = "M12 8v5l3 2M9 2h6M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16z";
const I_ALERT = "M12 3l10 18H2L12 3zM12 10v5M12 18h.01";
const I_TARGET = "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z";
const I_CLOCK = "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2";
const I_PDF = "M12 3v12m0 0l-4-4m4 4l4-4M4 17v3h16v-3";
const I_OPEN = "M7 17L17 7M9 7h8v8";

/** Cincin persen (SLA). */
function Ring({ pct }: { pct: number | null }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const v = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  const color = pct === null ? "var(--card-line)" : pct >= 80 ? "var(--green)" : pct >= 50 ? "var(--orange)" : LATE.fg;
  return (
    <svg width="58" height="58" viewBox="0 0 70 70" aria-hidden="true">
      <circle cx="35" cy="35" r={r} fill="none" stroke="var(--card-line)" strokeWidth="8" />
      <circle cx="35" cy="35" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 35 35)" />
    </svg>
  );
}

function Kpi({ icon, tone, title, value, sub, ring }: { icon: string; tone: { fg: string; bg: string }; title: string; value: string; sub: string; ring?: number | null | undefined }) {
  return (
    <div style={{ ...card, display: "grid", gap: 10, alignContent: "start" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 36, height: 36, borderRadius: 12, background: tone.bg, color: tone.fg, display: "grid", placeItems: "center", flex: "0 0 auto" }}>
          <Icon d={icon} />
        </span>
        <span style={label}>{title}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: 58 }}>
        <b style={{ fontSize: 34, lineHeight: 1.05, fontVariantNumeric: "tabular-nums" }}>{value}</b>
        {ring !== undefined ? <Ring pct={ring} /> : null}
      </div>
      <span style={{ fontSize: 13, color: "var(--mut)", lineHeight: 1.4 }}>{sub}</span>
    </div>
  );
}

/** Diagram batang per hari: tinggi = chat ditangani, bagian merah = terlambat. */
function Trend({ daily }: { daily: Data["daily"] }) {
  const rows = [...daily].reverse().slice(-14);
  const max = Math.max(1, ...rows.map((d) => d.perf.handled));
  return (
    <div style={{ ...card, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <b style={{ fontSize: 16 }}>Chat ditangani per hari</b>
        <span style={{ display: "inline-flex", gap: 14, fontSize: 12.5, color: "var(--mut)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: "var(--pink)", display: "inline-block" }} />Ditangani</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: LATE.fg, display: "inline-block" }} />Terlambat</span>
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 150, overflowX: "auto", paddingTop: 18 }}>
        {rows.map((d) => {
          const h = Math.max(6, (d.perf.handled / max) * 110);
          const lateH = d.perf.handled > 0 ? Math.min(h, (d.perf.late / d.perf.handled) * h) : 0;
          const p = dayParts(d.day);
          return (
            <div key={d.day} style={{ flex: "1 0 38px", maxWidth: 96, display: "grid", gap: 4, justifyItems: "center" }} title={`${fmtDay(d.day)}: ${d.perf.handled} ditangani, ${d.perf.late} terlambat`}>
              <span style={{ fontSize: 12, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{d.perf.handled}</span>
              <div style={{ width: "100%", height: h, borderRadius: 10, background: "var(--pink)", position: "relative", overflow: "hidden" }}>
                {lateH > 0 ? <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: lateH, background: LATE.fg }} /> : null}
              </div>
              <span style={{ fontSize: 11.5, color: "var(--mut)", whiteSpace: "nowrap" }}>{DAY_NAMES[p.dow]} {p.date}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PerformaView() {
  const today = useMemo(() => wibDay(Date.now()), []);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [tab, setTab] = useState<"saya" | "bot" | "sla">("saya");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (f: string, t: string) => {
    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const res = await fetch(`/api/ops/performa?from=${f}&to=${t}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Gagal (HTTP ${res.status})`);
      setData(json as Data);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat performa.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(from, to);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load(from, to);
    }, 60_000);
    return () => clearInterval(timer);
  }, [from, to, load]);

  const preset = (days: number | "month") => {
    setTo(today);
    setFrom(days === "month" ? `${today.slice(0, 7)}-01` : shiftDay(today, -(days - 1)));
  };
  const activePreset = to === today ? (from === today ? "1" : from === shiftDay(today, -6) ? "7" : from === shiftDay(today, -29) ? "30" : from === `${today.slice(0, 7)}-01` ? "month" : "") : "";

  const cfg = data?.config;
  const perf = data?.perf;
  const canManage = data?.canManage === true;
  const hoursText = cfg ? `${daysText(cfg.opDays)} ${cfg.openTime.replace(":", ".")}–${cfg.closeTime.replace(":", ".")}` : "";
  const tabs: [typeof tab, string][] = [["saya", "Performa saya"], ...(canManage ? ([["bot", "Bot vs Admin"], ["sla", "Pengaturan SLA"]] as [typeof tab, string][]) : [])];

  const slaTone = perf?.slaPct == null ? NEUTRAL : perf.slaPct >= 80 ? GOOD : perf.slaPct >= 50 ? WARN : LATE;

  return (
    <div style={{ display: "grid", gap: 16, fontFamily: "var(--font)", color: "var(--plum)" }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 4, background: "#fff", border: "1px solid var(--card-line)", borderRadius: 14, padding: 4 }}>
          {tabs.map(([key, text]) => (
            <button key={key} type="button" onClick={() => setTab(key)} style={{ border: 0, cursor: "pointer", borderRadius: 10, padding: "8px 16px", fontSize: 14, fontWeight: 700, fontFamily: "inherit", background: tab === key ? "var(--plum)" : "transparent", color: tab === key ? "#fff" : "var(--plum)" }}>
              {text}
            </button>
          ))}
        </div>
        {tab !== "sla" ? (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 3, background: "#fff", border: "1px solid var(--card-line)", borderRadius: 12, padding: 3 }}>
              {([["1", "Hari ini", 1], ["7", "7 hari", 7], ["30", "30 hari", 30], ["month", "Bulan ini", "month"]] as const).map(([key, text, value]) => (
                <button key={key} type="button" onClick={() => preset(value as number | "month")} style={{ border: 0, cursor: "pointer", borderRadius: 9, padding: "6px 12px", fontSize: 13, fontWeight: 700, fontFamily: "inherit", background: activePreset === key ? "var(--pink-bg)" : "transparent", color: activePreset === key ? "var(--pink-d)" : "var(--plum)" }}>
                  {text}
                </button>
              ))}
            </div>
            <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} aria-label="Dari tanggal" style={{ ...btn, height: 36 }} />
            <span style={{ color: "var(--mut)", fontSize: 13 }}>s/d</span>
            <input type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} aria-label="Sampai tanggal" style={{ ...btn, height: 36 }} />
          </div>
        ) : null}
      </div>

      {error ? <div style={{ background: LATE.bg, color: LATE.fg, borderRadius: 12, padding: "9px 14px", fontSize: 13.5, fontWeight: 700 }}>{error}</div> : null}
      {!data && loading ? <p style={{ color: "var(--mut)" }}>Memuat…</p> : null}

      {data && cfg && perf && tab === "saya" ? (
        <>
          {/* ringkasan satu kalimat */}
          <section
            style={{
              borderRadius: 20,
              padding: "16px 22px",
              color: "#fff",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              backgroundImage: "radial-gradient(circle at 92% 0%, rgba(255,255,255,0.22), transparent 45%), linear-gradient(120deg, var(--pink-d) 0%, var(--pink) 100%)",
              boxShadow: "0 10px 24px rgba(0,0,0,.08)",
            }}
          >
            <div style={{ display: "grid", gap: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.4, opacity: 0.85 }}>PERFORMA SAYA</span>
              <b style={{ fontSize: 20, lineHeight: 1.25 }}>
                Halo {data.me.name}, {perf.handled === 0 ? "belum ada chat yang Anda tangani pada rentang ini." : `${perf.handled} chat Anda tangani${perf.slaPct !== null ? `, ${id(perf.slaPct)}% mencapai target ${cfg.targetResponseMin} menit.` : "."}`}
              </b>
            </div>
            <span style={{ background: "rgba(255,255,255,.2)", border: "1px solid rgba(255,255,255,.32)", borderRadius: 999, padding: "6px 14px", fontSize: 13, fontWeight: 700 }}>
              Hanya Anda yang melihat data ini
            </span>
          </section>

          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
            <Kpi icon={I_CHAT} tone={{ fg: "var(--pink-d)", bg: "var(--pink-bg)" }} title="Chat ditangani" value={String(perf.handled)} sub={`${perf.finished} dibalas · ${perf.pending} menunggu`} />
            <Kpi icon={I_TIMER} tone={{ fg: "var(--purple)", bg: "var(--purple-bg)" }} title="Rata-rata respons pertama" value={fmtMin(perf.avgResponseMin)} sub={perf.viaPhone > 0 ? `${perf.viaPhone} dibalas lewat HP, tidak diukur` : "dari balasan lewat panel"} />
            <Kpi icon={I_ALERT} tone={perf.late > 0 ? LATE : GOOD} title="Chat terlambat" value={String(perf.late)} sub={`${perf.warning} warning · batas ${cfg.lateMin} menit`} />
            <Kpi icon={I_TARGET} tone={slaTone} title="SLA achievement" value={perf.slaPct === null ? "—" : `${id(perf.slaPct)}%`} sub={perf.measured ? `${perf.measured} chat terukur · target ${cfg.targetResponseMin} menit` : "belum ada chat terukur"} ring={perf.slaPct} />
          </div>

          {data.waiting.length > 0 ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <b style={{ fontSize: 17 }}>Chat yang menunggu Anda</b>
                <span style={{ background: LATE.bg, color: LATE.fg, borderRadius: 999, padding: "2px 10px", fontSize: 12.5, fontWeight: 800 }}>{data.waiting.length}</span>
              </div>
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))" }}>
                {data.waiting.map((w) => {
                  const tone = w.level === "late" ? LATE : w.level === "warning" ? WARN : w.level === "ok" ? GOOD : NEUTRAL;
                  return (
                    <div key={`${w.sender}-${w.startAt}`} style={{ ...card, padding: "14px 16px", display: "grid", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ width: 42, height: 42, borderRadius: "50%", background: "var(--pink-bg)", color: "var(--pink-d)", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 15, flex: "0 0 auto" }}>{initials(w.name, w.sender)}</span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 800, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.name || "Tanpa nama"}</div>
                          <div style={{ fontSize: 13, color: "var(--mut)", fontVariantNumeric: "tabular-nums" }}>{fmtPhone(w.sender)}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: tone.bg, color: tone.fg, borderRadius: 999, padding: "4px 12px", fontSize: 12.5, fontWeight: 800 }}>
                          <Icon d={I_CLOCK} size={14} />
                          {w.level === "luar-jam" ? "Di luar jam operasional" : `Menunggu ${fmtMin(w.waitMin)}`}
                        </span>
                        <span style={{ fontSize: 12.5, color: "var(--mut)" }}>
                          masuk {new Date(w.startAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(":", ".")}
                        </span>
                      </div>
                      <a href={`/panel-admin/inbox-wa?chat=${w.sender}`} style={{ ...btn, height: 34, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, textDecoration: "none", background: "var(--pink-bg)", color: "var(--pink-d)", borderColor: "transparent" }}>
                        Buka chat <Icon d={I_OPEN} size={15} />
                      </a>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {data.daily.length > 0 ? <Trend daily={data.daily} /> : null}

          <div style={{ ...card, display: "grid", gap: 10 }}>
            <b style={{ fontSize: 16 }}>Rincian per hari</b>
            {data.daily.length === 0 ? (
              <p style={{ margin: 0, color: "var(--mut)", fontSize: 14 }}>Belum ada chat yang Anda tangani pada rentang ini.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 14, minWidth: 700 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--mut)", fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.7 }}>
                      {["Tanggal", "Ditangani", "Selesai", "Lewat HP", "Rata-rata respons", "Terlambat", "SLA"].map((h) => (
                        <th key={h} style={{ padding: "6px 12px", fontWeight: 800, whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.daily.map((d) => {
                      const pct = d.perf.slaPct;
                      const tone = pct === null ? NEUTRAL : pct >= 80 ? GOOD : pct >= 50 ? WARN : LATE;
                      return (
                        <tr key={d.day}>
                          <td style={{ padding: "11px 12px", fontWeight: 800, borderTop: "1px solid var(--card-line)", whiteSpace: "nowrap" }}>{fmtDay(d.day)}</td>
                          <td style={{ padding: "11px 12px", borderTop: "1px solid var(--card-line)" }}>{d.perf.handled}</td>
                          <td style={{ padding: "11px 12px", borderTop: "1px solid var(--card-line)" }}>{d.perf.finished}</td>
                          <td style={{ padding: "11px 12px", borderTop: "1px solid var(--card-line)" }}>{d.perf.viaPhone}</td>
                          <td style={{ padding: "11px 12px", borderTop: "1px solid var(--card-line)", whiteSpace: "nowrap" }}>{fmtMin(d.perf.avgResponseMin)}</td>
                          <td style={{ padding: "11px 12px", borderTop: "1px solid var(--card-line)" }}>
                            <span style={{ background: d.perf.late > 0 ? LATE.bg : GOOD.bg, color: d.perf.late > 0 ? LATE.fg : GOOD.fg, borderRadius: 999, padding: "2px 11px", fontWeight: 800, fontSize: 13 }}>{d.perf.late}</span>
                          </td>
                          <td style={{ padding: "11px 12px", borderTop: "1px solid var(--card-line)", minWidth: 150 }}>
                            {pct === null ? (
                              "—"
                            ) : (
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ flex: 1, height: 8, borderRadius: 999, background: "var(--card-line)", overflow: "hidden" }}>
                                  <div style={{ width: `${pct}%`, height: "100%", background: tone.fg, borderRadius: 999 }} />
                                </div>
                                <b style={{ fontSize: 13, minWidth: 44, textAlign: "right" }}>{id(pct)}%</b>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <details style={{ ...card, padding: "14px 18px" }}>
            <summary style={{ cursor: "pointer", fontWeight: 800, fontSize: 14.5 }}>Cara angka ini dihitung</summary>
            <p style={{ margin: "10px 0 0", fontSize: 13.5, color: "var(--mut)", lineHeight: 1.6 }}>
              SLA hanya dihitung untuk chat yang masuk pada jam operasional ({hoursText}), dan waktu tunggunya dihitung dalam menit kerja. Chat di luar jam itu tetap tercatat tetapi tidak masuk pencapaian. Balasan dari HP (lewat tombol &quot;Sudah dibalas di HP&quot;) dihitung sebagai selesai, tetapi jamnya tidak diketahui sehingga tidak masuk rata-rata dan SLA. Balas lewat panel supaya waktunya terukur. Beberapa pesan beruntun dari pelanggan dihitung satu kali.
            </p>
          </details>
        </>
      ) : null}

      {data && cfg && tab === "bot" && data.comparison ? <BotVsAdmin data={data} cfg={cfg} from={from} to={to} /> : null}
      {data && cfg && tab === "sla" && canManage ? <SlaSettings cfg={cfg} onSaved={() => void load(from, to)} /> : null}
    </div>
  );
}

/* ───────────── Bot vs Admin (Owner/Leader) ───────────── */

function BotVsAdmin({ data, cfg, from, to }: { data: Data; cfg: Config; from: string; to: string }) {
  const c = data.comparison!;
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  /** PDF untuk Ardo: dibuat server dari data yang sama dengan halaman ini, mengikuti rentang tanggal terpilih. */
  async function exportPdf() {
    setExporting(true);
    setExportError("");
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const res = await fetch(`/api/ops/performa/report?from=${from}&to=${to}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error || `Gagal membuat PDF (${res.status})`);
      }
      const blob = await res.blob();
      const match = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = match?.[1] || "Perbandingan-Respons-Bot-vs-Admin-SAMAQU.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export PDF gagal.");
    } finally {
      setExporting(false);
    }
  }

  const row = (k: string, v: string) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "10px 0", borderTop: "1px solid var(--card-line)", fontSize: 14 }}>
      <span style={{ color: "var(--mut)" }}>{k}</span>
      <b style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{v}</b>
    </div>
  );
  const head = (icon: string, tone: { fg: string; bg: string }, title: string, big: string) => (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 36, height: 36, borderRadius: 12, background: tone.bg, color: tone.fg, display: "grid", placeItems: "center" }}>
          <Icon d={icon} />
        </span>
        <span style={label}>{title}</span>
      </div>
      <div style={{ fontSize: 34, fontWeight: 800, margin: "10px 0 2px", lineHeight: 1.1 }}>{big}</div>
      <span style={{ fontSize: 13, color: "var(--mut)" }}>kecepatan tengah (median) balasan pertama</span>
    </>
  );

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13.5, color: "var(--mut)" }}>Ringkasan gabungan untuk dibawa ke Ardo. Mengikuti rentang tanggal di atas.</span>
        <button type="button" onClick={() => void exportPdf()} disabled={exporting} style={{ ...btn, background: "var(--plum)", color: "#fff", borderColor: "var(--plum)", opacity: exporting ? 0.7 : 1, display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Icon d={I_PDF} size={16} />
          {exporting ? "Membuat PDF…" : "Export PDF"}
        </button>
      </div>
      {exportError ? <div style={{ background: LATE.bg, color: LATE.fg, borderRadius: 12, padding: "9px 14px", fontSize: 13.5, fontWeight: 700 }}>{exportError}</div> : null}
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <div style={card}>
          {head(I_CHAT, { fg: "var(--purple)", bg: "var(--purple-bg)" }, "Bot WhatsApp", fmtMin(c.bot.medianMin))}
          <div style={{ marginTop: 10 }}>
            {row("Chat dibalas bot", String(c.bot.count))}
            {row("9 dari 10 chat dibalas dalam", fmtMin(c.bot.p90Min))}
            {row("Waktu hitung", "menit biasa (termasuk malam dan Minggu)")}
          </div>
        </div>
        <div style={card}>
          {head(I_TIMER, { fg: "var(--pink-d)", bg: "var(--pink-bg)" }, "Admin (gabungan tim)", fmtMin(c.team.medianMin))}
          <div style={{ marginTop: 10 }}>
            {row("Chat dibalas lewat panel (terukur)", String(c.team.count))}
            {row("9 dari 10 chat dibalas dalam", fmtMin(c.team.p90Min))}
            {row("SLA tercapai", c.team.slaPct === null ? "—" : `${id(c.team.slaPct)}%`)}
            {row("Dibalas lewat HP (tidak terukur)", String(c.team.viaPhone))}
            {row("Waktu hitung", "menit kerja (jam operasional)")}
          </div>
        </div>
      </div>
      <div style={{ ...card, fontSize: 13, color: "var(--mut)", lineHeight: 1.55 }}>
        Bot dan admin bekerja di jam berbeda: bot membalas malam dan Minggu, admin membalas {daysText(cfg.opDays)} {cfg.openTime.replace(":", ".")}–{cfg.closeTime.replace(":", ".")}. Jadi angkanya untuk dibandingkan secara umum, bukan lomba di chat yang sama. Beberapa pesan beruntun dari pelanggan dihitung satu kali. Ringkasan ini gabungan tanpa nama per orang. Chat yang masih menunggu saat ini: {c.unanswered}.
      </div>
    </>
  );
}

/* ───────────── Pengaturan SLA (Owner/Leader) ───────────── */

function SlaSettings({ cfg, onSaved }: { cfg: Config; onSaved: () => void }) {
  const [f, setF] = useState<Config>(cfg);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setF(cfg), [cfg]);

  const num = (key: "targetResponseMin" | "warningMin" | "lateMin" | "queueAlertThreshold", text: string, hint: string, width?: number) => (
    <label style={{ display: "grid", gap: 4, width, alignContent: "start" }}>
      <span style={label}>{text}</span>
      <input type="number" min={1} value={f[key]} onChange={(e) => setF({ ...f, [key]: Number(e.target.value) })} style={{ ...btn, height: 42, width: "100%", boxSizing: "border-box", fontWeight: 600 }} />
      <span style={{ fontSize: 12, color: "var(--mut)" }}>{hint}</span>
    </label>
  );
  const toggle = (key: "countOutsideHours", title: string, hint: string) => (
    <label style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, cursor: "pointer", position: "relative", boxShadow: "none" }}>
      <span style={{ display: "grid", gap: 2 }}>
        <b style={{ fontSize: 14.5 }}>{title}</b>
        <span style={{ fontSize: 12.5, color: "var(--mut)" }}>{hint}</span>
      </span>
      <span aria-hidden="true" style={{ flex: "0 0 auto", width: 46, height: 26, borderRadius: 999, background: f[key] ? "var(--green)" : "var(--card-line)", position: "relative", transition: "background .15s" }}>
        <span style={{ position: "absolute", top: 3, left: f[key] ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.25)", transition: "left .15s" }} />
      </span>
      <input type="checkbox" role="switch" checked={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.checked })} style={{ position: "absolute", opacity: 0, width: 1, height: 1 }} />
    </label>
  );

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const res = await fetch("/api/ops/performa", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(f),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Gagal (HTTP ${res.status})`);
      setMsg({ ok: true, text: "Pengaturan SLA tersimpan dan langsung dipakai untuk perhitungan berikutnya." });
      onSaved();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Gagal menyimpan." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ ...card, display: "grid", gap: 18, maxWidth: 780 }}>
      <div>
        <b style={{ fontSize: 18 }}>Target layanan</b>
        <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--mut)" }}>Ambang batas ini dipakai untuk semua perhitungan dan warna waktu tunggu. Hanya Owner dan Leader yang dapat mengubahnya.</p>
      </div>
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        {num("targetResponseMin", "Target respons (menit)", "Balasan lebih cepat dari ini = tercapai")}
        {num("warningMin", "Warning (menit)", "Lewat batas ini = warning (kuning)")}
        {num("lateMin", "Terlambat (menit)", "Batas akhir sebelum dianggap terlambat (merah)")}
      </div>
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <label style={{ display: "grid", gap: 4, alignContent: "start" }}>
          <span style={label}>Jam operasional buka</span>
          <input type="time" value={f.openTime} onChange={(e) => setF({ ...f, openTime: e.target.value })} style={{ ...btn, height: 42, fontWeight: 600 }} />
        </label>
        <label style={{ display: "grid", gap: 4, alignContent: "start" }}>
          <span style={label}>Jam operasional tutup</span>
          <input type="time" value={f.closeTime} onChange={(e) => setF({ ...f, closeTime: e.target.value })} style={{ ...btn, height: 42, fontWeight: 600 }} />
        </label>
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        <span style={label}>Hari operasional</span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {DAY_NAMES.map((name, d) => {
            const on = f.opDays.includes(d);
            return (
              <button key={d} type="button" onClick={() => setF({ ...f, opDays: on ? f.opDays.filter((x) => x !== d) : [...f.opDays, d].sort((a, b) => a - b) })} style={{ ...btn, borderRadius: 999, background: on ? "var(--green-bg)" : "#fff", color: on ? "var(--green)" : "var(--mut)", borderColor: on ? "var(--green)" : "var(--card-line)" }}>
                {name}
              </button>
            );
          })}
        </div>
        <span style={{ fontSize: 12, color: "var(--mut)" }}>Chat di luar hari dan jam ini tidak dihitung dalam SLA.</span>
      </div>
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        {num("queueAlertThreshold", "Ambang alert antrean", "Jumlah chat menunggu sebelum alert muncul")}
        <label style={{ display: "grid", gap: 4, alignContent: "start" }}>
          <span style={label}>Nama konfigurasi</span>
          <input value={f.name} maxLength={60} onChange={(e) => setF({ ...f, name: e.target.value })} style={{ ...btn, height: 42, fontWeight: 600 }} />
        </label>
      </div>
      {toggle("countOutsideHours", "Hitung chat di luar jam operasional", "Matikan agar chat malam (yang dijawab bot) tidak menurunkan pencapaian SLA")}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" onClick={() => void save()} disabled={saving} style={{ ...btn, height: 44, padding: "0 24px", background: "var(--plum)", color: "#fff", borderColor: "var(--plum)", opacity: saving ? 0.7 : 1 }}>
          {saving ? "Menyimpan…" : "Simpan"}
        </button>
        {msg ? <span style={{ fontSize: 13.5, fontWeight: 700, color: msg.ok ? "var(--green)" : LATE.fg }}>{msg.text}</span> : <span style={{ fontSize: 12.5, color: "var(--mut)" }}>Perubahan langsung dipakai untuk perhitungan berikutnya.</span>}
      </div>
    </div>
  );
}
