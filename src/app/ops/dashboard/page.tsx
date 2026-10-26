"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
// Catatan: sebagian ikon lucide-react ada di runtime tapi belum masuk definisi
// tipe versi ini — jadi semuanya diambil lewat namespace (pola yang sama seperti
// OpsShell.tsx). Nilainya `any`, jadi tidak bisa gagal type-check.
import * as LucideIcons from "lucide-react";
import GlassCard from "@/components/ops/GlassCard";
import WebTrafficCard from "@/components/ops/WebTrafficCard";

const IconDashboard: any = (LucideIcons as any).LayoutDashboard ?? (LucideIcons as any).Gauge;
const IconRefresh: any = (LucideIcons as any).RefreshCw;
const IconChevronLeft: any = (LucideIcons as any).ChevronLeft;
const IconChevronRight: any = (LucideIcons as any).ChevronRight;
const IconAlert: any = (LucideIcons as any).AlertTriangle ?? (LucideIcons as any).TriangleAlert;
const IconWallet: any =
  (LucideIcons as any).Wallet ?? (LucideIcons as any).WalletMinimal ?? (LucideIcons as any).Banknote ?? (LucideIcons as any).DollarSign;
const IconPackage: any = (LucideIcons as any).Package;
const IconReceipt: any = (LucideIcons as any).Receipt ?? (LucideIcons as any).FileText ?? (LucideIcons as any).ScrollText;
const IconProfit: any = (LucideIcons as any).TrendingUp ?? (LucideIcons as any).LineChart;

/* ──────────────────────────────────────────────────────────────────────────
   Dashboard internal SAMAQU (/ops) — tampilan disamakan dengan dashboard
   Base44: header gradient + 4 card kaca (omset/HPP/biaya/net profit),
   3 card putih (transaksi/AOV/margin), lalu Tren Penjualan & Produk Terlaris.
   Semua angka dari /api/ops/dashboard (hitung WIB, butuh admin). Tidak ada
   data hardcode / dummy. Grafik tren pakai SVG inline (tanpa dependency baru).
   ────────────────────────────────────────────────────────────────────────── */

type TopProduct = {
  name: string;
  kain: string;
  series: string;
  /** "B-01 · Imalah" — baris bawah kartu. */
  sub: string;
  units: number;
  /** Omzet baris (Rp) dari harga tercatat di item pesanan. */
  revenue: number;
  /** Bagian dari `units` yang berasal dari add-on Open Order. */
  addonUnits?: number;
};
type TrendPoint = { tanggal: string; hari: string; omset: number };
type TrendHarian = { tanggal: string; label: string; omset: number; pesanan?: number };

type DashboardData = {
  generatedAt: string;
  hariIni: { startIso: string; endIso: string };
  bulan: string;
  bulanLabel: string;
  bulanValue: string;
  ringkasan: {
    omset: number;
    hpp: number;
    biaya: number;
    netProfit: number;
    margin: number;
    transaksi: number;
    rataRata: number;
  };
  trend: TrendPoint[];
  trendHarian: TrendHarian[];
  topProducts: TopProduct[];
};

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

const nfmt = (v: number | null | undefined) => (Number(v) || 0).toLocaleString("id-ID");
const rp = (v: number | null | undefined) => `Rp ${nfmt(v)}`;

