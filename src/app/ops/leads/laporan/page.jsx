"use client";

/**
 * Laporan Leads — dashboard ops SAMAQU.
 *
 * Semua angka dihitung dari data bulan terpilih (tabel `leads`, sumber data yang sama dipakai
 * PDF server di `/api/ops/leads/report`). Tidak ada data contoh/dummy: angka datang dari
 * agregasi `dailyRows` di bawah.
 *
 * Definisi yang dipakai konsisten di seluruh halaman:
 * - leads   = jumlah baris lead (status apa pun, termasuk yang akhirnya batal)
 * - closing = lead berstatus `closing`
 * - nominal = jumlah `leads.nominal` dari lead yang closing
 * - konversi = closing ÷ leads
 *
 * Urutan tampilan: header → 5 kartu angka → insight + kontribusi sumber → tabel per sumber →
 * grafik harian → rekap harian.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/lib/ops-api";
import { supabase } from "@/lib/supabase";
import { useReducedMotion } from "framer-motion";
import {
  BarChart3,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileDown,
  Loader2,
  Sparkles,
  Star,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";

/* ───────────────────────── konstanta ───────────────────────── */

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
/** Nama sumber di DB adalah "Meta ads"; label tampilan di halaman ini mengikuti permintaan pemilik. */
const SOURCES = ["Meta ads", "WA", "IG", "Website"];
const SOURCE_LABEL = { "Meta ads": "Meta Ads", WA: "WA", IG: "IG", Website: "Website" };
/** Warna sumber — dipakai di semua bagian halaman supaya arti warnanya konsisten. */
const SOURCE_COLOR = { "Meta ads": "#7C3AED", WA: "#16A34A", IG: "#DB2777", Website: "#2563EB" };
const COLORS = {
  ink: "#111111",
  muted: "#6B7280",
  faint: "#9CA3AF",
  border: "#E6E8EC",
  gridLine: "#EEF0F3",
  rowLine: "#F2F3F5",
  totalBg: "#F8F9FA",
  hoverBg: "#FAFAFB",
  pageBg: "#F4F5F7",
  green: "#16A34A",
  red: "#DC2626",
};

const pad = (n) => String(n).padStart(2, "0");
const nfmt = (v) => (Number(v) || 0).toLocaleString("id-ID", { maximumFractionDigits: 0 });
/** Persen dengan koma desimal: 3,5% */
const pct = (v) => `${(Number(v) || 0).toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
/** Nominal rupiah penuh: Rp12.900.000 */
const rp = (v) => `Rp${nfmt(v)}`;
/** Nominal ringkas: Rp12,9 jt / Rp322 rb */
const rpShort = (v) => {
  const n = Number(v) || 0;
  const fmt = (x, suffix) => `Rp${x.toLocaleString("id-ID", { maximumFractionDigits: 1 })} ${suffix}`;
  if (Math.abs(n) >= 1_000_000_000) return fmt(n / 1_000_000_000, "m");
  if (Math.abs(n) >= 1_000_000) return fmt(n / 1_000_000, "jt");
  if (Math.abs(n) >= 1_000) return fmt(n / 1_000, "rb");
  return `Rp${nfmt(n)}`;
};

const formatTanggalID = (d) => {
  if (!d) return "-";
  const parts = String(d).split("-");
  if (parts.length < 3) return d;
  return `${parseInt(parts[2], 10)} ${MONTHS[parseInt(parts[1], 10) - 1] || parts[1]} ${parts[0]}`;
};
/** "2026-10-05" → "5 Okt" */
const formatTanggalPendek = (d) => {
  const parts = String(d || "").split("-");
  if (parts.length < 3) return d;
  return `${parseInt(parts[2], 10)} ${MONTHS_SHORT[parseInt(parts[1], 10) - 1] || parts[1]}`;
};

const shiftMonthKey = (key, delta) => {
  const [y, m] = String(key).split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};
const monthKeyLabel = (key) => {
  const [y, m] = String(key).split("-").map(Number);
  return `${MONTHS[m - 1] || m} ${y}`;
};
const currentMonthKey = () => {
  const w = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}`;
};

/* ───────────────────────── hook animasi ───────────────────────── */

/** Ticker satu angka: nilai lama → nilai akhir 1,6 s ease-out (requestAnimationFrame). */
function useCountUp(target, duration = 1600) {
  const reduce = useReducedMotion();
  const [value, setValue] = useState(reduce ? Number(target) || 0 : 0);
  const fromRef = useRef(0);

  useEffect(() => {
    const to = Number(target) || 0;
    if (reduce) {
      setValue(to);
      fromRef.current = to;
      return undefined;
    }
    const from = fromRef.current;
    if (from === to) {
      setValue(to);
      return undefined;
    }
    let raf = 0;
    const startedAt = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (to - from) * eased;
      setValue(next);
      fromRef.current = next;
      if (t < 1) raf = requestAnimationFrame(tick);
      else {
        fromRef.current = to;
        setValue(to);
      }
    };
    raf = requestAnimationFrame(tick);
    // Ganti bulan di tengah animasi: nilai terakhir tetap jadi titik awal animasi berikutnya,
    // jadi angkanya tidak melompat balik ke 0.
    return () => {
      cancelAnimationFrame(raf);
      fromRef.current = from + (to - from) * Math.min(1, (performance.now() - startedAt) / duration);
    };
  }, [target, duration, reduce]);

  return value;
}

/** Kartu/potongan yang muncul dengan fade + naik 16px, berurutan sesuai `delay`. */
function useReveal(restKey, count, step = 0.06) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? count : 0);
  useEffect(() => {
    if (reduce) {
      setShown(count);
      return undefined;
    }
    setShown(0);
    const timers = Array.from({ length: count }, (_, i) => setTimeout(() => setShown((s) => Math.max(s, i + 1)), i * step * 1000));
    return () => timers.forEach(clearTimeout);
  }, [restKey, count, step, reduce]);
  return (index) => (shown > index ? "reveal-in" : "reveal-out");
}

/* ───────────────────────── format animasi ───────────────────────── */

/** Angka naik tapi formatnya tetap benar: titik ribuan, koma, %, Rp, jt, rb. */
function CountValue({ target, format = "int", className, style }) {
  const value = useCountUp(target);
  return (
    <span className={className} style={style}>
      {format === "percent" ? pct(value) : format === "short" ? rpShort(value) : nfmt(Math.round(value))}
    </span>
  );
}

/* ───────────────────────── komponen kecil ───────────────────────── */

function SourceDot({ source, size = 9 }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, borderRadius: 999, background: SOURCE_COLOR[source] || COLORS.faint, display: "inline-block", flexShrink: 0 }}
    />
  );
}

function Legend() {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
      {SOURCES.map((s) => (
        <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: COLORS.muted }}>
          <SourceDot source={s} />
          {SOURCE_LABEL[s]}
        </span>
      ))}
    </div>
  );
}

