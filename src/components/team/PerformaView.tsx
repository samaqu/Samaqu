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
interface Data {
  range: { from: string; to: string };
  config: Config;
  canManage: boolean;
  me: { name: string; email: string };
  perf: Perf;
  daily: { day: string; perf: Perf }[];
  waiting: { chat: string; startAt: string; waitMin: number; inHours: boolean; level: "ok" | "warning" | "late" | "luar-jam" }[];
  comparison: { bot: Stats; team: Stats & { viaPhone: number; slaPct: number | null }; episodes: number; unanswered: number } | null;
}

const LATE = { fg: "#b91c1c", bg: "#fee2e2" };
const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const DAY_LONG = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

const id = (v: number, d = 1) => v.toFixed(d).replace(".", ",");
/** Menit → kalimat singkat yang mudah dibaca: "40 detik", "3,2 menit", "1 jam 05 menit". */
function fmtMin(v: number | null): string {
  if (v === null) return "—";
  if (v < 1) return `${Math.round(v * 60)} detik`;
  if (v < 60) return `${id(v)} menit`;
  const h = Math.floor(v / 60);
  return `${h} jam ${String(Math.round(v - h * 60)).padStart(2, "0")} menit`;
}
const fmtDay = (day: string) => {
  const d = new Date(`${day}T00:00:00Z`);
  return `${DAY_LONG[d.getUTCDay()]}, ${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"][d.getUTCMonth()]}`;
};
const daysText = (days: number[]) => (days.length === 7 ? "setiap hari" : days.map((d) => DAY_NAMES[d]).join(", "));