/** Bulan WIB sekarang dalam format YYYY-MM. */
function currentMonthValue(): string {
  const wib = new Date(Date.now() + 7 * 3600 * 1000);
  return `${wib.getUTCFullYear()}-${String(wib.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "2026-10" → "Oktober" / "2026". */
function monthParts(value: string): { name: string; year: string } {
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) return { name: BULAN[new Date().getUTCMonth()], year: String(new Date().getUTCFullYear()) };
  const idx = Number(m[2]) - 1;
  return { name: BULAN[idx] || m[2], year: m[1] };
}

/** Ambil data dashboard dengan token admin (semua /api/ops/* butuh Bearer token). */
async function fetchDashboard(month: string): Promise<DashboardData> {
  const { supabase } = await import("@/lib/supabase");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`/api/ops/dashboard?month=${encodeURIComponent(month)}`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || `Gagal memuat dashboard (${res.status})`);
  return json as DashboardData;
}

function StatCard({ label, value, caption, tone }: { label: string; value: string; caption: string; tone?: string }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200 flex flex-col">
      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 min-h-[16px] truncate">{label}</p>
      <p className={`font-black mt-2 whitespace-nowrap leading-tight text-[clamp(1.15rem,1.6vw,1.75rem)] ${tone || "text-slate-900"}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-auto pt-1.5">{caption}</p>
    </div>
  );
}

/* ── Grafik "Tren Penjualan" — bentuknya disamakan dengan grafik "Pendapatan Bulanan"
   di dashboard /admin (`MonthlyTrendChart`): HTML/CSS, bukan SVG. ── */