function Delta({ value, label }) {
  if (value === null || !Number.isFinite(value)) return null;
  const up = value >= 0;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 700, color: up ? COLORS.green : COLORS.red }}>
      {up ? "▲" : "▼"} {pct(Math.abs(value))}
      <span style={{ color: COLORS.faint, fontWeight: 600 }}>vs {label}</span>
    </span>
  );
}

/* ───────────────────────── kartu angka ───────────────────────── */

function StatCard({ item, index, showCls }) {
  const dark = item.tone === "dark";
  return (
    <div
      className={showCls(index)}
      style={{
        background: dark ? COLORS.ink : "#FFFFFF",
        border: `1px solid ${dark ? COLORS.ink : COLORS.border}`,
        borderRadius: 20,
        padding: 20,
        minWidth: 0,
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: dark ? "rgba(255,255,255,0.65)" : COLORS.muted }}>
        {item.label}
      </p>
      <p
        className="tabular-nums"
        style={{
          fontSize: 34,
          fontWeight: 800,
          lineHeight: 1.05,
          letterSpacing: "-0.02em",
          color: dark ? "#FFFFFF" : COLORS.ink,
          whiteSpace: "nowrap",
        }}
      >
        {item.format === "short" ? <CountValue target={item.value} format="short" /> : item.format === "percent" ? <CountValue target={item.value} format="percent" /> : <CountValue target={item.value} />}
      </p>

      {item.progress !== undefined ? (
        <div style={{ height: 6, borderRadius: 999, background: dark ? "rgba(255,255,255,0.18)" : "#F1F2F4", overflow: "hidden" }} aria-hidden="true">
          <div
            className={showCls(index)}
            style={{
              height: "100%",
              width: `${Math.max(0, Math.min(100, item.progress))}%`,
              borderRadius: 999,
              background: dark ? "#FFFFFF" : COLORS.ink,
              transformOrigin: "left center",
            }}
          />
        </div>
      ) : null}

      <div style={{ marginTop: "auto", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: dark ? "rgba(255,255,255,0.62)" : COLORS.muted }}>{item.caption}</span>
        {item.delta !== undefined && item.delta !== null ? (
          <span style={{ fontSize: 11, fontWeight: 700, color: item.delta >= 0 ? (dark ? "#86EFAC" : COLORS.green) : dark ? "#FCA5A5" : COLORS.red }}>
            {item.delta >= 0 ? "▲" : "▼"} {pct(Math.abs(item.delta))}
            <span style={{ color: dark ? "rgba(255,255,255,0.55)" : COLORS.faint, fontWeight: 600 }}> vs {item.prevLabel}</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* ───────────────────────── insight otomatis ───────────────────────── */

const INSIGHT_TONE = {
  blue: { bg: "#EEF2FF", border: "#DCE3FF", fg: "#1E3A8A", chip: "#2563EB" },
  amber: { bg: "#FFF8E6", border: "#F6E3B4", fg: "#7A4B00", chip: "#D97706" },
  green: { bg: "#ECFDF3", border: "#CCEEDA", fg: "#08553A", chip: "#16A34A" },
  red: { bg: "#FEF2F2", border: "#F7D4D4", fg: "#7F1D1D", chip: "#DC2626" },
};

const INSIGHT_ICON = { blue: Star, amber: AlertTriangle, green: TrendingUp, red: AlertTriangle };

function buildInsights({ rows, totals, leaks }) {
  const out = [];
  const rate = totals.total ? (totals.closing / totals.total) * 100 : 0;
  const withClosing = rows.filter((r) => r.closing > 0);
  const bestConvSource = withClosing.length > 0 ? [...withClosing].sort((a, b) => b.conversion - a.conversion || b.closing - a.closing)[0] : null;

  // ★ Sumber konversi tertinggi + kontribusinya ke closing & nominal.
  if (bestConvSource && totals.closing > 0) {
    const best = bestConvSource;
    const shareClosing = (best.closing / totals.closing) * 100;
    const shareNominal = totals.nominal ? (best.nominal / totals.nominal) * 100 : 0;
    out.push({
      tone: "blue",
      html: (
        <>
          <b>{SOURCE_LABEL[best.source]}</b> paling efektif: konversi <b>{pct(best.conversion)}</b>. Sumber ini menyumbang{" "}
          <b>{pct(shareClosing)}</b> dari closing dan <b>{pct(shareNominal)}</b> dari nominal.
        </>
      ),
    });
  }

  // ! Sumber leads terbanyak tapi konversinya di bawah rata-rata.
  // Dicek dari seluruh sumber (bukan urutan konversi) dan dilewati bila sumber yang sama sudah
  // muncul di insight biru, supaya dua kotak tidak membahas hal yang sama.
  const biggest = [...rows].sort((a, b) => b.leads - a.leads || a.conversion - b.conversion)[0];
  if (biggest && biggest.source !== bestConvSource?.source && biggest.leads > 0 && totals.total > 0 && biggest.conversion < rate) {
    out.push({
      tone: "amber",
      html: (
        <>
          <b>{SOURCE_LABEL[biggest.source]}</b> paling banyak leads (<b>{nfmt(biggest.leads)}</b>) tetapi konversinya{" "}
          <b>{pct(biggest.conversion)}</b>, di bawah rata-rata <b>{pct(rate)}</b>.
        </>
      ),
    });
  }

  // ↑ Rata-rata nilai per closing tertinggi (boleh sumber yang sama dengan insight biru: sudut
  // pembahasannya berbeda — nominal per closing, bukan konversi).
  if (withClosing.length > 0) {
    const bestAvg = [...withClosing].sort((a, b) => b.avg - a.avg || b.closing - a.closing)[0];
    if (bestAvg.avg > 0) {
      out.push({
        tone: "green",
        html: (
          <>
            <b>{SOURCE_LABEL[bestAvg.source]}</b> punya rata-rata per closing tertinggi: <b>{rp(bestAvg.avg)}</b> dari{" "}
            <b>{nfmt(bestAvg.closing)}</b> closing.
          </>
        ),
      });
    }
  }

  // ? Anomali data yang perlu dicek.
  const zeroNominal = rows.filter((r) => r.closing > 0 && r.nominal === 0);
  if (zeroNominal.length > 0) {
    out.push({
      tone: "red",
      html: (
        <>
          <b>{zeroNominal.map((r) => SOURCE_LABEL[r.source]).join(", ")}</b> punya closing tetapi nominal masih{" "}
          <b>Rp0</b>. Nominal lead closing perlu dilengkapi.
        </>
      ),
    });
  } else if (leaks.total > 0) {
    const src = Object.entries(leaks.bySource)
      .sort((a, b) => b[1] - a[1])
      .map(([s]) => SOURCE_LABEL[s] || s)
      .join(", ");
    out.push({
      tone: "red",
      html: (
        <>
          Ada <b>{nfmt(leaks.total)}</b> lead tanpa sumber ({src}). Sumbernya perlu diisi supaya laporan akurat.
        </>
      ),
    });
  }

  return out.slice(0, 4);
}

/* ───────────────────────── kontribusi per sumber ───────────────────────── */

function ContributionBars({ metrics, showCls }) {
  const bySource = metrics.bySource || {};
  const rows = [
    { key: "leads", label: "Leads", total: metrics.totals.total, values: (s) => bySource[s]?.leads || 0 },
    { key: "closing", label: "Closing", total: metrics.totals.closing, values: (s) => bySource[s]?.closing || 0 },
    { key: "nominal", label: "Nominal", total: metrics.totals.nominal, values: (s) => bySource[s]?.nominal || 0 },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Legend />
      {rows.map((row, rowIndex) => (
        <div key={row.key}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: COLORS.ink }}>{row.label}</span>
            <span className="tabular-nums" style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted }}>
              {row.key === "nominal" ? rp(row.total) : nfmt(row.total)}
            </span>
          </div>
          <div
            className={showCls(10 + rowIndex)}
            style={{ display: "flex", gap: 2, height: 28, borderRadius: 8, overflow: "hidden", background: "#F1F2F4", transformOrigin: "left center" }}
          >
            {SOURCES.map((s) => {
              const raw = row.values(s) || 0;
              if (!raw || !row.total) return null;
              const share = (raw / row.total) * 100;
              return (
                <div
                  key={s}
                  title={`${SOURCE_LABEL[s]}: ${row.key === "nominal" ? rp(raw) : nfmt(raw)} (${pct(share)})`}
                  style={{
                    flexGrow: raw,
                    flexBasis: 0,
                    /** Segmen tetap kelihatan walau porsinya kecil (≥ 2px), tapi tidak menggeser skala. */
                    minWidth: 2,
                    background: SOURCE_COLOR[s],
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }}
                >
                  {share >= 12 ? (
                    <span className="tabular-nums" style={{ fontSize: 10, fontWeight: 800, color: "#FFFFFF", padding: "0 4px", whiteSpace: "nowrap" }}>
                      {pct(share)}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────── tabel per sumber ───────────────────────── */

function SourceTable({ rows, totals, showCls }) {
  const columns = [
    { key: "source", label: "Sumber", align: "left" },
    { key: "leads", label: "Leads", align: "right" },
    { key: "closing", label: "Closing", align: "right" },
    { key: "conversion", label: "Konversi", align: "left" },
    { key: "nominal", label: "Nominal", align: "right" },
    { key: "avg", label: "Rata-rata / Closing", align: "right" },
    { key: "share", label: "Share Nominal", align: "right" },
  ];
  const maxConv = Math.max(1, ...rows.map((r) => r.conversion));
  const th = { fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: COLORS.muted, padding: "10px 12px", whiteSpace: "nowrap" };
  const td = { fontSize: 14, padding: "12px", color: "#374151", borderTop: `1px solid ${COLORS.rowLine}`, verticalAlign: "middle", whiteSpace: "nowrap" };

  const totalConv = totals.total ? (totals.closing / totals.total) * 100 : 0;

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="tabular-nums" style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" style={{ ...th, textAlign: c.align }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const anomaly = r.closing > 0 && r.nominal === 0;
            return (
              <tr key={r.source} className="lt-row" style={{ animationDelay: `${Math.min(i * 0.05, 0.3)}s` }}>
                <td style={{ ...td, fontWeight: 700, color: COLORS.ink }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <SourceDot source={r.source} />
                    {SOURCE_LABEL[r.source]}
                  </span>
                </td>
                <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{nfmt(r.leads)}</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{nfmt(r.closing)}</td>
                <td style={td}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 130, height: 6, borderRadius: 999, background: "#F1F2F4", overflow: "hidden", display: "inline-block" }} aria-hidden="true">
                      <span
                        className={showCls(20 + i)}
                        style={{ display: "block", height: "100%", width: `${Math.min(100, (r.conversion / maxConv) * 100)}%`, borderRadius: 999, background: COLORS.ink, transformOrigin: "left center" }}
                      />
                    </span>
                    <b style={{ fontSize: 12, color: COLORS.ink }}>{pct(r.conversion)}</b>
                  </span>
                </td>
                <td style={{ ...td, textAlign: "right", fontWeight: 700, color: anomaly ? COLORS.red : "#374151" }}>
                  {anomaly ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {rp(r.nominal)}
                      <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.06em", color: COLORS.red, background: "#FEF2F2", border: `1px solid #F7D4D4`, borderRadius: 6, padding: "2px 5px" }}>
                        CEK
                      </span>
                    </span>
                  ) : (
                    rp(r.nominal)
                  )}
                </td>
                <td style={{ ...td, textAlign: "right" }}>{r.closing > 0 ? rp(r.avg) : "—"}</td>
                <td style={{ ...td, textAlign: "right", color: COLORS.muted }}>{pct(r.shareNominal)}</td>
              </tr>
            );
          })}
          <tr style={{ background: COLORS.totalBg }}>
            <td style={{ ...td, fontWeight: 800, color: COLORS.ink, borderTop: `2px solid ${COLORS.border}` }}>Total</td>
            <td style={{ ...td, textAlign: "right", fontWeight: 800, color: COLORS.ink, borderTop: `2px solid ${COLORS.border}` }}>{nfmt(totals.total)}</td>
            <td style={{ ...td, textAlign: "right", fontWeight: 800, color: COLORS.ink, borderTop: `2px solid ${COLORS.border}` }}>{nfmt(totals.closing)}</td>
            <td style={{ ...td, fontWeight: 800, color: COLORS.ink, borderTop: `2px solid ${COLORS.border}` }}>{pct(totalConv)}</td>
            <td style={{ ...td, textAlign: "right", fontWeight: 800, color: COLORS.ink, borderTop: `2px solid ${COLORS.border}` }}>{rp(totals.nominal)}</td>
            <td style={{ ...td, textAlign: "right", fontWeight: 800, color: COLORS.ink, borderTop: `2px solid ${COLORS.border}` }}>{totals.closing > 0 ? rp(totals.avg) : "—"}</td>
            <td style={{ ...td, textAlign: "right", fontWeight: 800, color: COLORS.ink, borderTop: `2px solid ${COLORS.border}` }}>100,0%</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ───────────────────────── grafik harian (SVG) ───────────────────────── */

const CHART = { height: 300, padTop: 44, padRight: 18, padBottom: 30, padLeft: 34 };

function smoothPath(points) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cx = (p0.x + p1.x) / 2;
    d += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

function DailyChart({ days = [], filter, onFilter, showCls }) {
  const reduce = useReducedMotion();
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState(null);
  const [drawn, setDrawn] = useState(false);

  /**
   * Grafik tidak boleh bergantung pada bentuk objek dari pemanggil: nilai yang hilang /
   * bukan angka diperlakukan 0 supaya koordinat SVG tidak pernah NaN (NaN di atribut SVG
   * membuat React gagal render dan halaman jadi "This page couldn't load").
   */
  const safeDays = useMemo(
    () =>
      (days || []).map((d) => ({
        tanggal: String(d?.tanggal || ""),
        leads: Number.isFinite(Number(d?.leads)) ? Number(d.leads) : 0,
        closing: Number.isFinite(Number(d?.closing)) ? Number(d.closing) : 0,
        total: Number.isFinite(Number(d?.total)) ? Number(d.total) : 0,
        nominal: Number.isFinite(Number(d?.nominal)) ? Number(d.nominal) : 0,
        bySource: d?.bySource && typeof d.bySource === "object" ? d.bySource : {},
      })),
    [days],
  );

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const update = () => setWidth(Math.max(320, el.clientWidth));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Setiap kali data/filter berganti, garis digambar ulang dari awal.
  const signature = useMemo(() => safeDays.map((d) => `${d.tanggal}:${d.leads}:${d.closing}`).join("|") + filter, [safeDays, filter]);
  useEffect(() => {
    setDrawn(false);
    const timer = setTimeout(() => setDrawn(true), reduce ? 0 : 40);
    return () => clearTimeout(timer);
  }, [signature, reduce]);

  const innerW = Math.max(120, width - CHART.padLeft - CHART.padRight);
  const innerH = CHART.height - CHART.padTop - CHART.padBottom;
  const maxLeads = Math.max(4, ...safeDays.map((d) => d.leads));
  const stepX = safeDays.length > 1 ? innerW / (safeDays.length - 1) : 0;
  const xAt = (i) => CHART.padLeft + i * stepX;
  const yAt = (v) => CHART.padTop + innerH - (v / maxLeads) * innerH;

  const points = safeDays.map((d, i) => ({ x: xAt(i), y: yAt(d.leads) }));
  const line = smoothPath(points);
  const area = points.length
    ? `${line} L ${points[points.length - 1].x} ${CHART.padTop + innerH} L ${points[0].x} ${CHART.padTop + innerH} Z`
    : "";

  const peakIndex = safeDays.reduce((best, d, i) => (d.leads > (safeDays[best]?.leads ?? -1) ? i : best), 0);
  const peak = safeDays[peakIndex] && safeDays[peakIndex].leads > 0 ? safeDays[peakIndex] : null;
  const hasLeads = safeDays.some((d) => d.leads > 0);
  const ticks = [0, Math.round(maxLeads / 2), maxLeads];
  const labelEvery = Math.max(1, Math.ceil(safeDays.length / 7));
  const hoverDay = hover !== null ? safeDays[hover] : null;

  const summary = `Grafik garis leads per hari ${safeDays.length ? formatTanggalID(safeDays[0].tanggal) : ""} sampai ${safeDays.length ? formatTanggalID(safeDays[safeDays.length - 1].tanggal) : ""}. Total ${nfmt(safeDays.reduce((s, d) => s + d.leads, 0))} leads, ${nfmt(safeDays.reduce((s, d) => s + d.closing, 0))} closing. ${peak ? `Hari tertinggi ${formatTanggalID(peak.tanggal)} dengan ${peak.leads} leads.` : "Belum ada leads pada periode ini."}`;

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <p style={{ fontSize: 13, color: COLORS.muted, margin: 0 }}>Garis = leads masuk. Titik hitam = ada closing, makin besar makin banyak.</p>
        <div role="group" aria-label="Filter sumber grafik" style={{ display: "inline-flex", gap: 2, background: "#F3F4F6", borderRadius: 10, padding: 3 }}>
          {[{ key: "all", label: "Semua" }, ...SOURCES.map((s) => ({ key: s, label: SOURCE_LABEL[s] }))].map((opt) => {
            const active = filter === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                aria-pressed={active}
                onClick={() => onFilter(opt.key)}
                style={{
                  border: 0,
                  cursor: "pointer",
                  borderRadius: 8,
                  padding: "6px 10px",
                  fontSize: 11,
                  fontWeight: 800,
                  background: active ? "#FFFFFF" : "transparent",
                  color: active ? COLORS.ink : COLORS.muted,
                  boxShadow: active ? "0 1px 2px rgba(16,24,40,0.08)" : "none",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div ref={wrapRef} style={{ position: "relative", width: "100%" }}>
        {!hasLeads ? (
          <div
            style={{
              height: CHART.height,
              display: "grid",
              placeItems: "center",
              textAlign: "center",
              borderRadius: 16,
              background: "#FAFBFC",
              border: `1px dashed ${COLORS.border}`,
            }}
          >
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: COLORS.ink }}>
                Belum ada leads pada periode ini
              </p>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: COLORS.muted }}>
                {filter === "all" ? "Pindah bulan atau tambahkan lead lewat menu Leads." : `Tidak ada lead dari ${SOURCE_LABEL[filter]} di bulan ini.`}
              </p>
            </div>
          </div>
        ) : (
        <svg
          height={CHART.height}
          viewBox={`0 0 ${width} ${CHART.height}`}
          role="img"
          aria-label={summary}
          style={{ display: "block", overflow: "visible" }}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id="leadArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#111111" stopOpacity="0.14" />
              <stop offset="100%" stopColor="#111111" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* grid + label sumbu Y */}
          {ticks.map((t) => (
            <g key={`tick-${t}`}>
              <line x1={CHART.padLeft} x2={width - CHART.padRight} y1={yAt(t)} y2={yAt(t)} stroke={COLORS.gridLine} strokeWidth="1" />
              <text x={CHART.padLeft - 8} y={yAt(t) + 3.5} textAnchor="end" fontSize="10" fill={COLORS.faint}>
                {t}
              </text>
            </g>
          ))}

          {/* area + garis */}
          {area ? (
            <path
              d={area}
              fill="url(#leadArea)"
              style={{ opacity: drawn ? 1 : 0, transition: reduce ? "none" : "opacity 0.9s ease 0.45s" }}
            />
          ) : null}
          {line ? (
            <path
              d={line}
              fill="none"
              stroke={COLORS.ink}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength="1"
              style={{
                strokeDasharray: 1,
                strokeDashoffset: drawn ? 0 : 1,
                transition: reduce ? "none" : "stroke-dashoffset 1.6s cubic-bezier(0.32, 0.72, 0.24, 1)",
              }}
            />
          ) : null}

          {/* garis putus-putus puncak */}
          {peak && peak.leads > 0 ? (
            <line
              x1={xAt(peakIndex)}
              x2={xAt(peakIndex)}
              y1={CHART.padTop - 6}
              y2={CHART.padTop + innerH}
              stroke="#C9CCD3"
              strokeWidth="1"
              strokeDasharray="4 4"
              style={{ opacity: drawn ? 1 : 0, transition: reduce ? "none" : "opacity 0.5s ease 1.2s" }}
            />
          ) : null}

          {/* titik closing */}
          {safeDays.map((d, i) =>
            d.closing > 0 ? (
              <circle
                key={`c-${d.tanggal}`}
                cx={xAt(i)}
                cy={yAt(d.leads)}
                r={3 + d.closing * 1.4}
                fill={COLORS.ink}
                stroke="#FFFFFF"
                strokeWidth="2"
                style={{
                  opacity: drawn ? 1 : 0,
                  transformBox: "fill-box",
                  transformOrigin: "center",
                  transform: drawn ? "scale(1)" : "scale(0.2)",
                  transition: reduce ? "none" : `opacity 0.25s ease ${0.9 + i * 0.03}s, transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) ${0.9 + i * 0.03}s`,
                }}
              />
            ) : null,
          )}

          {/* titik hover */}
          {hoverDay ? (
            <circle cx={xAt(hover)} cy={yAt(hoverDay.leads)} r="4.5" fill={COLORS.ink} stroke="#FFFFFF" strokeWidth="2" />
          ) : null}

          {/* label tanggal — semua tanggal tetap punya tick, labelnya tiap ±5 hari */}
          {safeDays.map((d, i) => {
            const isEdge = i === 0 || i === safeDays.length - 1;
            if (!(i % labelEvery === 0 || isEdge || i === peakIndex)) return null;
            return (
              <g key={`x-${d.tanggal}`}>
                <line x1={xAt(i)} x2={xAt(i)} y1={CHART.padTop + innerH} y2={CHART.padTop + innerH + 4} stroke="#E3E5E9" strokeWidth="1" />
                <text x={xAt(i)} y={CHART.height - 8} textAnchor="middle" fontSize="10" fill={COLORS.faint}>
                  {formatTanggalPendek(d.tanggal)}
                </text>
              </g>
            );
          })}

          {/* area hover */}
          {safeDays.map((d, i) => (
            <rect
              key={`h-${d.tanggal}`}
              x={xAt(i) - (stepX || innerW) / 2}
              y={CHART.padTop}
              width={stepX || innerW}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              tabIndex={-1}
            />
          ))}

          {/* tooltip puncak (permanen) */}
          {peak && peak.leads > 0 ? (
            <PeakPill x={xAt(peakIndex)} y={yAt(peak.leads)} width={width} day={peak} visible={drawn} reduce={reduce} />
          ) : null}
        </svg>
        )}

        {hoverDay && hasLeads ? (
          <div
            style={{
              position: "absolute",
              left: Math.min(Math.max(xAt(hover) - 90, 0), Math.max(0, width - 190)),
              top: 8,
              width: 180,
              background: "#FFFFFF",
              border: `1px solid ${COLORS.border}`,
              borderRadius: 12,
              boxShadow: "0 10px 24px rgba(16,24,40,0.12)",
              padding: "10px 12px",
              pointerEvents: "none",
              zIndex: 5,
            }}
          >
            <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: COLORS.ink }}>{formatTanggalID(hoverDay.tanggal)}</p>
            <p className="tabular-nums" style={{ margin: "4px 0 6px", fontSize: 11, fontWeight: 700, color: COLORS.muted }}>
              {nfmt(hoverDay.total)} leads · {nfmt(hoverDay.closing)} closing
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {SOURCES.filter((s) => (hoverDay.bySource?.[s] || 0) > 0).map((s) => (
                <span key={s} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, color: "#374151", fontWeight: 600 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <SourceDot source={s} size={7} />
                    {SOURCE_LABEL[s]}
                  </span>
                  <span className="tabular-nums">{nfmt(hoverDay.bySource?.[s])}</span>
                </span>
              ))}
            </div>
            <p className="tabular-nums" style={{ margin: "6px 0 0", fontSize: 11, fontWeight: 800, color: COLORS.ink }}>
              {rp(hoverDay.nominal)}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PeakPill({ x, y, width, day, visible, reduce }) {
  const pillW = 150;
  const left = Math.min(Math.max(x - pillW / 2, 0), Math.max(0, width - pillW));
  const top = Math.max(0, y - 58);
  return (
    <g
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(6px)",
        transition: reduce ? "none" : "opacity 0.4s ease 1.5s, transform 0.4s ease 1.5s",
      }}
    >
      <rect x={left} y={top} width={pillW} height={40} rx={10} fill={COLORS.ink} />
      <text x={left + 12} y={top + 16} fontSize="10" fontWeight="800" fill="#FFFFFF">
        {`${formatTanggalPendek(day.tanggal)} · Puncak`}
      </text>
      <text x={left + 12} y={top + 30} fontSize="10" fill="rgba(255,255,255,0.72)">
        {`${nfmt(day.leads)} leads · ${nfmt(day.closing)} closing`}
      </text>
      <line x1={left + pillW / 2} y1={top + 40} x2={x} y2={y - 6} stroke={COLORS.ink} strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />
    </g>
  );
}

/* ───────────────────────── rekap harian ───────────────────────── */

function DailyTable({ days = [], totals }) {
  const [expanded, setExpanded] = useState(false);
  const newestFirst = useMemo(
    () => [...(days || [])].reverse().map((d) => ({ ...d, bySource: d?.bySource || {} })),
    [days],
  );
  const visible = expanded ? newestFirst : newestFirst.slice(0, 7);
  const th = { fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: COLORS.muted, padding: "10px 12px", whiteSpace: "nowrap" };
  const td = { fontSize: 14, padding: "10px 12px", borderTop: `1px solid ${COLORS.rowLine}`, whiteSpace: "nowrap" };

  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <table className="tabular-nums" style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
          <thead>
            <tr>
              <th scope="col" style={{ ...th, textAlign: "left" }}>Tanggal</th>
              {SOURCES.map((s) => (
                <th key={s} scope="col" style={{ ...th, textAlign: "right" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <SourceDot source={s} size={7} />
                    {SOURCE_LABEL[s]}
                  </span>
                </th>
              ))}
              <th scope="col" style={{ ...th, textAlign: "right" }}>Total Leads</th>
              <th scope="col" style={{ ...th, textAlign: "right" }}>Closing</th>
              <th scope="col" style={{ ...th, textAlign: "right" }}>Nominal</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((d) => (
              <tr key={d.tanggal} className="lt-row">
                <td style={{ ...td, fontWeight: 700, color: COLORS.ink }}>{formatTanggalPendek(d.tanggal)}</td>
                {SOURCES.map((s) => (
                  <td key={s} style={{ ...td, textAlign: "right", color: d.bySource?.[s] ? "#374151" : COLORS.faint }}>{nfmt(d.bySource?.[s])}</td>
                ))}
                <td style={{ ...td, textAlign: "right", fontWeight: 800, color: COLORS.ink }}>{nfmt(d.total)}</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{nfmt(d.closing)}</td>
                <td style={{ ...td, textAlign: "right" }}>{rp(d.nominal)}</td>
              </tr>
            ))}
            <tr style={{ background: COLORS.totalBg }}>
              <td style={{ ...td, fontWeight: 800, color: COLORS.ink, borderTop: `2px solid ${COLORS.border}` }}>Total</td>
              {SOURCES.map((s) => (
                <td key={s} style={{ ...td, textAlign: "right", fontWeight: 800, color: COLORS.ink, borderTop: `2px solid ${COLORS.border}` }}>
                  {nfmt(totals?.bySource?.[s]?.leads)}
                </td>
              ))}
              <td style={{ ...td, textAlign: "right", fontWeight: 800, color: COLORS.ink, borderTop: `2px solid ${COLORS.border}` }}>{nfmt(totals.total)}</td>
              <td style={{ ...td, textAlign: "right", fontWeight: 800, color: COLORS.ink, borderTop: `2px solid ${COLORS.border}` }}>{nfmt(totals.closing)}</td>
              <td style={{ ...td, textAlign: "right", fontWeight: 800, color: COLORS.ink, borderTop: `2px solid ${COLORS.border}` }}>{rp(totals.nominal)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {days.length > 7 ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{
            marginTop: 12,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            border: `1px solid ${COLORS.border}`,
            background: "#FFFFFF",
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 800,
            color: COLORS.ink,
            cursor: "pointer",
          }}
        >
          {expanded ? "Ringkas 7 hari" : `Lihat semua ${days.length} hari`}
          <ChevronDown size={14} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }} />
        </button>
      ) : null}
    </div>
  );
}

/* ───────────────────────── panel pembungkus ───────────────────────── */

function Panel({ children, delay = 0, style, className = "" }) {
  return (
    <section
      className={className}
      style={{
        background: "#FFFFFF",
        border: `1px solid ${COLORS.border}`,
        borderRadius: 20,
        padding: 20,
        minWidth: 0,
        animation: `lp-rise 0.45s ease-out ${delay}s both`,
        ...style,
      }}
    >
      {children}
    </section>
  );
}

function PanelHead({ title, subtitle, right }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
      <div style={{ minWidth: 0 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: COLORS.ink, letterSpacing: "-0.01em" }}>{title}</h2>
        {subtitle ? <p style={{ margin: "2px 0 0", fontSize: 13, color: COLORS.muted }}>{subtitle}</p> : null}
      </div>
      {right}
    </div>
  );
}

/* ───────────────────────── halaman ───────────────────────── */

export default function LaporanLeads() {
  const [monthKey, setMonthKey] = useState(() => currentMonthKey());
  const [sourceFilter, setSourceFilter] = useState("all");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [copied, setCopied] = useState(false);

  const [year, month] = useMemo(() => {
    const [y, m] = monthKey.split("-").map(Number);
    return [y, m - 1];
  }, [monthKey]);
  const prevKey = shiftMonthKey(monthKey, -1);
  const prevLabel = MONTHS_SHORT[Number(prevKey.slice(5, 7)) - 1];

  const rangeOf = (key) => {
    const [y, m] = key.split("-").map(Number);
    return [`${key}-01`, `${key}-${pad(new Date(y, m, 0).getDate())}`];
  };
  const [start, end] = rangeOf(monthKey);
  const [prevStart, prevEnd] = rangeOf(prevKey);

  /**
   * Pembanding bulan sebelumnya dibuat apple-to-apple: bulan berjalan dibandingkan dengan
   * rentang tanggal yang SAMA di bulan sebelumnya (1–13 Okt vs 1–13 Sep), bukan bulan penuh
   * (yang selalu membuat bulan berjalan terlihat turun). Bulan yang sudah selesai memakai
   * bulan penuh. Dihitung dalam WIB, sama seperti batas bulan laporan.
   */
  const todayKeyWib = currentMonthKey();
  const isCurrentMonth = monthKey === currentMonthKey();
  const dayOfMonthWib = Number(
    new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(8, 10),
  );
  const prevCompareEnd = isCurrentMonth
    ? `${prevKey}-${pad(Math.min(dayOfMonthWib, Number(prevEnd.slice(8, 10))))}`
    : prevEnd;

  const { data: leads = [], isLoading, isFetching } = useQuery({
    queryKey: ["leads_report", start, end],
    queryFn: async () => {
      const page = await base44.entities.Lead.filter({ tanggal: { $gte: start, $lte: end } }, { sort: "tanggal", limit: 1000 });
      return page.items || [];
    },
  });

  // Pembanding bulan sebelumnya — dipakai chip "▲ X% vs [bulan]". Gagal/tidak ada data → chip disembunyikan.
  const { data: prevLeads = [] } = useQuery({
    queryKey: ["leads_report_prev", prevStart, prevCompareEnd],
    queryFn: async () => {
      const page = await base44.entities.Lead.filter({ tanggal: { $gte: prevStart, $lte: prevCompareEnd } }, { sort: "tanggal", limit: 1000 });
      return page.items || [];
    },
    throwOnError: false,
  });

  /* ── agregasi (definisi sama dengan laporan PDF) ── */
  const buildAggregate = (list) => {
    const byDate = {};
    const bySource = {};
    SOURCES.forEach((s) => {
      bySource[s] = { leads: 0, closing: 0, nominal: 0 };
    });
    let total = 0;
    let closing = 0;
    let nominal = 0;
    const leaks = { total: 0, bySource: {} };

    list.forEach((l) => {
      const tanggal = String(l.tanggal || "");
      if (!byDate[tanggal]) {
        byDate[tanggal] = { tanggal, bySource: {}, bySourceClosing: {}, total: 0, closing: 0, nominal: 0 };
      }
      const row = byDate[tanggal];
      const isClosing = l.status === "closing";
      row.total += 1;
      total += 1;
      if (SOURCES.includes(l.sumber)) {
        row.bySource[l.sumber] = (row.bySource[l.sumber] || 0) + 1;
        bySource[l.sumber].leads += 1;
      } else {
        leaks.total += 1;
        const label = l.sumber ? String(l.sumber) : "tanpa sumber";
        leaks.bySource[label] = (leaks.bySource[label] || 0) + 1;
      }
      if (isClosing) {
        const value = Number(l.nominal) || 0;
        row.closing += 1;
        row.nominal += value;
        closing += 1;
        nominal += value;
        if (SOURCES.includes(l.sumber)) {
          bySource[l.sumber].closing += 1;
          bySource[l.sumber].nominal += value;
          row.bySourceClosing[l.sumber] = (row.bySourceClosing[l.sumber] || 0) + 1;
        }
      }
    });

    const days = Object.values(byDate).sort((a, b) => a.tanggal.localeCompare(b.tanggal));
    return { days, bySource, totals: { total, closing, nominal }, leaks };
  };

  const agg = useMemo(() => buildAggregate(leads), [leads]);
  const prevAgg = useMemo(() => buildAggregate(prevLeads), [prevLeads]);

  const { totals, bySource, leaks } = agg;
  const rate = totals.total ? (totals.closing / totals.total) * 100 : 0;
  const avgPerClosing = totals.closing ? totals.nominal / totals.closing : 0;
  const dayCount = Number(end.slice(8, 10));
  /** Rata-rata per hari memakai hari yang SUDAH berjalan, bukan panjang bulan penuh. */
  const elapsedDays = isCurrentMonth ? Math.min(dayOfMonthWib, dayCount) : dayCount;
  const perDay = elapsedDays ? totals.total / elapsedDays : 0;

  /** Baris per sumber, urut konversi tertinggi (tabel & insight memakai urutan ini). */
  const sourceRows = useMemo(
    () =>
      SOURCES.map((s) => {
        const row = bySource[s] || { leads: 0, closing: 0, nominal: 0 };
        return {
          source: s,
          leads: row.leads,
          closing: row.closing,
          nominal: row.nominal,
          conversion: row.leads ? (row.closing / row.leads) * 100 : 0,
          avg: row.closing ? row.nominal / row.closing : 0,
          shareNominal: totals.nominal ? (row.nominal / totals.nominal) * 100 : 0,
        };
      }).sort((a, b) => b.conversion - a.conversion || b.closing - a.closing),
    [bySource, totals.nominal],
  );

  /**
   * Hari-hari bulan terpilih (hari kosong tetap ikut supaya grafik & tabel punya semua tanggal).
   * `leads` adalah alias dari `total` — grafik membaca `d.leads`, sedangkan agregat menyimpan
   * jumlah lead di `total`. Tanpa alias ini nilainya undefined → koordinat SVG jadi NaN.
   */
  const allDays = useMemo(() => {
    const map = new Map(agg.days.map((d) => [d.tanggal, d]));
    return Array.from({ length: dayCount }, (_, i) => {
      const key = `${monthKey}-${pad(i + 1)}`;
      const raw = map.get(key) || { tanggal: key, bySource: {}, bySourceClosing: {}, total: 0, closing: 0, nominal: 0 };
      return {
        ...raw,
        bySource: raw.bySource || {},
        bySourceClosing: raw.bySourceClosing || {},
        total: Number(raw.total) || 0,
        closing: Number(raw.closing) || 0,
        nominal: Number(raw.nominal) || 0,
        leads: Number(raw.total) || 0,
      };
    });
  }, [agg.days, dayCount, monthKey]);

  const chartDays = useMemo(() => {
    if (sourceFilter === "all") return allDays;
    return allDays.map((d) => {
      const leads = d.bySource[sourceFilter] || 0;
      return {
        ...d,
        total: leads,
        leads,
        closing: d.bySourceClosing[sourceFilter] || 0,
      };
    });
  }, [allDays, sourceFilter]);

  const prevTotals = prevAgg.totals;
  const prevRate = prevTotals.total ? (prevTotals.closing / prevTotals.total) * 100 : 0;
  const prevAvg = prevTotals.closing ? prevTotals.nominal / prevTotals.closing : 0;
  /**
   * Chip tren hanya muncul kalau pembandingnya benar-benar ada angkanya. Bulan lalu punya
   * leads tetapi nominalnya Rp0 tidak boleh menghasilkan "+∞%" atau "▼ 100%".
   */
  const deltaOf = (now, before) => {
    if (!before) return null;
    return ((now - before) / before) * 100;
  };

  /**
   * Animasi muncul: kartu berurutan 0,06 s (slot 0–4). Elemen lain (bar, tabel) tidak
   * ikut menunggu slot-slot itu — jeda dipadatkan supaya tidak ada yang telat >1 detik.
   */
  const showCls = useReveal(`${monthKey}-${isLoading}`, 40, 0.025);
  const insightCls = useReveal(`${monthKey}-insight`, 8, 0.12);
  const insights = useMemo(() => buildInsights({ rows: sourceRows, totals, leaks }), [sourceRows, totals, leaks]);

  const cards = [
    {
      label: "Total Leads",
      value: totals.total,
      caption: `± ${perDay.toLocaleString("id-ID", { maximumFractionDigits: 1 })} leads per hari`,
      delta: deltaOf(totals.total, prevTotals.total),
      prevLabel,
    },
    {
      label: "Closing",
      value: totals.closing,
      caption: "transaksi dari leads",
      delta: deltaOf(totals.closing, prevTotals.closing),
      prevLabel,
    },
    {
      label: "Konversi",
      value: rate,
      format: "percent",
      progress: rate,
      caption: `${nfmt(totals.closing)} dari ${nfmt(totals.total)} lead`,
      delta: deltaOf(rate, prevRate),
      prevLabel,
    },
    {
      label: "Nominal Closing",
      value: totals.nominal,
      format: "short",
      caption: rp(totals.nominal),
      delta: deltaOf(totals.nominal, prevTotals.nominal),
      prevLabel,
    },
    {
      label: "Rata-rata / Closing",
      value: avgPerClosing,
      format: "short",
      tone: "dark",
      caption: `dari ${nfmt(totals.closing)} closing`,
      delta: deltaOf(avgPerClosing, prevAvg),
      prevLabel,
    },
  ];

  const stepMonth = (delta) => {
    setSourceFilter("all");
    setMonthKey((k) => shiftMonthKey(k, delta));
  };

  /* ── Export PDF (logic tetap) ── */
  async function handleExportPdf() {
    setExportError("");
    setExporting(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const res = await fetch(`/api/ops/leads/report?bulan=${monthKey}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error || `Gagal membuat laporan (${res.status})`);
      }
      const blob = await res.blob();
      const match = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = match?.[1] || `Laporan-Leads-SAMAQU-${MONTHS[month]}-${year}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err?.message || "Gagal membuat laporan PDF");
    } finally {
      setExporting(false);
    }
  }

  /* ── Salin ringkasan ── */
  async function handleCopySummary() {
    setExportError("");
    const top = [...sourceRows].sort((a, b) => b.leads - a.leads)[0];
    const lines = [
      `Laporan Leads SAMAQU — ${monthKeyLabel(monthKey)}`,
      `Total leads: ${nfmt(totals.total)}`,
      `Total closing: ${nfmt(totals.closing)}`,
      `Konversi: ${pct(rate)}`,
      `Nominal closing: ${rp(totals.nominal)}`,
      top && top.leads > 0
        ? `Sumber terbesar: ${SOURCE_LABEL[top.source]} (${nfmt(top.leads)} leads, ${pct(top.conversion)} konversi)`
        : "Sumber terbesar: belum ada data",
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setExportError("Gagal menyalin. Browser memblokir akses clipboard.");
    }
  }

  return (
    <div className="lp-page" style={{ background: COLORS.pageBg, padding: 24, borderRadius: 22 }}>
      <style>{`
        .lp-page * { box-sizing: border-box; }
        .lp-page .tabular-nums { font-variant-numeric: tabular-nums; }
        .lp-page .lt-row { animation: lp-row 0.3s ease-out both; }
        .lp-page .lt-row:hover { background: ${COLORS.hoverBg}; }
        .lp-page .reveal-in { animation: lp-rise 0.5s cubic-bezier(0.22,1,0.36,1) both; }
        .lp-page .reveal-out { opacity: 0; }
        @keyframes lp-rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes lp-row { from { opacity: 0; } to { opacity: 1; } }
        .lp-btn { border: 1px solid rgba(255,255,255,0.22); background: rgba(255,255,255,0.12); color: #FFFFFF; border-radius: 12px; padding: 10px 14px; font-size: 13px; font-weight: 800; display: inline-flex; align-items: center; gap: 7px; cursor: pointer; transition: background 0.15s ease; }
        .lp-btn:hover { background: rgba(255,255,255,0.2); }
        .lp-btn-solid { background: #FFFFFF; color: #111111; border-color: #FFFFFF; }
        .lp-btn-solid:hover { background: #F2F3F5; }
        .lp-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .lp-nav-btn { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 10px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.1); color: #FFFFFF; cursor: pointer; }
        .lp-nav-btn:hover { background: rgba(255,255,255,0.2); }
        @media (prefers-reduced-motion: reduce) {
          .lp-page .reveal-in, .lp-page .reveal-out, .lp-page .lt-row { animation: none !important; opacity: 1 !important; transform: none !important; }
          .lp-page * { transition-duration: 0s !important; animation-duration: 0s !important; }
        }
        @media (max-width: 640px) {
          .lp-page { padding: 14px !important; }
        }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* HEADER */}
        <header
          style={{
            background: "linear-gradient(100deg, #18181B 0%, #27272A 100%)",
            borderRadius: 22,
            padding: "24px 24px",
            color: "#FFFFFF",
            animation: "lp-rise 0.4s ease-out both",
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
              <div style={{ width: 48, height: 48, borderRadius: 16, background: "rgba(255,255,255,0.16)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                <BarChart3 size={24} />
              </div>
              <div style={{ minWidth: 0 }}>
                <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>Laporan Leads</h1>
                <p style={{ margin: "3px 0 0", fontSize: 13, color: "rgba(255,255,255,0.75)", fontWeight: 500 }}>
                  Dari mana leads datang, mana yang closing, dan apa yang perlu dilakukan.
                </p>
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button type="button" className="lp-nav-btn" onClick={() => stepMonth(-1)} aria-label="Bulan sebelumnya">
                  <ChevronLeft size={17} />
                </button>
                <div style={{ textAlign: "center", minWidth: 130 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>{monthKeyLabel(monthKey)}</p>
                  <p style={{ margin: 0, fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.6)" }}>vs {monthKeyLabel(prevKey)}</p>
                </div>
                <button type="button" className="lp-nav-btn" onClick={() => stepMonth(1)} aria-label="Bulan berikutnya">
                  <ChevronRight size={17} />
                </button>
              </div>

              <button type="button" className="lp-btn" onClick={handleCopySummary} style={{ marginLeft: 6 }}>
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? "Tersalin" : "Salin ringkasan"}
              </button>
              <button type="button" className="lp-btn lp-btn-solid" onClick={handleExportPdf} disabled={exporting}>
                {exporting ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />}
                {exporting ? "Menyiapkan…" : "Export PDF"}
              </button>
            </div>
          </div>

          {exportError ? (
            <p style={{ margin: "14px 0 0", fontSize: 12, fontWeight: 700, color: "#FEE2E2", background: "rgba(239,68,68,0.22)", border: "1px solid rgba(252,165,165,0.4)", borderRadius: 10, padding: "8px 12px" }}>
              {exportError}
            </p>
          ) : null}
          {isFetching && !isLoading ? (
            <p style={{ margin: "10px 0 0", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.55)", display: "flex", alignItems: "center", gap: 6 }}>
              <Loader2 size={12} className="animate-spin" /> Memperbarui data…
            </p>
          ) : null}
        </header>

        {isLoading ? (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ height: 128, borderRadius: 20, background: "#FFFFFF", border: `1px solid ${COLORS.border}` }} />
            <div style={{ height: 300, borderRadius: 20, background: "#FFFFFF", border: `1px solid ${COLORS.border}` }} />
          </div>
        ) : (
          <>
            {/* 5 KARTU ANGKA — mobile: 2 kolom dengan kartu terakhir melebar penuh */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              {cards.map((item, i) => (
                <div key={item.label} className={i === cards.length - 1 ? "col-span-2 md:col-span-1" : ""} style={{ minWidth: 0, display: "flex" }}>
                  <StatCard item={item} index={i} showCls={showCls} />
                </div>
              ))}
            </div>

            {/* INSIGHT + KONTRIBUSI */}
            <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
              <Panel>
                <PanelHead
                  title="Insight bulan ini"
                  subtitle={`${insights.length > 0 ? `Dari ${insights.length} pola yang terdeteksi` : "Belum ada pola yang bisa ditarik"}`}
                  right={
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 800, color: COLORS.muted, background: "#F3F4F6", borderRadius: 999, padding: "5px 10px" }}>
                      <Sparkles size={12} /> Otomatis dari data
                    </span>
                  }
                />
                {insights.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 13, color: COLORS.muted }}>
                    Belum ada data cukup di bulan ini untuk menarik insight. Tambahkan lead beserta sumbernya dulu.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {insights.map((ins, i) => {
                      const tone = INSIGHT_TONE[ins.tone];
                      const Icon = INSIGHT_ICON[ins.tone];
                      return (
                        <div
                          key={`${ins.tone}-${i}`}
                          className={insightCls(i)}
                          style={{ background: tone.bg, border: `1px solid ${tone.border}`, borderRadius: 14, padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: 10 }}
                        >
                          <span style={{ width: 22, height: 22, borderRadius: 999, background: tone.chip, color: "#FFFFFF", display: "grid", placeItems: "center", flexShrink: 0, marginTop: 1 }}>
                            <Icon size={12} strokeWidth={2.6} />
                          </span>
                          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: tone.fg }}>{ins.html}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Panel>

              <Panel delay={0.06}>
                <PanelHead title="Kontribusi per sumber" subtitle="Porsi tiap sumber pada leads, closing, dan nominal." />
                <ContributionBars metrics={{ totals, bySource }} showCls={showCls} />
              </Panel>
            </div>

            {/* TABEL PER SUMBER */}
            <Panel delay={0.1}>
              <PanelHead title="Performa per sumber" subtitle="Diurutkan dari konversi tertinggi." />
              <SourceTable rows={sourceRows} totals={{ ...totals, avg: avgPerClosing }} showCls={showCls} />
            </Panel>

            {/* GRAFIK HARIAN */}
            <Panel delay={0.14}>
              <PanelHead title="Leads & Closing per hari" />
              <DailyChart days={chartDays} filter={sourceFilter} onFilter={setSourceFilter} showCls={showCls} />
            </Panel>

            {/* REKAP HARIAN */}
            <Panel delay={0.18}>
              <PanelHead title="Rekap harian" subtitle={`${monthKeyLabel(monthKey)} · ${dayCount} hari`} />
              <DailyTable days={allDays} totals={{ ...totals, bySource }} />
            </Panel>

            <p style={{ margin: 0, fontSize: 11, color: COLORS.faint, fontWeight: 600 }}>
              Konversi = closing ÷ leads · Nominal hanya dari lead berstatus closing · Sumber data: menu Leads dashboard internal.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
