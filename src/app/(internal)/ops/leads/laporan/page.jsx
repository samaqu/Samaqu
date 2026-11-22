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
 * Urutan tampilan: header → 5 kartu angka → rekap harian (hari ini paling atas) → Agent vs Admin
 * (per PIC) → insight + kontribusi sumber → tabel per sumber → grafik harian.
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
  Bot,
  Users,
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
        /* Ukuran angka mengikuti LEBAR KARTU (bukan viewport), jadi "Rp332,2 rb" di kartu
           kelima tidak pernah terpotong berapa pun lebar sidebar/layar. */
        containerType: "inline-size",
      }}
    >
      <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: dark ? "rgba(255,255,255,0.65)" : COLORS.muted }}>
        {item.label}
      </p>
      <p
        className="tabular-nums"
        style={{
          /* cqw = persen lebar kartu itu sendiri (kartu ini container query). Koefisien 17%
             dipilih setelah dihitung dengan teks terpanjang ("Rp332,2 rb"): muat sampai
             lebar kartu ~150px, lalu tetap dibatasi 34px di kartu lebar. */
          fontSize: "clamp(17px, 17cqw, 34px)",
          fontWeight: 800,
          lineHeight: 1.05,
          letterSpacing: "-0.02em",
          color: dark ? "#FFFFFF" : COLORS.ink,
          whiteSpace: "nowrap",
          overflow: "visible",
          maxWidth: "100%",
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

/**
 * `todayKey`: batas tanggal terakhir yang ditampilkan ("2026-11-22"). Hari yang belum terjadi disembunyikan
 * supaya baris paling atas selalu hari ini (bukan tanggal akhir bulan yang semuanya 0).
 * null = bulan yang sudah lewat (tampil semua), "" = bulan depan (belum ada hari yang berjalan).
 */
function DailyTable({ days = [], totals, todayKey = null }) {
  const [expanded, setExpanded] = useState(false);
  const newestFirst = useMemo(
    () =>
      [...(days || [])]
        .filter((d) => todayKey === null || (todayKey !== "" && String(d?.tanggal || "") <= todayKey))
        .reverse()
        .map((d) => ({ ...d, bySource: d?.bySource || {} })),
    [days, todayKey],
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
            {visible.length === 0 ? (
              <tr>
                <td colSpan={SOURCES.length + 4} style={{ ...td, textAlign: "center", color: COLORS.muted }}>
                  Belum ada hari yang berjalan di bulan ini.
                </td>
              </tr>
            ) : null}
            {visible.map((d) => (
              <tr key={d.tanggal} className="lt-row" style={d.tanggal === todayKey ? { background: "#FFF7ED" } : undefined}>
                <td style={{ ...td, fontWeight: 700, color: COLORS.ink }}>
                  {formatTanggalPendek(d.tanggal)}
                  {d.tanggal === todayKey ? (
                    <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "#C2410C", background: "#FFEDD5", borderRadius: 999, padding: "2px 8px" }}>
                      Hari ini
                    </span>
                  ) : null}
                </td>
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
      {newestFirst.length > 7 ? (
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
          {expanded ? "Ringkas 7 hari" : `Lihat semua ${newestFirst.length} hari`}
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

/* ───────────────────────── agent vs admin (per PIC) ───────────────────────── */

const PIC_NONE_LABEL = "Belum tercatat";
const AGENT_COLOR = "#0EA5E9";
const ADMIN_COLOR = "#F97316";
const NONE_COLOR = "#CBD5E1";
/** Warna tiap admin (urut kemunculan). Admin baru otomatis kebagian warna berikutnya. */
const PIC_PALETTE = ["#F97316", "#14B8A6", "#E11D48", "#8B5CF6", "#EAB308", "#22C55E", "#EC4899", "#6366F1"];

/**
 * Kelompok dari kolom `leads.pic`: "Agent" = AI agent, kosong = belum tercatat (data lama), selain itu = admin.
 * Nama admin apa pun otomatis masuk "Admin", jadi admin baru tidak perlu mengubah kode.
 */
const picKind = (pic) => {
  const name = String(pic || "").trim();
  if (!name) return "none";
  return name.toLowerCase() === "agent" ? "agent" : "admin";
};

/**
 * Nama orang yang menyelesaikan closing Agent secara manual (tanpa catatan closing bot). Sistem tidak merekam siapa
 * yang membantu; labelnya disimpulkan dari "PIC Agent, closing, tapi bukan closing bot". Ganti di sini kalau admin
 * lain mulai ikut ambil alih (mis. jadi "admin").
 */
const HELPER_NAME = "Surya";

/** Kunci pencocokan nomor ke catatan closing bot: 9 digit terakhir (08xx, 628xx, dan 8xx dianggap sama). */
const contactKey = (value) => {
  const d = String(value || "").replace(/\D/g, "");
  return d.length >= 8 ? d.slice(-9) : "";
};

/**
 * @param botKeys Set kunci nomor yang punya catatan closing bot bulan itu (dari /api/ops/leads/closing-bot),
 *   atau null kalau datanya tidak tersedia (pemisahan Agent disembunyikan, tampilan seperti biasa).
 */
function buildPicAggregate(list, botKeys = null) {
  const empty = () => ({ leads: 0, closing: 0, nominal: 0 });
  const groups = { agent: empty(), admin: empty(), none: empty() };
  const agentSplit = { botClosing: 0, botNominal: 0, helped: 0, helpedNominal: 0 };
  const people = new Map();
  /** Sumber × kelompok PIC, untuk perbandingan yang adil (sumber yang sama dibandingkan dengan sumber yang sama). */
  const bySourceKind = {};
  SOURCES.forEach((s) => {
    bySourceKind[s] = { agent: empty(), admin: empty(), none: empty() };
  });
  (list || []).forEach((l) => {
    const raw = String(l.pic || "").trim();
    const kind = picKind(raw);
    const key = raw.toLowerCase() || "__none__";
    if (!people.has(key)) people.set(key, { key, name: raw || PIC_NONE_LABEL, kind, ...empty() });
    const isClosing = l.status === "closing";
    const value = isClosing ? Number(l.nominal) || 0 : 0;
    // Closing PIC Agent dipisah: ada catatan closing bot untuk nomor itu = oleh bot, tidak ada = diselesaikan manual.
    if (isClosing && kind === "agent" && botKeys) {
      if (botKeys.has(contactKey(l.kontak))) {
        agentSplit.botClosing += 1;
        agentSplit.botNominal += value;
      } else {
        agentSplit.helped += 1;
        agentSplit.helpedNominal += value;
      }
    }
    if (SOURCES.includes(l.sumber)) {
      const cell = bySourceKind[l.sumber][kind];
      cell.leads += 1;
      if (isClosing) {
        cell.closing += 1;
        cell.nominal += value;
      }
    }
    [groups[kind], people.get(key)].forEach((g) => {
      g.leads += 1;
      if (isClosing) {
        g.closing += 1;
        g.nominal += value;
      }
    });
  });
  const kindOrder = { agent: 0, admin: 1, none: 2 };
  const sorted = [...people.values()].sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || b.nominal - a.nominal || b.leads - a.leads);
  let adminIndex = 0;
  sorted.forEach((p) => {
    p.color = p.kind === "agent" ? AGENT_COLOR : p.kind === "none" ? NONE_COLOR : PIC_PALETTE[adminIndex++ % PIC_PALETTE.length];
  });
  return { groups, people: sorted, bySourceKind, agentSplit: botKeys ? agentSplit : null };
}

const convOf = (g) => (g.leads ? (g.closing / g.leads) * 100 : 0);
const avgOf = (g) => (g.closing ? g.nominal / g.closing : 0);

function PicAvatar({ name, color, kind }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: 38, height: 38, borderRadius: 999, background: color, color: "#FFFFFF", display: "grid", placeItems: "center", fontSize: 15, fontWeight: 800, flexShrink: 0 }}
    >
      {kind === "agent" ? <Bot size={19} /> : String(name || "?").trim().charAt(0).toUpperCase()}
    </span>
  );
}

function MiniStat({ label, value }) {
  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ margin: 0, fontSize: 10.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: COLORS.muted }}>{label}</p>
      <p className="tabular-nums" style={{ margin: "2px 0 0", fontSize: 18, fontWeight: 800, color: COLORS.ink, letterSpacing: "-0.01em" }}>{value}</p>
    </div>
  );
}

