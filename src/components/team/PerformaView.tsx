"use client";

/**
 * Halaman "Performa Admin": kecepatan respons chat WhatsApp + SLA.
 * Desain MENGIKUTI AI Performance Center (kicker kecil + judul, hero gelap bergradien, kartu KPI dengan chip ikon,
 * daftar divide-y dengan avatar, catatan kaki kecil) supaya dua halaman performa terasa satu keluarga.
 *  - Tab "Performa saya": SETIAP peran hanya melihat data dirinya sendiri (dijaga di server, /api/ops/performa).
 *  - Tab "Bot vs Admin" dan "Pengaturan SLA": hanya Owner dan Leader (ringkasan gabungan tanpa nama per orang).
 * Rumus ada di lib/sla.ts.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock, ExternalLink, FileDown, Gauge, Loader2, MessageSquare, RefreshCw, Target, Timer } from "lucide-react";
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

/** Palet yang sama dengan AI Performance Center. Status: hijau = baik, kuning = warning, merah = terlambat, abu = netral. */
const C = {
  ink: "#2a1a22",
  label: "#7c93a6",
  sub: "#8a7d83",
  muted: "#9aacb8",
  border: "#e3ebf1",
  input: "#d5e3ee",
  divide: "#edf1f4",
  blue: "#2f6f9e",
  navy: "#1f3a4d",
  green: "#1f8a58",
  amber: "#8a5a12",
  purple: "#7a4a8a",
  red: "#b24a4a",
};
const PILL = {
  ok: { bg: "#e7f5eb", fg: "#1f8a58" },
  warn: { bg: "#fdf3dc", fg: "#8a5a12" },
  late: { bg: "#fce8e8", fg: "#9b2c2c" },
  neutral: { bg: "#f2f4f6", fg: "#7c8a93" },
  info: { bg: "#e8f3fb", fg: "#2f6f9e" },
};

const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const DAY_LONG = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const id = (v: number, d = 1) => v.toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });
/** Menit → kalimat singkat: "40 detik", "3,2 menit", "1 jam 05 menit". */
function fmtMin(v: number | null): string {
  if (v === null) return "—";
  if (v < 1) return `${Math.round(v * 60)} detik`;
  if (v < 60) return `${id(v)} menit`;
  const h = Math.floor(v / 60);
  return `${h} jam ${String(Math.round(v - h * 60)).padStart(2, "0")} menit`;
}
const dayParts = (day: string) => {
  const d = new Date(`${day}T00:00:00Z`);
  return { dow: d.getUTCDay(), date: d.getUTCDate(), month: MONTHS[d.getUTCMonth()], year: d.getUTCFullYear() };
};
const fmtDay = (day: string) => {
  const p = dayParts(day);
  return `${DAY_LONG[p.dow]}, ${p.date} ${p.month}`;
};
const periodLabel = (from: string, to: string) => {
  const a = dayParts(from);
  const b = dayParts(to);
  return from === to ? `${a.date} ${a.month} ${a.year}` : `${a.date} ${a.month} ${a.year} – ${b.date} ${b.month} ${b.year}`;
};
const daysText = (days: number[]) => (days.length === 7 ? "setiap hari" : days.map((d) => DAY_NAMES[d]).join(", "));
const shiftDay = (day: string, delta: number) => new Date(Date.parse(`${day}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10);
const shortTime = (value: string) =>
  new Date(value).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jakarta" });

/** 6281234567890 → 0812-3456-7890 */
function fmtPhone(s: string): string {
  const digits = String(s).replace(/\D/g, "");
  const local = digits.startsWith("62") ? `0${digits.slice(2)}` : digits;
  return local.length > 8 ? `${local.slice(0, 4)}-${local.slice(4, 8)}-${local.slice(8)}` : local;
}

const inputCls = "h-10 rounded-xl border bg-white px-3 text-xs font-bold outline-none focus-visible:ring-2 focus-visible:ring-[#4a90c2]/40";
const buttonCls = "inline-flex h-10 items-center gap-2 rounded-xl border bg-white px-3 text-xs font-bold disabled:opacity-50";

function Pill({ tone, children }: { tone: keyof typeof PILL; children: React.ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: PILL[tone].bg, color: PILL[tone].fg }}>
      {children}
    </span>
  );
}

/** Kartu KPI: sama dengan AI Performance Center (label kecil + chip ikon, angka besar, keterangan). */
function KpiCard({ label, value, secondary, hint, tone = C.blue, icon }: { label: string; value: string; secondary?: string; hint: React.ReactNode; tone?: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm" style={{ borderColor: C.border }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: C.label }}>{label}</p>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${tone}14`, color: tone }}>{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-black tabular-nums" style={{ color: C.ink }}>{value}</p>
      {secondary ? <p className="mt-0.5 text-sm font-black tabular-nums" style={{ color: tone }}>{secondary}</p> : null}
      <p className="mt-1 text-[11px] font-semibold" style={{ color: C.sub }}>{hint}</p>
    </div>
  );
}