/** Label sumbu Y ringkas: 1.200.000 → "1,2jt"; 800.000 → "800rb"; 0 → "0". */
function fmtSumbu(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })}jt`;
  if (v >= 1000) return `${Math.round(v / 1000).toLocaleString("id-ID")}rb`;
  return nfmt(v);
}

/** Batas atas "bulat enak dibaca" supaya tiap tick rapi (mis. 800.000 = 4 × 200.000). */
function niceTop(rawMax: number, ticks = 4): number {
  if (!(rawMax > 0)) return ticks;
  const step = rawMax / ticks;
  const pow = Math.pow(10, Math.floor(Math.log10(step)));
  const f = step / pow;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * pow * ticks;
}

/**
 * Grafik batang tren penjualan — satu bahasa dengan `MonthlyTrendChart` di dashboard /admin:
 *  - sumbu Y 4 langkah (0 … batas atas) dengan label ringkas ("1,2jt" / "800rb");
 *  - grid horizontal rata, tanpa garis vertikal dan tanpa legend;
 *  - batang abu muda, batang periode aktif (hari ini) hitam, yang disorot mouse abu tua;
 *  - tooltip melayang berisi nominal + jumlah pesanan; tanpa mouse menempel di hari ini;
 *  - label tanggal di bawah tiap batang, hari aktif lebih tegas.
 */
function TrendChart({ trend }: { trend: TrendHarian[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const max = (trend || []).reduce((m, d) => Math.max(m, Number(d.omset) || 0), 0);
  if (!trend || trend.length === 0 || max <= 0) {
    return <p className="text-sm text-gray-500 py-16 text-center">Belum ada penjualan 7 hari terakhir</p>;
  }

  const top = niceTop(max);
  const n = trend.length;
  const activeIdx = n - 1; // hari ini
  // Tooltip HANYA saat hover. Tanpa hover tidak ada kartu info yang menutupi grafik.
  const focusIdx = hover;
  const focus = focusIdx !== null ? trend[focusIdx] : null;
  const heightOf = (index: number) => (top > 0 ? ((Number(trend[index].omset) || 0) / top) * 100 : 0);

  return (
    <div
      className="mt-5"
      role="img"
      aria-label={`Tren penjualan ${n} hari terakhir (harga produk, tanpa ongkir)`}
    >
      <div className="flex gap-2">
        {/* Sumbu Y: 4 langkah dari 0 sampai batas atas. */}
        <div className="relative h-56 w-11 shrink-0 lg:h-64">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={`y-${i}`}
              className="absolute right-0 -translate-y-1/2 text-[11px] font-semibold tabular-nums text-slate-400"
              style={{ top: `${(1 - i / 4) * 100}%` }}
            >
              {fmtSumbu((top / 4) * i)}
            </span>
          ))}
        </div>

        {/* Area plot: grid + batang + tooltip. */}
        <div className="relative h-56 flex-1 lg:h-64">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={`grid-${i}`}
              className="absolute inset-x-0 border-t border-slate-100"
              style={{ top: `${(1 - i / 4) * 100}%` }}
            />
          ))}

          <div className="absolute inset-0 flex items-end gap-1.5 sm:gap-2">
            {trend.map((d, i) => {
              const active = i === activeIdx;
              return (
                <div
                  key={d.tanggal}
                  className="flex h-full flex-1 items-end justify-center"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                >
                  <span
                    className={`w-full max-w-[34px] rounded-t-md transition-colors duration-200 ${
                      active ? "bg-slate-900" : hover === i ? "bg-slate-400" : "bg-slate-200"
                    }`}
                    style={{ height: `${heightOf(i)}%`, minHeight: d.omset > 0 ? 6 : 0 }}
                  />
                </div>
              );
            })}
          </div>

          {/* Nilai hari yang disorot — hanya saat hover. */}
          {focusIdx !== null && focus ? (
            <div
              className="pointer-events-none absolute z-10 transition-all duration-200"
              style={{
                left: `${((focusIdx + 0.5) / n) * 100}%`,
                bottom: `calc(${heightOf(focusIdx)}% + 10px)`,
                transform: "translateX(-50%)",
              }}
            >
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.14)]">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-900" />
                  Penjualan · {focus.label}
                </div>
                <p className="mt-0.5 whitespace-nowrap text-sm font-extrabold text-slate-900">
                  {rp(focus.omset)}
                </p>
                <p className="whitespace-nowrap text-[10px] font-semibold text-slate-400">
                  {nfmt(focus.pesanan || 0)} pesanan
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Label tanggal di bawah tiap batang. */}
      <div className="mt-2 flex gap-2">
        <span className="w-11 shrink-0" />
        <div className="flex flex-1 gap-1.5 sm:gap-2">
          {trend.map((d, i) => (
            <span
              key={`x-${d.tanggal}`}
              className={`flex-1 text-center text-[11px] font-bold ${
                i === focusIdx ? "text-slate-900" : "text-slate-400"
              }`}
            >
              {d.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function OpsDashboardPage() {
  // Bulan terpilih (YYYY-MM) — default bulan WIB sekarang.
  const [bulanValue, setBulanValue] = useState<string>(() => currentMonthValue());

  // PENTING: jangan set `initialData` di sini — QueryClient global memakai
  // `initialDataUpdatedAt: 0`, jadi query tetap fetch. Data awal kosong akan
  // membuat dashboard tampil nol.
  const { data, isLoading, isError, isFetching, refetch } = useQuery<DashboardData>({
    queryKey: ["ops-dashboard", bulanValue],
    queryFn: () => fetchDashboard(bulanValue),
    staleTime: 30_000,
  });

  const parts = monthParts(bulanValue);
  const monthName = data?.bulanLabel ? data.bulanLabel.split(" ")[0] : parts.name;
  const yearLabel = data?.bulanLabel ? data.bulanLabel.split(" ")[1] || parts.year : parts.year;

  const shiftMonth = (delta: number) => {
    const m = /^(\d{4})-(\d{2})$/.exec(bulanValue);
    const y = m ? Number(m[1]) : Number(parts.year);
    const mi = m ? Number(m[2]) - 1 : 0;
    const d = new Date(Date.UTC(y, mi + delta, 1));
    setBulanValue(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  };

  const pick = useMemo(() => ({ onPrev: () => shiftMonth(-1), onNext: () => shiftMonth(1) }), [bulanValue]);

  /* ── Loading: skeleton (jangan tampilkan angka 0 dulu) ── */
  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="bg-white border border-slate-200 rounded-3xl relative overflow-hidden p-6 md:p-8">
          <div className="relative z-10 space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 animate-pulse" />
                <div className="space-y-2 pt-1">
                  <div className="h-7 w-44 rounded-lg bg-slate-200 animate-pulse" />
                  <div className="h-4 w-72 max-w-full rounded bg-slate-100 animate-pulse" />
                </div>
              </div>
              <div className="h-11 w-64 rounded-xl bg-slate-100 animate-pulse" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-32 rounded-2xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-white border border-gray-200 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[0, 1].map((i) => (
            <div key={i} className="h-64 rounded-xl bg-white border border-gray-200 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  /* ── Gagal memuat ── */
  if (isError || !data) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-12 text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-600 grid place-items-center mx-auto mb-3">
          <IconAlert size={24} />
        </div>
        <p className="font-bold text-slate-900">Dashboard belum berhasil dimuat.</p>
        <p className="text-sm text-gray-500 mt-1">Periksa koneksi lalu coba lagi.</p>
        <button
          onClick={() => refetch()}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 transition-all"
        >
          <IconRefresh size={14} /> Coba Lagi
        </button>
      </div>
    );
  }

  const { ringkasan: r, trendHarian, topProducts } = data;
  const profit = r.netProfit >= 0;

  return (
    <div className="space-y-5">
      {/* ── Header + 4 kartu ringkasan — palet netral, sama seperti dashboard admin ── */}
      <div className="bg-white border border-slate-200 rounded-3xl relative overflow-hidden p-6 md:p-8">
        <div className="relative z-10 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center border border-slate-200 shrink-0">
                <IconDashboard size={26} className="text-slate-900" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
                <p className="text-slate-500 font-medium mt-1">Ringkasan aktivitas bisnis Anda</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1 rounded-xl bg-slate-50 border border-slate-200 p-1">
                <button
                  type="button"
                  onClick={pick.onPrev}
                  aria-label="Bulan sebelumnya"
                  className="w-8 h-8 grid place-items-center rounded-lg text-slate-500 hover:bg-slate-200 transition-all"
                >
                  <IconChevronLeft size={16} />
                </button>
                <div className="flex items-center gap-1 px-0.5">
                  <button
                    type="button"
                    onClick={() => setBulanValue(currentMonthValue())}
                    title="Kembali ke bulan ini"
                    className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-[11px] font-bold text-slate-700 hover:bg-slate-100 transition-all"
                  >
                    {monthName}
                  </button>
                  <span className="text-slate-300 text-[11px]">|</span>
                  <button
                    type="button"
                    onClick={() => setBulanValue(currentMonthValue())}
                    title="Kembali ke bulan ini"
                    className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-[11px] font-bold text-slate-700 hover:bg-slate-100 transition-all"
                  >
                    {yearLabel}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={pick.onNext}
                  aria-label="Bulan berikutnya"
                  className="w-8 h-8 grid place-items-center rounded-lg text-slate-500 hover:bg-slate-200 transition-all"
                >
                  <IconChevronRight size={16} />
                </button>
              </div>

              <button
                onClick={() => refetch()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 transition-all"
              >
                <IconRefresh size={16} className={isFetching ? "animate-spin" : ""} />
                Muat ulang
              </button>

              <Link
                href="/ops/laporan"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
              >
                Lihat laporan →
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <GlassCard icon={IconWallet} label="Omzet Bruto" value={rp(r.omset)} caption="Pendapatan kotor" />
            <GlassCard icon={IconPackage} label="Total HPP" value={rp(r.hpp)} caption="Modal produk terjual" />
            <GlassCard icon={IconReceipt} label="Total Biaya" value={rp(r.biaya)} caption="Operasional & packing" />

            <div className="relative bg-white border border-slate-200 rounded-2xl p-5 flex flex-col">
              <span
                className={`absolute top-3 right-3 px-2 py-0.5 rounded-md text-[10px] font-black tracking-wider ${
                  profit ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-red-50 text-red-700 border border-red-100"
                }`}
              >
                {profit ? "PROFIT" : "RUGI"}
              </span>
              <div className="flex items-center gap-2 text-slate-500 min-h-[20px] pr-16">
                <IconProfit size={16} className="shrink-0" />
                <span className="text-[11px] font-bold uppercase tracking-wider truncate">Net Profit</span>
              </div>
              <p className={`font-black mt-3 whitespace-nowrap leading-tight text-[clamp(1.05rem,1.5vw,1.75rem)] ${profit ? "text-emerald-600" : "text-red-600"}`}>
                {rp(r.netProfit)}
              </p>
              <p className="text-slate-500 text-xs mt-auto pt-1.5">Keuntungan bersih</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── 3 card putih ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Total Transaksi" value={nfmt(r.transaksi)} caption="transaksi bulan ini" />
        <StatCard label="Rata-rata / Transaksi" value={rp(r.rataRata)} caption="nilai rata-rata" />
        <StatCard
          label="Margin Profit"
          value={`${nfmt(r.margin)}%`}
          caption="persentase margin"
          tone={r.margin >= 0 ? "text-slate-900" : "text-red-600"}
        />
      </div>

      {/* ── Trafik web publik (pencatat sisi server, bukan script browser) ── */}
      <WebTrafficCard />

      {/* ── Tren Penjualan · Produk Terlaris ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <div className="flex items-center gap-2 h-11 mb-4">
            <IconProfit size={18} className="text-slate-700 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-bold text-slate-900 leading-tight">Tren Penjualan</h2>
              <p className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold leading-tight">7 HARI TERAKHIR</p>
            </div>
          </div>
          <TrendChart trend={trendHarian} />
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          {/* Tinggi header dikunci (h-11) supaya sejajar dengan kartu "Tren Penjualan". */}
          <div className="flex items-center justify-between gap-3 h-11 mb-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 grid place-items-center shrink-0">
                <IconProfit size={17} />
              </span>
              <div className="min-w-0">
                <h2 className="font-bold text-slate-900 leading-tight truncate">Produk Terlaris</h2>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 truncate">
                  {monthName} {yearLabel}
                </p>
              </div>
            </div>
            {topProducts.length > 0 && (
              <span className="shrink-0 px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 text-[11px] font-bold whitespace-nowrap">
                Top {Math.min(topProducts.length, 5)}
              </span>
            )}
          </div>

          {topProducts.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm font-bold text-slate-800">Belum ada penjualan</p>
              <p className="text-xs text-gray-500 mt-1">
                Periode {monthName} {yearLabel}
              </p>
            </div>
          ) : (
            <ol className="space-y-2.5">
              {topProducts.slice(0, 5).map((p, i) => {
                const maxQty = Math.max(1, topProducts[0]?.units || 1);
                const pct = Math.max(6, Math.round((p.units / maxQty) * 100));
                const subline = [p.sub, p.revenue > 0 ? rp(p.revenue) : ""].filter(Boolean).join(" · ");
                const rankCls = i === 0 ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500";
                return (
                  <li
                    key={`${p.name}-${p.kain}-${p.series}-${i}`}
                    className="relative overflow-hidden rounded-xl border border-gray-100 px-3 py-2.5"
                  >
                    <span
                      aria-hidden
                      className={`absolute inset-y-0 left-0 ${i === 0 ? "bg-slate-200/70" : "bg-slate-100"}`}
                      style={{ width: `${pct}%` }}
                    />
                    <div className="relative flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-lg text-[11px] font-black grid place-items-center shrink-0 ${rankCls}`}>
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900 truncate" title={subline ? `${p.name} — ${subline}` : p.name}>
                          {p.name}
                        </p>
                        <p className="text-[11px] text-gray-500 truncate" title={subline || undefined}>
                          {subline || "—"}
                        </p>
                        {p.addonUnits ? (
                          <p className="text-[10px] font-semibold text-amber-600 mt-0.5">
                            termasuk {nfmt(p.addonUnits)} add-on Open Order
                          </p>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-base font-black text-slate-900 leading-none tabular-nums">{nfmt(p.units)}</p>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mt-0.5">terjual</p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