function ConvBar({ value, color }) {
  return (
    <div style={{ height: 6, borderRadius: 999, background: "#F1F2F4", overflow: "hidden" }} aria-hidden="true">
      <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, value))}%`, borderRadius: 999, background: color }} />
    </div>
  );
}

/** Satu baris pemisahan closing Agent: titik warna, label, jumlah, nominal. */
function SplitLine({ color, label, count, nominal, hint }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 999, background: color, flexShrink: 0 }} />
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: COLORS.ink }}>{label}</span>
          {hint ? <span style={{ display: "block", fontSize: 11, color: COLORS.muted }}>{hint}</span> : null}
        </span>
      </span>
      <span className="tabular-nums" style={{ fontSize: 13, fontWeight: 800, color: COLORS.ink, whiteSpace: "nowrap" }}>
        {nfmt(count)} closing · {rpShort(nominal)}
      </span>
    </div>
  );
}

function GroupCard({ title, subtitle, color, icon, data, best, extra = null }) {
  const conv = convOf(data);
  return (
    <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 18, minWidth: 0, background: "#FFFFFF", position: "relative", overflow: "hidden" }}>
      <span aria-hidden="true" style={{ position: "absolute", inset: "0 0 auto 0", height: 4, background: color }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{ width: 38, height: 38, borderRadius: 12, background: color, color: "#FFFFFF", display: "grid", placeItems: "center", flexShrink: 0 }}>{icon}</span>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: COLORS.ink }}>{title}</p>
            <p style={{ margin: 0, fontSize: 12, color: COLORS.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subtitle}</p>
          </div>
        </div>
        {best ? (
          <span style={{ fontSize: 10.5, fontWeight: 800, color: "#15803D", background: "#DCFCE7", borderRadius: 999, padding: "4px 10px", whiteSpace: "nowrap" }}>Konversi tertinggi</span>
        ) : null}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
        <MiniStat label="Leads" value={nfmt(data.leads)} />
        <MiniStat label="Closing" value={nfmt(data.closing)} />
        <MiniStat label="Nominal" value={rpShort(data.nominal)} />
        <MiniStat label="Rata-rata / closing" value={data.closing ? rpShort(avgOf(data)) : "-"} />
      </div>
      <div style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Konversi</span>
          <span className="tabular-nums" style={{ fontSize: 15, fontWeight: 800, color: COLORS.ink }}>{pct(conv)}</span>
        </div>
        <ConvBar value={conv} color={color} />
      </div>
      {extra}
    </div>
  );
}

/** Satu batang bertumpuk: porsi Agent / Admin / Belum tercatat dari satu ukuran. */
function ShareBar({ label, parts }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <div>
      <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 800, color: COLORS.ink }}>{label}</p>
      <div style={{ display: "flex", height: 26, borderRadius: 10, overflow: "hidden", background: "#F1F2F4", gap: 2 }} role="img" aria-label={label}>
        {total > 0
          ? parts
              .filter((p) => p.value > 0)
              .map((p) => {
                const share = (p.value / total) * 100;
                return (
                  <div
                    key={p.name}
                    title={`${p.name}: ${p.format(p.value)} (${pct(share)})`}
                    style={{ width: `${share}%`, background: p.color, color: "#FFFFFF", fontSize: 11, fontWeight: 800, display: "grid", placeItems: "center", minWidth: 0, overflow: "hidden", whiteSpace: "nowrap" }}
                  >
                    {share >= 12 ? pct(share) : ""}
                  </div>
                );
              })
          : null}
      </div>
    </div>
  );
}

/** Perbandingan dianggap belum meyakinkan kalau salah satu pihak punya lead kurang dari ini. */
const MIN_SAMPLE = 10;

function verdictOf(a, b) {
  if (!a.leads || !b.leads) return { label: "-", bg: "#F3F4F6", fg: COLORS.muted, small: false };
  const ca = convOf(a);
  const cb = convOf(b);
  const small = a.leads < MIN_SAMPLE || b.leads < MIN_SAMPLE;
  if (Math.abs(ca - cb) < 1) return { label: "Seimbang", bg: "#F3F4F6", fg: COLORS.muted, small };
  return ca > cb
    ? { label: "Agent", bg: "#E0F2FE", fg: "#0369A1", small, agentWins: true }
    : { label: "Admin", bg: "#FFEDD5", fg: "#C2410C", small, agentWins: false };
}

function PicTabs({ value, onChange, items }) {
  return (
    <div role="tablist" style={{ display: "inline-flex", gap: 4, padding: 4, background: "#F3F4F6", borderRadius: 12, alignSelf: "flex-start", maxWidth: "100%", overflowX: "auto" }}>
      {items.map((it) => {
        const on = it.id === value;
        return (
          <button
            key={it.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(it.id)}
            style={{
              border: 0,
              cursor: "pointer",
              borderRadius: 9,
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 800,
              whiteSpace: "nowrap",
              background: on ? "#FFFFFF" : "transparent",
              color: on ? COLORS.ink : COLORS.muted,
              boxShadow: on ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
            }}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

/** Tabel sumber × PIC: tiap sumber membandingkan Agent dengan Admin pada sumber yang sama. */
function SourceCompare({ bySourceKind, noneLeads }) {
  const th = { fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: COLORS.muted, padding: "8px 10px", whiteSpace: "nowrap", textAlign: "right" };
  const td = { fontSize: 14, padding: "12px 10px", borderTop: `1px solid ${COLORS.rowLine}`, whiteSpace: "nowrap", textAlign: "right" };
  const rows = SOURCES.map((s) => ({ source: s, agent: bySourceKind[s].agent, admin: bySourceKind[s].admin }));
  const sum = (key) => rows.reduce((acc, r) => ({ leads: acc.leads + r[key].leads, closing: acc.closing + r[key].closing, nominal: acc.nominal + r[key].nominal }), { leads: 0, closing: 0, nominal: 0 });
  const total = { source: null, agent: sum("agent"), admin: sum("admin") };

  const renderRow = (r) => {
    const v = verdictOf(r.agent, r.admin);
    const ca = convOf(r.agent);
    const cb = convOf(r.admin);
    const both = r.agent.leads > 0 && r.admin.leads > 0;
    const strong = { fontWeight: 800, color: COLORS.ink };
    return (
      <tr key={r.source || "total"} style={r.source ? undefined : { background: COLORS.totalBg }}>
        <td style={{ ...td, textAlign: "left", fontWeight: 800, color: COLORS.ink, borderTop: r.source ? td.borderTop : `2px solid ${COLORS.border}` }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            {r.source ? <SourceDot source={r.source} size={9} /> : null}
            {r.source ? SOURCE_LABEL[r.source] : "Semua sumber"}
          </span>
        </td>
        <td style={{ ...td, color: COLORS.muted, borderLeft: `1px solid ${COLORS.rowLine}` }}>{nfmt(r.agent.leads)}</td>
        <td style={{ ...td, color: COLORS.muted }}>{nfmt(r.agent.closing)}</td>
        <td style={{ ...td, ...(both && ca > cb ? strong : { color: COLORS.muted }) }}>{r.agent.leads ? pct(ca) : "-"}</td>
        <td style={{ ...td, color: COLORS.muted, borderLeft: `1px solid ${COLORS.rowLine}` }}>{nfmt(r.admin.leads)}</td>
        <td style={{ ...td, color: COLORS.muted }}>{nfmt(r.admin.closing)}</td>
        <td style={{ ...td, ...(both && cb > ca ? strong : { color: COLORS.muted }) }}>{r.admin.leads ? pct(cb) : "-"}</td>
        <td style={{ ...td, borderLeft: `1px solid ${COLORS.rowLine}` }}>
          <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
            <span style={{ fontSize: 12, fontWeight: 800, background: v.bg, color: v.fg, borderRadius: 999, padding: "3px 12px" }}>{v.label}</span>
            {v.small && v.label !== "-" ? <span style={{ fontSize: 10.5, fontWeight: 600, color: COLORS.faint }}>contoh masih kecil</span> : null}
          </span>
        </td>
      </tr>
    );
  };

  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <table className="tabular-nums" style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
          <thead>
            <tr>
              <th scope="col" style={{ ...th, textAlign: "left" }} rowSpan={2}>Sumber</th>
              <th scope="colgroup" colSpan={3} style={{ ...th, textAlign: "center", color: "#0369A1", background: "#F0F9FF", borderRadius: "10px 10px 0 0" }}>
                Agent
              </th>
              <th scope="colgroup" colSpan={3} style={{ ...th, textAlign: "center", color: "#C2410C", background: "#FFF7ED", borderRadius: "10px 10px 0 0" }}>
                Admin
              </th>
              <th scope="col" style={th} rowSpan={2}>Unggul</th>
            </tr>
            <tr>
              <th scope="col" style={{ ...th, background: "#F0F9FF" }}>Lead</th>
              <th scope="col" style={{ ...th, background: "#F0F9FF" }}>Closing</th>
              <th scope="col" style={{ ...th, background: "#F0F9FF" }}>Konversi</th>
              <th scope="col" style={{ ...th, background: "#FFF7ED" }}>Lead</th>
              <th scope="col" style={{ ...th, background: "#FFF7ED" }}>Closing</th>
              <th scope="col" style={{ ...th, background: "#FFF7ED" }}>Konversi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(renderRow)}
            {renderRow(total)}
          </tbody>
        </table>
      </div>
      <p style={{ margin: "12px 0 0", fontSize: 12, color: COLORS.muted, lineHeight: 1.5 }}>
        Tiap baris membandingkan Agent dan Admin pada sumber yang sama, jadi campuran sumber tidak mempengaruhi hasil. &quot;Contoh masih kecil&quot; muncul kalau salah satu pihak punya kurang dari {MIN_SAMPLE} lead.
        {noneLeads > 0 ? ` ${nfmt(noneLeads)} lead tanpa PIC tidak ikut dibandingkan.` : ""}
      </p>
    </div>
  );
}

function PicSection({ agg, botInfo = null }) {
  const [tab, setTab] = useState("ringkasan");
  const { groups, people, bySourceKind, agentSplit } = agg;
  /** Pemisahan closing Agent: oleh bot sendiri (ada catatan closing bot) lawan diselesaikan manual. */
  const agentExtra = agentSplit ? (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px dashed ${COLORS.border}`, display: "grid", gap: 10 }}>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: COLORS.muted }}>
        Closing Agent: siapa yang menyelesaikan
      </p>
      <SplitLine color={AGENT_COLOR} label="Oleh bot sendiri" count={agentSplit.botClosing} nominal={agentSplit.botNominal} />
      <SplitLine
        color="#94A3B8"
        label={`Dibantu ${HELPER_NAME}`}
        hint="bukan closing bot, diselesaikan manual"
        count={agentSplit.helped}
        nominal={agentSplit.helpedNominal}
      />
      <p style={{ margin: 0, fontSize: 12, color: COLORS.muted }}>
        Konversi bot saja: <b style={{ color: COLORS.ink }}>{pct(groups.agent.leads ? (agentSplit.botClosing / groups.agent.leads) * 100 : 0)}</b>
      </p>
    </div>
  ) : null;
  const adminNames = people.filter((p) => p.kind === "admin").map((p) => p.name);
  const agentConv = convOf(groups.agent);
  const adminConv = convOf(groups.admin);
  const bothHave = groups.agent.leads > 0 && groups.admin.leads > 0;
  const parts = (key, format) => [
    { name: "Agent", value: groups.agent[key], color: AGENT_COLOR, format },
    { name: "Admin", value: groups.admin[key], color: ADMIN_COLOR, format },
    { name: PIC_NONE_LABEL, value: groups.none[key], color: NONE_COLOR, format },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <PicTabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "ringkasan", label: "Ringkasan" },
          { id: "sumber", label: "Per sumber" },
          { id: "pic", label: "Per PIC" },
        ]}
      />

      {tab === "ringkasan" ? (
        <>
      <div className="grid gap-4 md:grid-cols-2">
        <GroupCard
          title="Agent"
          subtitle="AI agent WhatsApp"
          color={AGENT_COLOR}
          icon={<Bot size={20} />}
          data={groups.agent}
          best={bothHave && agentConv > adminConv}
          extra={agentExtra}
        />
        <GroupCard
          title="Admin"
          subtitle={adminNames.length ? adminNames.join(", ") : "Belum ada lead dengan PIC admin"}
          color={ADMIN_COLOR}
          icon={<Users size={20} />}
          data={groups.admin}
          best={bothHave && adminConv > agentConv}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <ShareBar label="Porsi leads" parts={parts("leads", nfmt)} />
        <ShareBar label="Porsi closing" parts={parts("closing", nfmt)} />
        <ShareBar label="Porsi nominal" parts={parts("nominal", rpShort)} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
        {[
          ["Agent", AGENT_COLOR],
          ["Admin", ADMIN_COLOR],
          [PIC_NONE_LABEL, NONE_COLOR],
        ].map(([name, color]) => (
          <span key={name} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: COLORS.muted }}>
            <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 999, background: color, display: "inline-block" }} />
            {name}
          </span>
        ))}
      </div>
      {agentSplit && botInfo ? (
        <p style={{ margin: 0, fontSize: 12, color: COLORS.muted, lineHeight: 1.5 }}>
          AI Performance mencatat {nfmt(botInfo.count)} closing bot bulan ini ({rpShort(botInfo.nominal)}). {nfmt(agentSplit.botClosing)} di antaranya
          cocok dengan lead PIC Agent yang closing; sisanya ada di lead PIC lain, lead yang belum berstatus closing, atau lead di luar bulan ini.
        </p>
      ) : null}

        </>
      ) : null}

      {tab === "sumber" ? <SourceCompare bySourceKind={bySourceKind} noneLeads={groups.none.leads} /> : null}

      {tab === "pic" ? (
      <div>
        <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 800, color: COLORS.ink }}>Rincian per PIC</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {people.map((p) => {
            const conv = convOf(p);
            return (
              <div
                key={p.key}
                style={{ display: "grid", gridTemplateColumns: "minmax(150px, 1.3fr) repeat(3, minmax(70px, 0.7fr)) minmax(120px, 1.2fr)", alignItems: "center", gap: 12, border: `1px solid ${COLORS.rowLine}`, borderRadius: 14, padding: "10px 14px", background: "#FFFFFF" }}
                className="lp-pic-row"
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <PicAvatar name={p.name} color={p.color} kind={p.kind} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: COLORS.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</p>
                    <p style={{ margin: 0, fontSize: 11, color: COLORS.muted }}>
                      {p.kind === "agent"
                        ? `AI agent${agentSplit ? ` · ${agentSplit.botClosing} closing bot, ${agentSplit.helped} dibantu ${HELPER_NAME}` : ""}`
                        : p.kind === "none"
                          ? "Data lama tanpa PIC"
                          : "Admin"}
                    </p>
                  </div>
                </div>
                <MiniStat label="Leads" value={nfmt(p.leads)} />
                <MiniStat label="Closing" value={nfmt(p.closing)} />
                <MiniStat label="Nominal" value={rpShort(p.nominal)} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Konversi</span>
                    <span className="tabular-nums" style={{ fontSize: 13, fontWeight: 800, color: COLORS.ink }}>{pct(conv)}</span>
                  </div>
                  <ConvBar value={conv} color={p.color} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      ) : null}
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
  /**
   * Closing yang dicatat bot sendiri bulan ini (Academy `wa_closings`, sumber yang sama dengan AI Performance).
   * Tambahan saja: kalau gagal/tidak tersedia, pemisahan closing Agent disembunyikan dan halaman tampil seperti biasa.
   */
  const { data: botClosing } = useQuery({
    queryKey: ["leads_closing_bot", monthKey],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const res = await fetch(`/api/ops/leads/closing-bot?bulan=${monthKey}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`closing bot ${res.status}`);
      return res.json();
    },
    retry: false,
    throwOnError: false,
  });
  const botKeys = useMemo(
    () => (botClosing?.available && Array.isArray(botClosing.keys) ? new Set(botClosing.keys) : null),
    [botClosing],
  );
  const botInfo = botClosing?.available ? { count: Number(botClosing.count) || 0, nominal: Number(botClosing.nominal) || 0 } : null;

  /** Perbandingan Agent vs Admin dari kolom `pic` lead bulan terpilih. */
  const picAgg = useMemo(() => buildPicAggregate(leads, botKeys), [leads, botKeys]);

  /** Batas hari yang ditampilkan di Rekap harian: bulan berjalan sampai hari ini (WIB), bulan lewat semua, bulan depan kosong. */
  const todayIso = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const dailyLimit = isCurrentMonth ? todayIso : monthKey > currentMonthKey() ? "" : null;

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
        @media (max-width: 760px) {
          .lp-page .lp-pic-row { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
          .lp-page .lp-pic-row > :first-child, .lp-page .lp-pic-row > :last-child { grid-column: 1 / -1; }
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

            {/* REKAP HARIAN — di atas supaya hari ini langsung terlihat */}
            <Panel delay={0.06}>
              <PanelHead
                title="Rekap harian"
                subtitle={`${monthKeyLabel(monthKey)} · ${isCurrentMonth ? "hari ini paling atas" : "tanggal terbaru paling atas"}`}
              />
              <DailyTable days={allDays} totals={{ ...totals, bySource }} todayKey={dailyLimit} />
            </Panel>

            {/* AGENT VS ADMIN (per PIC) */}
            <Panel delay={0.1}>
              <PanelHead
                title="Agent vs Admin"
                subtitle="Perbandingan berdasarkan PIC lead. Admin baru otomatis muncul di sini."
              />
              {picAgg.people.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: COLORS.muted }}>Belum ada lead di bulan ini.</p>
              ) : (
                <PicSection agg={picAgg} botInfo={botInfo} />
              )}
            </Panel>

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

            <p style={{ margin: 0, fontSize: 11, color: COLORS.faint, fontWeight: 600 }}>
              Konversi = closing ÷ leads · Nominal hanya dari lead berstatus closing · Sumber data: menu Leads dashboard internal.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