function Panel({ title, sub, right, children }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5" style={{ borderColor: C.border }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-black" style={{ color: C.ink }}>{title}</h3>
          {sub ? <p className="mt-0.5 text-xs" style={{ color: C.sub }}>{sub}</p> : null}
        </div>
        {right}
      </div>
      {children}
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
  const heroTitle = tab === "saya" ? `Halo ${data?.me.name || ""}`.trim() : tab === "bot" ? "Bot vs Admin" : "Pengaturan SLA";

  return (
    <section className="flex min-h-0 flex-col gap-4" style={{ fontFamily: "var(--font)" }}>
      {/* judul + kontrol (sama seperti AI Performance Center) */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: C.label }}>SAMAQU Team Performance</p>
          <h1 className="mt-1 text-2xl font-black" style={{ color: C.ink }}>Performa Admin</h1>
          <p className="mt-1 text-sm" style={{ color: "#6B6A64" }}>Kecepatan membalas chat WhatsApp dan pencapaian SLA.</p>
        </div>
        {tab !== "sla" ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border bg-white p-1" style={{ borderColor: C.input }}>
              {([["1", "Hari ini", 1], ["7", "7 hari", 7], ["30", "30 hari", 30], ["month", "Bulan ini", "month"]] as const).map(([key, text, value]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => preset(value as number | "month")}
                  className="h-8 rounded-lg px-3 text-xs font-bold"
                  style={{ background: activePreset === key ? C.navy : "transparent", color: activePreset === key ? "#fff" : C.blue }}
                >
                  {text}
                </button>
              ))}
            </div>
            <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} aria-label="Dari tanggal" className={inputCls} style={{ borderColor: C.input, color: C.ink }} />
            <span className="text-xs" style={{ color: C.sub }}>s/d</span>
            <input type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} aria-label="Sampai tanggal" className={inputCls} style={{ borderColor: C.input, color: C.ink }} />
            <button type="button" onClick={() => void load(from, to)} disabled={loading} className={buttonCls} style={{ borderColor: C.input, color: C.blue }}>
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Muat ulang
            </button>
          </div>
        ) : null}
      </div>

      {/* hero gelap bergradien */}
      <div className="overflow-hidden rounded-3xl p-5 shadow-sm sm:p-6" style={{ background: "linear-gradient(120deg,#1f3a4d 0%,#2d5368 60%,#3b687d 100%)", color: "#fff" }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "rgba(255,255,255,.12)" }}><Gauge size={20} /></span>
            <div>
              <p className="text-sm font-black">Performa Admin</p>
              <p className="text-xs" style={{ color: "rgba(255,255,255,.6)" }}>SAMAQU Team Performance</p>
            </div>
          </div>
          <span className="rounded-full px-3 py-1 text-[11px] font-bold" style={{ background: "rgba(83,224,145,.14)", color: "#82e6a8" }}>
            {tab === "saya" ? "Hanya Anda yang melihat" : "Owner & Leader"}
          </span>
        </div>
        <h2 className="mt-5 text-2xl font-black sm:text-3xl">{heroTitle}</h2>
        <p className="mt-1 text-xs" style={{ color: "rgba(255,255,255,.6)" }}>
          {tab === "sla" ? "Ambang batas respons yang dipakai untuk semua perhitungan." : `Periode: ${periodLabel(from, to)}`}
          {tab === "saya" && perf ? ` · ${perf.handled} chat ditangani${perf.slaPct !== null && cfg ? `, ${id(perf.slaPct)}% mencapai target ${cfg.targetResponseMin} menit` : ""}` : ""}
        </p>
        <div className="mt-4 inline-flex rounded-xl p-1" style={{ background: "rgba(255,255,255,.1)" }}>
          {tabs.map(([key, text]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className="h-8 rounded-lg px-3 text-xs font-bold"
              style={{ background: tab === key ? "#fff" : "transparent", color: tab === key ? C.navy : "rgba(255,255,255,.75)" }}
            >
              {text}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border px-4 py-3 text-sm" style={{ background: "#FCE8E8", borderColor: "#F3CFCB", color: "#9B2C2C" }}>{error}</div>
      ) : null}

      {!data && loading ? (
        <div className="flex min-h-[260px] items-center justify-center gap-2 rounded-2xl border bg-white text-sm" style={{ borderColor: C.border, color: "#6B6A64" }}>
          <Loader2 className="animate-spin" size={18} /> Memuat performa…
        </div>
      ) : null}

      {data && cfg && perf && tab === "saya" ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
            <KpiCard label="Chat ditangani" value={String(perf.handled)} hint={<>{perf.finished} dibalas · {perf.pending} menunggu</>} icon={<MessageSquare size={16} />} />
            <KpiCard
              label="Rata-rata respons pertama"
              value={fmtMin(perf.avgResponseMin)}
              hint={perf.viaPhone > 0 ? `${perf.viaPhone} dibalas lewat HP, tidak diukur` : "dari balasan lewat panel"}
              tone={C.purple}
              icon={<Timer size={16} />}
            />
            <KpiCard
              label="Chat terlambat"
              value={String(perf.late)}
              hint={`${perf.warning} warning · batas ${cfg.lateMin} menit`}
              tone={perf.late > 0 ? C.red : C.green}
              icon={<AlertTriangle size={16} />}
            />
            <KpiCard
              label="SLA achievement"
              value={perf.slaPct === null ? "—" : `${id(perf.slaPct)}%`}
              hint={perf.measured ? `${perf.measured} chat terukur · target ${cfg.targetResponseMin} menit` : "belum ada chat terukur"}
              tone={perf.slaPct === null ? C.blue : perf.slaPct >= 80 ? C.green : perf.slaPct >= 50 ? C.amber : C.red}
              icon={<Target size={16} />}
            />
          </div>

          {data.waiting.length > 0 ? (
            <Panel title="Chat yang menunggu Anda" sub="Diurutkan dari yang paling lama menunggu." right={<Pill tone="info">{data.waiting.length} chat</Pill>}>
              <div className="mt-3">
                {data.waiting.map((w, index) => {
                  const tone: keyof typeof PILL = w.level === "late" ? "late" : w.level === "warning" ? "warn" : w.level === "ok" ? "ok" : "neutral";
                  const text = w.level === "luar-jam" ? "Di luar jam operasional" : `Menunggu ${fmtMin(w.waitMin)}`;
                  return (
                    <div key={`${w.sender}-${w.startAt}`} className="flex items-center gap-3 py-3" style={index > 0 ? { borderTop: `1px solid ${C.divide}` } : undefined}>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-black" style={{ background: "#fdf0f4", color: "#8a4c62" }}>
                        {(w.name || fmtPhone(w.sender) || "C").slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <p className="truncate text-xs font-bold" style={{ color: C.ink }}>{w.name || "Tanpa nama"}</p>
                          <span className="text-[10px]" style={{ color: C.muted }}>masuk {shortTime(w.startAt)}</span>
                        </div>
                        <p className="mt-0.5 text-[11px] tabular-nums" style={{ color: "#6B6A64" }}>{fmtPhone(w.sender)}</p>
                      </div>
                      <Pill tone={tone}><Clock size={11} /> {text}</Pill>
                      <a href={`/panel-admin/inbox-wa?chat=${w.sender}`} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border bg-white px-2.5 text-[11px] font-bold" style={{ borderColor: C.input, color: C.blue }}>
                        Buka chat <ExternalLink size={12} />
                      </a>
                    </div>
                  );
                })}
              </div>
            </Panel>
          ) : null}

          {data.daily.length > 0 ? <Trend daily={data.daily} /> : null}

          <Panel title="Rincian per hari" sub="Chat yang Anda tangani, dihitung per hari WIB.">
            {data.daily.length === 0 ? (
              <p className="py-4 text-sm" style={{ color: C.sub }}>Belum ada chat yang Anda tangani pada rentang ini.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm" style={{ minWidth: 680, borderCollapse: "collapse" }}>
                  <thead>
                    <tr className="text-left text-[11px] font-bold uppercase tracking-wider" style={{ color: C.label }}>
                      {["Tanggal", "Ditangani", "Selesai", "Lewat HP", "Rata-rata respons", "Terlambat", "SLA"].map((h) => (
                        <th key={h} className="whitespace-nowrap px-3 py-2">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.daily.map((d) => {
                      const pct = d.perf.slaPct;
                      const color = pct === null ? C.muted : pct >= 80 ? C.green : pct >= 50 ? C.amber : C.red;
                      return (
                        <tr key={d.day} style={{ borderTop: `1px solid ${C.divide}`, color: C.ink }}>
                          <td className="whitespace-nowrap px-3 py-3 text-xs font-bold">{fmtDay(d.day)}</td>
                          <td className="px-3 py-3 text-xs tabular-nums">{d.perf.handled}</td>
                          <td className="px-3 py-3 text-xs tabular-nums">{d.perf.finished}</td>
                          <td className="px-3 py-3 text-xs tabular-nums">{d.perf.viaPhone}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-xs tabular-nums">{fmtMin(d.perf.avgResponseMin)}</td>
                          <td className="px-3 py-3"><Pill tone={d.perf.late > 0 ? "late" : "ok"}>{d.perf.late} terlambat</Pill></td>
                          <td className="px-3 py-3" style={{ minWidth: 150 }}>
                            {pct === null ? (
                              <span className="text-xs" style={{ color: C.muted }}>—</span>
                            ) : (
                              <div className="flex items-center gap-2">
                                <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: C.divide }}>
                                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                                </div>
                                <b className="w-12 text-right text-xs tabular-nums">{id(pct)}%</b>
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
          </Panel>

          <p className="text-[11px] leading-relaxed" style={{ color: C.sub }}>
            SLA hanya dihitung untuk chat yang masuk pada jam operasional ({hoursText}), dan waktu tunggunya dihitung dalam <b>menit kerja</b>. Chat di luar jam itu tetap tercatat tetapi tidak masuk pencapaian. Balasan dari HP (lewat tombol &quot;Sudah dibalas di HP&quot;) dihitung sebagai <b>selesai</b>, tetapi jamnya tidak diketahui sehingga tidak masuk rata-rata dan SLA; balas lewat panel supaya waktunya terukur. Beberapa pesan beruntun dari pelanggan dihitung satu kali. Chat yang menunggu lebih dari 24 jam dianggap sudah tidak perlu dibalas.
          </p>
        </>
      ) : null}

      {data && cfg && tab === "bot" && data.comparison ? <BotVsAdmin data={data} cfg={cfg} from={from} to={to} /> : null}
      {data && cfg && tab === "sla" && canManage ? <SlaSettings cfg={cfg} onSaved={() => void load(from, to)} /> : null}
    </section>
  );
}

/** Diagram batang per hari: tinggi = chat ditangani, bagian merah = terlambat. */
function Trend({ daily }: { daily: Data["daily"] }) {
  const rows = [...daily].reverse().slice(-14);
  const max = Math.max(1, ...rows.map((d) => d.perf.handled));
  return (
    <Panel
      title="Chat ditangani per hari"
      sub="Bagian merah = chat yang terlambat dibalas."
      right={
        <span className="inline-flex items-center gap-3 text-[11px]" style={{ color: C.sub }}>
          <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "#4a90c2" }} />Ditangani</span>
          <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: C.red }} />Terlambat</span>
        </span>
      }
    >
      <div className="mt-4 flex items-end gap-3 overflow-x-auto" style={{ height: 150 }}>
        {rows.map((d) => {
          const h = Math.max(6, (d.perf.handled / max) * 100);
          const lateH = d.perf.handled > 0 ? Math.min(h, (d.perf.late / d.perf.handled) * h) : 0;
          const p = dayParts(d.day);
          return (
            <div key={d.day} className="grid justify-items-center gap-1" style={{ flex: "1 0 38px", maxWidth: 96 }} title={`${fmtDay(d.day)}: ${d.perf.handled} ditangani, ${d.perf.late} terlambat`}>
              <span className="text-[11px] font-black tabular-nums" style={{ color: C.ink }}>{d.perf.handled}</span>
              <div className="relative w-full overflow-hidden rounded-lg" style={{ height: h, background: "#4a90c2" }}>
                {lateH > 0 ? <div className="absolute inset-x-0 bottom-0" style={{ height: lateH, background: C.red }} /> : null}
              </div>
              <span className="whitespace-nowrap text-[10px]" style={{ color: C.muted }}>{DAY_NAMES[p.dow]} {p.date}</span>
            </div>
          );
        })}
      </div>
    </Panel>
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
    <div className="flex items-center justify-between gap-3 py-2.5 text-xs" style={{ borderTop: `1px solid ${C.divide}` }}>
      <span style={{ color: C.sub }}>{k}</span>
      <b className="text-right tabular-nums" style={{ color: C.ink }}>{v}</b>
    </div>
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs" style={{ color: C.sub }}>Ringkasan gabungan untuk dibawa ke Ardo. Mengikuti rentang tanggal di atas.</p>
        <button type="button" onClick={() => void exportPdf()} disabled={exporting} className={buttonCls} style={{ borderColor: C.input, color: C.blue }}>
          {exporting ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />} {exporting ? "Membuat PDF…" : "Export PDF"}
        </button>
      </div>
      {exportError ? (
        <div className="rounded-xl border px-4 py-3 text-sm" style={{ background: "#FCE8E8", borderColor: "#F3CFCB", color: "#9B2C2C" }}>{exportError}</div>
      ) : null}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-2xl border bg-white p-4 shadow-sm" style={{ borderColor: C.border }}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: C.label }}>Bot WhatsApp</p>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${C.purple}14`, color: C.purple }}><MessageSquare size={16} /></span>
          </div>
          <p className="mt-2 text-2xl font-black tabular-nums" style={{ color: C.ink }}>{fmtMin(c.bot.medianMin)}</p>
          <p className="mb-2 mt-1 text-[11px] font-semibold" style={{ color: C.sub }}>kecepatan tengah (median) balasan pertama</p>
          {row("Chat dibalas bot", String(c.bot.count))}
          {row("9 dari 10 chat dibalas dalam", fmtMin(c.bot.p90Min))}
          {row("Waktu hitung", "menit biasa (termasuk malam dan Minggu)")}
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm" style={{ borderColor: C.border }}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: C.label }}>Admin (gabungan tim)</p>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${C.blue}14`, color: C.blue }}><Timer size={16} /></span>
          </div>
          <p className="mt-2 text-2xl font-black tabular-nums" style={{ color: C.ink }}>{fmtMin(c.team.medianMin)}</p>
          <p className="mb-2 mt-1 text-[11px] font-semibold" style={{ color: C.sub }}>kecepatan tengah (median) balasan lewat panel</p>
          {row("Chat dibalas lewat panel (terukur)", String(c.team.count))}
          {row("9 dari 10 chat dibalas dalam", fmtMin(c.team.p90Min))}
          {row("SLA tercapai", c.team.slaPct === null ? "—" : `${id(c.team.slaPct)}%`)}
          {row("Dibalas lewat HP (tidak terukur)", String(c.team.viaPhone))}
          {row("Waktu hitung", "menit kerja (jam operasional)")}
        </div>
      </div>
      <p className="text-[11px] leading-relaxed" style={{ color: C.sub }}>
        Bot dan admin bekerja di jam berbeda: bot membalas malam dan Minggu, admin membalas {daysText(cfg.opDays)} {cfg.openTime.replace(":", ".")}–{cfg.closeTime.replace(":", ".")}. Angkanya untuk gambaran umum, bukan lomba di chat yang sama. Beberapa pesan beruntun dari pelanggan dihitung satu kali. Ringkasan ini gabungan tanpa nama per orang. Chat yang masih menunggu saat ini: {c.unanswered}.
      </p>
    </>
  );
}

/* ───────────── Pengaturan SLA (Owner/Leader) ───────────── */

function SlaSettings({ cfg, onSaved }: { cfg: Config; onSaved: () => void }) {
  const [f, setF] = useState<Config>(cfg);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setF(cfg), [cfg]);

  const fieldLabel = "text-[11px] font-bold uppercase tracking-wider";
  const num = (key: "targetResponseMin" | "warningMin" | "lateMin" | "queueAlertThreshold", text: string, hint: string) => (
    <label className="grid content-start gap-1">
      <span className={fieldLabel} style={{ color: C.label }}>{text}</span>
      <input type="number" min={1} value={f[key]} onChange={(e) => setF({ ...f, [key]: Number(e.target.value) })} className={inputCls} style={{ borderColor: C.input, color: C.ink }} />
      <span className="text-[11px]" style={{ color: C.sub }}>{hint}</span>
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
    <Panel title="Target layanan" sub="Hanya Owner dan Leader yang dapat mengubah ambang ini. Dipakai untuk semua perhitungan dan warna waktu tunggu di Inbox.">
      <div className="mt-4 grid gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {num("targetResponseMin", "Target respons (menit)", "Balasan lebih cepat dari ini = tercapai")}
          {num("warningMin", "Warning (menit)", "Lewat batas ini = warning (kuning)")}
          {num("lateMin", "Terlambat (menit)", "Batas akhir sebelum dianggap terlambat (merah)")}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="grid content-start gap-1">
            <span className={fieldLabel} style={{ color: C.label }}>Jam operasional buka</span>
            <input type="time" value={f.openTime} onChange={(e) => setF({ ...f, openTime: e.target.value })} className={inputCls} style={{ borderColor: C.input, color: C.ink }} />
          </label>
          <label className="grid content-start gap-1">
            <span className={fieldLabel} style={{ color: C.label }}>Jam operasional tutup</span>
            <input type="time" value={f.closeTime} onChange={(e) => setF({ ...f, closeTime: e.target.value })} className={inputCls} style={{ borderColor: C.input, color: C.ink }} />
          </label>
        </div>
        <div className="grid gap-1.5">
          <span className={fieldLabel} style={{ color: C.label }}>Hari operasional</span>
          <div className="flex flex-wrap gap-1.5">
            {DAY_NAMES.map((name, d) => {
              const on = f.opDays.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setF({ ...f, opDays: on ? f.opDays.filter((x) => x !== d) : [...f.opDays, d].sort((a, b) => a - b) })}
                  className="h-9 rounded-full border px-4 text-xs font-bold"
                  style={{ background: on ? PILL.ok.bg : "#fff", color: on ? PILL.ok.fg : PILL.neutral.fg, borderColor: on ? "#bfe3cd" : C.input }}
                >
                  {name}
                </button>
              );
            })}
          </div>
          <span className="text-[11px]" style={{ color: C.sub }}>Chat di luar hari dan jam ini tidak dihitung dalam SLA.</span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {num("queueAlertThreshold", "Ambang alert antrean", "Jumlah chat menunggu sebelum alert muncul")}
          <label className="grid content-start gap-1">
            <span className={fieldLabel} style={{ color: C.label }}>Nama konfigurasi</span>
            <input value={f.name} maxLength={60} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} style={{ borderColor: C.input, color: C.ink }} />
          </label>
        </div>
        <label className="relative flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3.5" style={{ borderColor: C.border }}>
          <span className="grid gap-0.5">
            <b className="text-sm" style={{ color: C.ink }}>Hitung chat di luar jam operasional</b>
            <span className="text-[11px]" style={{ color: C.sub }}>Matikan agar chat malam (yang dijawab bot) tidak menurunkan pencapaian SLA</span>
          </span>
          <span aria-hidden="true" className="relative shrink-0" style={{ width: 44, height: 24, borderRadius: 999, background: f.countOutsideHours ? C.green : C.divide, transition: "background .15s" }}>
            <span className="absolute rounded-full bg-white shadow" style={{ top: 3, left: f.countOutsideHours ? 23 : 3, width: 18, height: 18, transition: "left .15s" }} />
          </span>
          <input type="checkbox" role="switch" checked={f.countOutsideHours} onChange={(e) => setF({ ...f, countOutsideHours: e.target.checked })} className="absolute opacity-0" style={{ width: 1, height: 1 }} />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-xl px-5 text-xs font-bold text-white disabled:opacity-60" style={{ background: C.navy }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : null} {saving ? "Menyimpan…" : "Simpan"}
          </button>
          {msg ? (
            <span className="text-xs font-bold" style={{ color: msg.ok ? C.green : PILL.late.fg }}>{msg.text}</span>
          ) : (
            <span className="text-[11px]" style={{ color: C.sub }}>Perubahan langsung dipakai untuk perhitungan berikutnya.</span>
          )}
        </div>
      </div>
    </Panel>
  );
}