const shiftDay = (day: string, delta: number) => new Date(Date.parse(`${day}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10);

const card: React.CSSProperties = { background: "#fff", border: "1px solid var(--card-line)", borderRadius: 18, padding: "16px 18px", boxShadow: "0 4px 14px rgba(0,0,0,.04)" };
const label: React.CSSProperties = { fontSize: 11.5, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", color: "var(--mut)" };
const btn: React.CSSProperties = { border: "1px solid var(--card-line)", background: "#fff", color: "var(--plum)", borderRadius: 10, height: 34, padding: "0 12px", fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };

function Stat({ title, value, sub, tone }: { title: string; value: string; sub: string; tone?: "late" }) {
  return (
    <div style={{ ...card, display: "grid", gap: 6, alignContent: "start" }}>
      <span style={label}>{title}</span>
      <b style={{ fontSize: 30, lineHeight: 1.1, color: tone === "late" ? LATE.fg : "var(--plum)", fontVariantNumeric: "tabular-nums" }}>{value}</b>
      <span style={{ fontSize: 13, color: "var(--mut)" }}>{sub}</span>
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

  return (
    <div style={{ display: "grid", gap: 14, fontFamily: "var(--font)", color: "var(--plum)" }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 4, background: "#fff", border: "1px solid var(--card-line)", borderRadius: 12, padding: 3 }}>
          {tabs.map(([key, text]) => (
            <button key={key} type="button" onClick={() => setTab(key)} style={{ border: 0, cursor: "pointer", borderRadius: 9, padding: "7px 14px", fontSize: 13.5, fontWeight: 700, fontFamily: "inherit", background: tab === key ? "var(--plum)" : "transparent", color: tab === key ? "#fff" : "var(--plum)" }}>
              {text}
            </button>
          ))}
        </div>
        {tab !== "sla" ? (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {([["1", "Hari ini", 1], ["7", "7 hari", 7], ["30", "30 hari", 30], ["month", "Bulan ini", "month"]] as const).map(([key, text, value]) => (
              <button key={key} type="button" onClick={() => preset(value as number | "month")} style={{ ...btn, background: activePreset === key ? "var(--pink-bg)" : "#fff", color: activePreset === key ? "var(--pink-d)" : "var(--plum)" }}>
                {text}
              </button>
            ))}
            <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} aria-label="Dari tanggal" style={{ ...btn, height: 34 }} />
            <span style={{ color: "var(--mut)", fontSize: 13 }}>s/d</span>
            <input type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} aria-label="Sampai tanggal" style={{ ...btn, height: 34 }} />
          </div>
        ) : null}
      </div>

      {error ? <div style={{ background: LATE.bg, color: LATE.fg, borderRadius: 12, padding: "9px 14px", fontSize: 13.5, fontWeight: 700 }}>{error}</div> : null}
      {!data && loading ? <p style={{ color: "var(--mut)" }}>Memuat…</p> : null}

      {data && cfg && perf && tab === "saya" ? (
        <>
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--mut)" }}>
            Data ini hanya milik <b style={{ color: "var(--plum)" }}>{data.me.name}</b>. Admin lain tidak bisa melihatnya.
          </p>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
            <Stat title="Chat ditangani" value={String(perf.handled)} sub={`${perf.finished} dibalas · ${perf.pending} menunggu`} />
            <Stat title="Rata-rata respons pertama" value={fmtMin(perf.avgResponseMin)} sub={perf.viaPhone > 0 ? `${perf.viaPhone} dibalas lewat HP, tidak diukur` : "dari balasan lewat panel"} />
            <Stat title="Chat terlambat" value={String(perf.late)} sub={`${perf.warning} warning`} tone={perf.late > 0 ? "late" : undefined} />
            <Stat title="SLA achievement" value={perf.slaPct === null ? "—" : `${id(perf.slaPct)}%`} sub={perf.measured ? `${perf.measured} chat terukur · target ${cfg.targetResponseMin} menit` : "belum ada chat terukur"} />
          </div>
          <div style={{ ...card, display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, color: "var(--mut)", lineHeight: 1.5 }}>
            <span aria-hidden="true">⏳</span>
            <span>
              SLA hanya dihitung untuk chat yang masuk pada jam operasional ({hoursText}), dan waktu tunggunya dihitung dalam menit kerja. Chat di luar jam itu tetap tercatat tetapi tidak masuk pencapaian. Balasan yang dikirim dari HP (lewat tombol &quot;Sudah dibalas di HP&quot;) dihitung sebagai selesai, tetapi jamnya tidak diketahui sehingga tidak masuk rata-rata dan SLA. Balas lewat panel supaya waktunya terukur.
            </span>
          </div>

          {data.waiting.length > 0 ? (
            <div style={{ ...card, display: "grid", gap: 8 }}>
              <b style={{ fontSize: 15 }}>Chat yang menunggu Anda ({data.waiting.length})</b>
              {data.waiting.map((w) => {
                const tone = w.level === "late" ? LATE : w.level === "warning" ? { fg: "var(--orange)", bg: "var(--orange-bg)" } : w.level === "ok" ? { fg: "var(--green)", bg: "var(--green-bg)" } : { fg: "var(--mut)", bg: "var(--pink-bg)" };
                return (
                  <div key={`${w.chat}-${w.startAt}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 12, background: "var(--pink-bg)" }}>
                    <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{w.chat}</span>
                    <span style={{ fontSize: 12.5, color: "var(--mut)" }}>
                      masuk {new Date(w.startAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span style={{ background: tone.bg, color: tone.fg, borderRadius: 999, padding: "3px 11px", fontSize: 12.5, fontWeight: 800 }}>
                      {w.level === "luar-jam" ? "di luar jam operasional" : `menunggu ${fmtMin(w.waitMin)}`}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}

          <div style={{ ...card, display: "grid", gap: 10 }}>
            <b style={{ fontSize: 15 }}>Rincian per hari</b>
            {data.daily.length === 0 ? (
              <p style={{ margin: 0, color: "var(--mut)", fontSize: 14 }}>Belum ada chat yang Anda tangani pada rentang ini.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 620 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--mut)", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 }}>
                      {["Tanggal", "Ditangani", "Selesai", "Lewat HP", "Rata-rata respons", "Terlambat", "SLA"].map((h) => (
                        <th key={h} style={{ padding: "6px 10px", fontWeight: 800 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.daily.map((d) => (
                      <tr key={d.day} style={{ borderTop: "1px solid var(--card-line)" }}>
                        <td style={{ padding: "9px 10px", fontWeight: 700 }}>{fmtDay(d.day)}</td>
                        <td style={{ padding: "9px 10px" }}>{d.perf.handled}</td>
                        <td style={{ padding: "9px 10px" }}>{d.perf.finished}</td>
                        <td style={{ padding: "9px 10px" }}>{d.perf.viaPhone}</td>
                        <td style={{ padding: "9px 10px" }}>{fmtMin(d.perf.avgResponseMin)}</td>
                        <td style={{ padding: "9px 10px", color: d.perf.late > 0 ? LATE.fg : undefined, fontWeight: d.perf.late > 0 ? 800 : 500 }}>{d.perf.late}</td>
                        <td style={{ padding: "9px 10px" }}>{d.perf.slaPct === null ? "—" : `${id(d.perf.slaPct)}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
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
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "9px 0", borderTop: "1px solid var(--card-line)", fontSize: 14 }}>
      <span style={{ color: "var(--mut)" }}>{k}</span>
      <b style={{ fontVariantNumeric: "tabular-nums" }}>{v}</b>
    </div>
  );
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13.5, color: "var(--mut)" }}>Ringkasan gabungan untuk dibawa ke Ardo. Mengikuti rentang tanggal di atas.</span>
        <button type="button" onClick={() => void exportPdf()} disabled={exporting} style={{ ...btn, background: "var(--plum)", color: "#fff", borderColor: "var(--plum)", opacity: exporting ? 0.7 : 1 }}>
          {exporting ? "Membuat PDF…" : "Export PDF"}
        </button>
      </div>
      {exportError ? <div style={{ background: LATE.bg, color: LATE.fg, borderRadius: 12, padding: "9px 14px", fontSize: 13.5, fontWeight: 700 }}>{exportError}</div> : null}
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <div style={card}>
          <span style={label}>Bot WhatsApp</span>
          <div style={{ fontSize: 30, fontWeight: 800, margin: "6px 0 8px" }}>{fmtMin(c.bot.medianMin)}</div>
          <span style={{ fontSize: 13, color: "var(--mut)" }}>kecepatan tengah (median) balasan pertama</span>
          <div style={{ marginTop: 8 }}>
            {row("Chat dibalas bot", String(c.bot.count))}
            {row("9 dari 10 chat dibalas dalam", fmtMin(c.bot.p90Min))}
            {row("Waktu hitung", "menit biasa (termasuk malam dan Minggu)")}
          </div>
        </div>
        <div style={card}>
          <span style={label}>Admin (gabungan tim)</span>
          <div style={{ fontSize: 30, fontWeight: 800, margin: "6px 0 8px" }}>{fmtMin(c.team.medianMin)}</div>
          <span style={{ fontSize: 13, color: "var(--mut)" }}>kecepatan tengah (median) balasan lewat panel</span>
          <div style={{ marginTop: 8 }}>
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
      <input type="number" min={1} value={f[key]} onChange={(e) => setF({ ...f, [key]: Number(e.target.value) })} style={{ ...btn, height: 40, width: "100%", boxSizing: "border-box", fontWeight: 600 }} />
      <span style={{ fontSize: 12, color: "var(--mut)" }}>{hint}</span>
    </label>
  );
  const toggle = (key: "countOutsideHours", title: string, hint: string) => (
    <label style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, cursor: "pointer", position: "relative" }}>
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
    <div style={{ ...card, display: "grid", gap: 16, maxWidth: 760 }}>
      <div>
        <b style={{ fontSize: 17 }}>Target layanan</b>
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
          <input type="time" value={f.openTime} onChange={(e) => setF({ ...f, openTime: e.target.value })} style={{ ...btn, height: 40, fontWeight: 600 }} />
        </label>
        <label style={{ display: "grid", gap: 4, alignContent: "start" }}>
          <span style={label}>Jam operasional tutup</span>
          <input type="time" value={f.closeTime} onChange={(e) => setF({ ...f, closeTime: e.target.value })} style={{ ...btn, height: 40, fontWeight: 600 }} />
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
          <input value={f.name} maxLength={60} onChange={(e) => setF({ ...f, name: e.target.value })} style={{ ...btn, height: 40, fontWeight: 600 }} />
        </label>
      </div>
      {toggle("countOutsideHours", "Hitung chat di luar jam operasional", "Matikan agar chat malam (yang dijawab bot) tidak menurunkan pencapaian SLA")}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" onClick={() => void save()} disabled={saving} style={{ ...btn, height: 42, padding: "0 22px", background: "var(--plum)", color: "#fff", borderColor: "var(--plum)", opacity: saving ? 0.7 : 1 }}>
          {saving ? "Menyimpan…" : "Simpan"}
        </button>
        {msg ? <span style={{ fontSize: 13.5, fontWeight: 700, color: msg.ok ? "var(--green)" : LATE.fg }}>{msg.text}</span> : <span style={{ fontSize: 12.5, color: "var(--mut)" }}>Perubahan langsung dipakai untuk perhitungan berikutnya.</span>}
      </div>
    </div>
  );
}
