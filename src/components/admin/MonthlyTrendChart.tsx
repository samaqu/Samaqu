"use client";

/**
 * Grafik BATANG "naik-turun" pendapatan bulanan dashboard admin.
 *
 * Digambar dengan HTML/CSS (tanpa dependency chart) — batang per bulan + grid horizontal, mengikuti
 * contoh yang dikirim pemilik 2026-10-24 (kartu metrik: tren persen di bawah nilai, grafik batang
 * dengan satu batang tersorot + tooltip melayang). Setiap batang datang dari data asli pesanan per
 * bulan (dihitung `DashboardView`), tidak ada angka contoh.
 *
 * Detail yang disengaja:
 *  - batang bulan PERIODE TERPILIH (bulan terakhir jendela 6 bulan) selalu hijau tua — "bulan aktif";
 *    bulan lain hijau muda, dan batang yang disorot mouse jadi lebih tua;
 *  - tooltip melayang (kartu putih: titik + label + nominal + jumlah pesanan). Tanpa mouse, tooltip
 *    menempel di batang bulan terpilih, jadi nominal bulan itu tetap terbaca;
 *  - sumbu Y ringkas (`20jt`/`800rb`) dengan 4 langkah, label bulan di bawah tiap batang.
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

/* Warna batang: bulan terpilih hijau tua, bulan lain hijau muda, yang disorot lebih tua. */
const BAR_ACTIVE = "#00a36c";
const BAR_HOVER = "#7fd3b1";
const BAR_REST = "#cdeee0";

export default function MonthlyTrendChart({ data }: { data: MonthlyTrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <p className="text-xs font-bold py-16 text-center" style={{ color: "var(--fg3)" }}>
        Belum ada data penjualan
      </p>
    );
  }

  const n = data.length;
  const max = data.reduce((m, d) => Math.max(m, Number(d.revenue) || 0), 0);
  const top = niceTop(max);
  const heightOf = (i: number) => (top > 0 ? ((Number(data[i].revenue) || 0) / top) * 100 : 0);
  /* Batang "bulan aktif" = bulan terakhir jendela, yaitu bulan PERIODE TERPILIH. */
  const activeIdx = n - 1;
  const focusIdx = hover ?? activeIdx;
  const focus = data[focusIdx];

  return (
    <div
      className="mt-5"
      role="img"
      aria-label={`Tren pendapatan bulanan ${data[0].label}–${data[activeIdx].label} (harga produk, tanpa ongkir)`}
    >
      <div className="flex gap-2">
        {/* ── sumbu Y: 4 langkah dari Rp 0 sampai batas atas ── */}
        <div className="relative w-11 shrink-0 h-56 lg:h-64">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={`y-${i}`}
              className="absolute right-0 -translate-y-1/2 text-[11px] font-semibold tabular-nums"
              style={{ top: `${(1 - i / 4) * 100}%`, color: "var(--fg3)" }}
            >
              {axisMoney((top / 4) * i)}
            </span>
          ))}
        </div>

        {/* ── area plot: grid + batang + tooltip melayang ── */}
        <div className="relative flex-1 h-56 lg:h-64">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={`grid-${i}`}
              className="absolute inset-x-0 border-t"
              style={{ top: `${(1 - i / 4) * 100}%`, borderColor: "var(--bd)" }}
            />
          ))}

          <div className="absolute inset-0 flex items-end gap-1.5 sm:gap-2">
            {data.map((d, i) => {
              const isActive = i === activeIdx;
              const color = isActive ? BAR_ACTIVE : hover === i ? BAR_HOVER : BAR_REST;
              return (
                <div
                  key={`${d.label}-${i}`}
                  className="flex-1 h-full flex items-end justify-center"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                >
                  <span
                    className="w-full max-w-[34px] rounded-t-md transition-colors duration-200"
                    style={{ height: `${heightOf(i)}%`, minHeight: d.revenue > 0 ? 6 : 0, background: color }}
                  />
                </div>
              );
            })}
          </div>

          {/* Nilai bulan yang disorot — tanpa mouse: bulan periode terpilih */}
          <div
            className="absolute z-10 pointer-events-none transition-all duration-200"
            style={{
              left: `${((focusIdx + 0.5) / n) * 100}%`,
              bottom: `calc(${heightOf(focusIdx)}% + 10px)`,
              transform: "translateX(-50%)",
            }}
          >
            <div
              className="rounded-xl px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.14)]"
              style={{ background: "var(--card)", border: "1px solid var(--bd)" }}
            >
              <div
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide"
                style={{ color: "var(--fg3)" }}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: BAR_ACTIVE }} />
                Pendapatan · {focus.label}
              </div>
              <p className="text-sm font-extrabold whitespace-nowrap mt-0.5" style={{ color: "var(--fg)" }}>
                {rp(focus.revenue)}
              </p>
              <p className="text-[10px] font-semibold whitespace-nowrap" style={{ color: "var(--fg3)" }}>
                {focus.orders} pesanan
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── label bulan di bawah tiap batang ── */}
      <div className="flex gap-2 mt-2">
        <span className="w-11 shrink-0" />
        <div className="flex-1 flex gap-1.5 sm:gap-2">
          {data.map((d, i) => (
            <span
              key={`x-${d.label}-${i}`}
              className="flex-1 text-center text-[11px] font-bold"
              style={{ color: i === focusIdx ? "var(--fg)" : "var(--fg3)" }}
            >
              {d.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
