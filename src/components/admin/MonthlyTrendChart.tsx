"use client";

/**
 * Grafik garis "naik-turun" pendapatan bulanan dashboard admin.
 *
 * Digambar dengan SVG inline (tanpa dependency chart baru) — pola yang sama dengan grafik
 * tren dashboard ops. Setiap titik datang dari data asli pesanan per bulan (dihitung
 * `DashboardView` dari `orders` yang dikirim halaman admin), tidak ada angka contoh.
 *
 * Detail yang disengaja:
 *  - kurva halus (Catmull-Rom → bezier) yang tetap melewati tiap titik data, jadi bulan yang
 *    omzetnya 0 benar-benar turun ke garis dasar;
 *  - area gradasi tipis di bawah garis + titik penanda tiap bulan;
 *  - titik tertinggi selalu berlabel, dan titik yang disorot mouse menampilkan nilainya.
 */

import { useState } from "react";

export interface MonthlyTrendPoint {
  /** Label bulan singkat, mis. "Okt". */
  label: string;
  /** Omzet produk bulan itu (Rp) — harga produk saja, tanpa ongkir. */
  revenue: number;
  /** Jumlah pesanan masuk bulan itu (tanpa pesanan dibatalkan). */
  orders: number;
}

const rp = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");

/** Label sumbu Y ringkas: 1.200.000 → "1,2jt"; 800.000 → "800rb"; 0 → "0". */
function axisMoney(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })}jt`;
  if (v >= 1000) return `${Math.round(v / 1000).toLocaleString("id-ID")}rb`;
  return "0";
}

/** Batas atas "bulat enak dibaca" supaya tiap tick sumbu Y rapi (mis. 800rb = 4 × 200rb). */
function niceTop(rawMax: number, ticks = 4): number {
  if (!(rawMax > 0)) return ticks;
  const step = rawMax / ticks;
  const pow = Math.pow(10, Math.floor(Math.log10(step)));
  const f = step / pow;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * pow * ticks;
}

/** Kurva halus yang melewati tiap titik; kontrolnya dijepit ke area grafik agar tidak melewati sumbu. */
function smoothPath(points: { x: number; y: number }[], top: number, bottom: number): string {
  if (points.length === 0) return "";
  const clamp = (y: number) => Math.max(top, Math.min(bottom, y));
  if (points.length < 3) return points.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ");
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = clamp(p1.y + (p2.y - p0.y) / 6);
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = clamp(p2.y - (p3.y - p1.y) / 6);
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

export default function MonthlyTrendChart({ data }: { data: MonthlyTrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <p className="text-xs font-bold py-16 text-center" style={{ color: "var(--fg3)" }}>
        Belum ada data penjualan
      </p>
    );
  }

  const VB_W = 720;
  const VB_H = 260;
  const padL = 54; // ruang label sumbu Y
  const padR = 16;
  const padT = 18;
  const padB = 32; // ruang label sumbu X
  const plotW = VB_W - padL - padR;
  const plotH = VB_H - padT - padB;
  const baseY = padT + plotH;

  const max = data.reduce((m, d) => Math.max(m, Number(d.revenue) || 0), 0);
  const top = niceTop(max);
  const n = data.length;
  const slot = n > 1 ? plotW / (n - 1) : 0;
  const points = data.map((d, i) => ({
    x: n > 1 ? padL + i * slot : padL + plotW / 2,
    y: baseY - ((Number(d.revenue) || 0) / top) * plotH,
  }));
  const line = smoothPath(points, padT, baseY);
  const area = `${line} L ${points[n - 1].x} ${baseY} L ${points[0].x} ${baseY} Z`;
  const peakIdx = data.reduce(
    (best, d, i) => ((Number(d.revenue) || 0) > (Number(data[best].revenue) || 0) ? i : best),
    0
  );
  const focusIdx = hover ?? peakIdx;
  const focus = points[focusIdx];

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="xMidYMid meet"
      className="w-full h-56 lg:h-64 mt-4 overflow-visible"
      role="img"
      aria-label="Tren pendapatan bulanan (harga produk, tanpa ongkir)"
    >
      <defs>
        <linearGradient id="monthly-trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1c1c1c" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#1c1c1c" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Grid horizontal rata + label sumbu Y (5 tick) */}
      {[0, 1, 2, 3, 4].map((i) => {
        const value = (top / 4) * i;
        const y = baseY - (value / top) * plotH;
        return (
          <g key={`grid-${i}`}>
            <line x1={padL} y1={y} x2={VB_W - padR} y2={y} stroke="var(--bd)" strokeWidth="1" />
            <text x={padL - 10} y={y} textAnchor="end" dominantBaseline="middle" fontSize="11" fontWeight="600" fill="var(--fg3)">
              {axisMoney(value)}
            </text>
          </g>
        );
      })}

      {/* Area + garis tren */}
      <path d={area} fill="url(#monthly-trend-fill)" />
      <path d={line} fill="none" stroke="var(--fg)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />

      {/* Garis penunjuk titik yang disorot */}
      {hover !== null ? (
        <line x1={focus.x} y1={padT} x2={focus.x} y2={baseY} stroke="var(--fg3)" strokeWidth="1" strokeDasharray="3 3" />
      ) : null}

      {/* Titik tiap bulan + label bulan */}
      {data.map((d, i) => {
        const p = points[i];
        const isFocus = i === focusIdx;
        return (
          <g key={`${d.label}-${i}`}>
            {isFocus ? <circle cx={p.x} cy={p.y} r="9" fill="var(--fg)" opacity="0.08" /> : null}
            <circle cx={p.x} cy={p.y} r={isFocus ? 5 : 3.5} fill="var(--card)" stroke="var(--fg)" strokeWidth="2" />
            <text
              x={p.x}
              y={baseY + 20}
              textAnchor="middle"
              fontSize="11"
              fontWeight="600"
              fill={i === focusIdx ? "var(--fg2)" : "var(--fg3)"}
            >
              {d.label}
            </text>
            {/* Kolom tak terlihat: area hover per bulan */}
            <rect
              x={p.x - Math.max(slot, 24) / 2}
              y={padT}
              width={Math.max(slot, 24)}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <title>{`${d.label}: ${rp(d.revenue)} · ${d.orders} pesanan`}</title>
            </rect>
          </g>
        );
      })}

      {/* Nilai titik yang disorot (titik tertinggi kalau tidak ada mouse) */}
      <text
        x={Math.max(padL + 40, Math.min(VB_W - padR - 40, focus.x))}
        y={Math.max(padT + 10, focus.y - 12)}
        textAnchor="middle"
        fontSize="12"
        fontWeight="800"
        fill="var(--fg)"
      >
        {rp(data[focusIdx].revenue)}
      </text>
    </svg>
  );
}
