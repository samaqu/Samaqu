"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUpRight, ChevronDown, Loader2, RefreshCw } from "lucide-react";

/**
 * Kartu "Produk Terlaris" halaman Laporan ops.
 *
 * Angka datang dari `/api/ops/best-sellers` (satu agregasi per PRODUK INDUK, batas bulan WIB,
 * pesanan sah saja). Section ini punya pemilih bulannya sendiri — default bulan berjalan —
 * dengan pembanding apple-to-apple: bulan berjalan dibandingkan dengan rentang tanggal yang sama
 * di bulan sebelumnya, bulan yang sudah selesai dibandingkan bulan penuh.
 */

type Breakdown = { label: string; units: number };

type BestSellerRow = {
  key: string;
  name: string;
  units: number;
  revenue: number;
  share: number;
  prevUnits: number;
  deltaUnits: number;
  /** null = tidak ada penjualan di periode pembanding (pakai label "Baru"). */
  deltaPct: number | null;
  isNew: boolean;
  sizes: Breakdown[];
  covers: Breakdown[];
};

type BestSellerData = {
  period: { month: string; label: string; isPartial: boolean; rangeLabel: string; shortLabel: string };
  comparison: {
    month: string;
    label: string;
    rangeLabel: string;
    shortLabel: string;
    hasData: boolean;
  };
  totals: {
    units: number;
    revenue: number;
    products: number;
    validOrders: number;
    orders: number;
    top: { name: string; units: number } | null;
    unitsPrev: number;
    deltaUnits: number;
    deltaPct: number | null;
  };
  rows: BestSellerRow[];
};

const nfmt = (value: number | null | undefined) =>
  (Number(value) || 0).toLocaleString("id-ID", { maximumFractionDigits: 0 });
const rp = (value: number | null | undefined) => `Rp ${nfmt(value)}`;
const pct = (value: number | null | undefined) =>
  `${(Number(value) || 0).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;

const BULAN_PANJANG = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

/** Bulan WIB sekarang, `YYYY-MM`. */
function currentMonthKey(now = new Date()) {
  return new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

function shiftMonth(value: string, delta: number) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  return `${BULAN_PANJANG[month - 1] || month} ${year}`;
}

async function fetchBestSellers(month: string): Promise<BestSellerData> {
  const { supabase } = await import("@/lib/supabase");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`/api/ops/best-sellers?month=${encodeURIComponent(month)}`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || `Gagal memuat produk terlaris (${res.status})`);
  return json as BestSellerData;
}

function DeltaChip({ row }: { row: BestSellerRow }) {
  if (row.isNew) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
        Baru
      </span>
    );
  }
  const up = row.deltaUnits >= 0;
  const tone = row.deltaUnits === 0 ? "bg-slate-100 text-slate-500" : up ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700";
  const Icon = up ? ArrowUpRight : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${tone}`}>
      {row.deltaUnits === 0 ? null : <Icon size={11} strokeWidth={2.4} />}
      {up && row.deltaUnits > 0 ? "+" : row.deltaUnits < 0 ? "−" : ""}
      {nfmt(Math.abs(row.deltaUnits))} unit
      {row.deltaPct === null ? "" : `, ${up ? "+" : "−"}${pct(Math.abs(row.deltaPct))}`}
    </span>
  );
}

function BreakdownColumn({ title, items, accent }: { title: string; items: Breakdown[]; accent: string }) {
  const max = Math.max(1, ...items.map((item) => item.units));
  return (
    <div className="rounded-2xl bg-[#F9FAFB] p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{title}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-xs font-semibold text-slate-400">Tidak terjual di periode ini.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {items.map((item) => (
            <li key={item.label} className="flex items-center gap-2">
              <span className="w-24 shrink-0 truncate text-[11px] font-semibold text-slate-600" title={item.label}>
                {item.label}
              </span>
              <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[#E9ECEF]">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${Math.round((item.units / max) * 100)}%`, backgroundColor: accent }}
                />
              </span>
              <span className="w-10 shrink-0 text-right text-[11px] font-bold tabular-nums text-slate-700">
                {nfmt(item.units)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function BestSellerSection() {
  const thisMonth = currentMonthKey();
  const [month, setMonth] = useState(thisMonth);
  const [sortMode, setSortMode] = useState<"units" | "revenue">("units");
  const [compareOn, setCompareOn] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery<BestSellerData>({
    queryKey: ["ops-best-sellers", month],
    queryFn: () => fetchBestSellers(month),
    staleTime: 30_000,
  });

  const monthOptions = useMemo(
    () => Array.from({ length: 12 }, (_, index) => shiftMonth(thisMonth, -index)),
    [thisMonth],
  );

  const rows = data?.rows || [];
  const sorted = useMemo(() => {
    const copy = [...rows];
    if (sortMode === "revenue") copy.sort((a, b) => b.revenue - a.revenue || b.units - a.units);
    return copy;
  }, [rows, sortMode]);

  const visible = showAll ? sorted : sorted.slice(0, 10);
  const maxUnits = Math.max(1, ...visible.map((row) => (sortMode === "revenue" ? row.revenue : row.units)));
  const totals = data?.totals;
  const comparison = data?.comparison;
  const compareVisible = compareOn && !!comparison?.hasData;

  return (
    <section className="rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-sm md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#F3F4F6] text-slate-700">
            <ArrowUpRight size={18} strokeWidth={1.9} />
          </span>
          <div>
            <h2 className="text-lg font-black tracking-tight text-[#374151]">Produk Terlaris</h2>
            <p className="text-xs font-medium text-slate-500">
              Peringkat per produk, series, dan kain — size &amp; cover digabung — pada{" "}
              {data?.period.label || monthLabel(month)}.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[#F9FAFB] px-3 py-1.5 text-[11px] font-bold text-slate-600">
            {data?.period.rangeLabel || monthLabel(month)}
          </span>
          {compareOn && comparison ? (
            <span className="rounded-full bg-[#F9FAFB] px-3 py-1.5 text-[11px] font-bold text-slate-500">
              vs {comparison.shortLabel}
            </span>
          ) : null}
          {isFetching ? <Loader2 size={14} className="animate-spin text-slate-400" /> : null}
        </div>
      </div>

      {/* Kontrol periode, urutan, dan pembanding */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {[
          { key: thisMonth, label: "Bulan Ini" },
          { key: shiftMonth(thisMonth, -1), label: "Bulan Lalu" },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setMonth(item.key)}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
              month === item.key
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-[#E5E7EB] bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {item.label}
          </button>
        ))}
        <select
          value={month}
          onChange={(event) => setMonth(event.target.value)}
          className="rounded-full border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-bold text-slate-600 outline-none"
          aria-label="Pilih bulan lain"
        >
          {monthOptions.map((value) => (
            <option key={value} value={value}>
              {monthLabel(value)}
            </option>
          ))}
        </select>

        <span className="mx-1 hidden h-4 w-px bg-[#E5E7EB] sm:block" />

        <div className="flex items-center gap-1 rounded-full bg-[#F3F4F6] p-1">
          {[
            { key: "units" as const, label: "Unit terbanyak" },
            { key: "revenue" as const, label: "Omzet terbesar" },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setSortMode(item.key)}
              className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${
                sortMode === item.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setCompareOn((value) => !value)}
          aria-pressed={compareOn}
          className="ml-auto inline-flex items-center gap-2 rounded-full border border-[#E5E7EB] px-3 py-1.5 text-[11px] font-bold text-slate-600"
        >
          Bandingkan
          <span
            className={`relative h-4 w-7 rounded-full transition-colors ${
              compareOn ? "bg-slate-900" : "bg-[#D4D4D8]"
            }`}
          >
            <span
              className="absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white transition-transform"
              style={{ transform: compareOn ? "translateX(12px)" : "translateX(0)" }}
            />
          </span>
        </button>
      </div>

      {isLoading ? (
        <div className="mt-5 space-y-2">
          {[0, 1, 2, 3, 4].map((row) => (
            <div key={row} className="h-12 animate-pulse rounded-2xl bg-[#F3F4F6]" />
          ))}
        </div>
      ) : isError ? (
        <div className="mt-5 rounded-2xl bg-[#F9FAFB] px-4 py-6 text-center">
          <p className="text-sm font-bold text-slate-700">Produk terlaris gagal dimuat</p>
          <p className="mt-1 text-xs text-slate-500">{error instanceof Error ? error.message : "Coba lagi."}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white"
          >
            <RefreshCw size={13} /> Coba lagi
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-5 grid place-items-center rounded-2xl bg-[#F9FAFB] px-4 py-10 text-center">
          <p className="text-sm font-bold text-slate-700">Belum ada penjualan di {data?.period.label}</p>
          <p className="mt-1 text-xs text-slate-500">Pilih bulan lain untuk melihat riwayat produk terlaris.</p>
        </div>
      ) : (
        <>
          {/* Ringkasan periode */}
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-[#F9FAFB] px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total unit terjual</p>
              <p className="mt-1 text-xl font-black tabular-nums text-[#374151]">{nfmt(totals?.units)} unit</p>
              <p className="text-[11px] font-semibold text-slate-500">{rp(totals?.revenue)} omzet</p>
            </div>
            <div className="rounded-2xl bg-[#F9FAFB] px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Produk terjual</p>
              <p className="mt-1 text-xl font-black tabular-nums text-[#374151]">{nfmt(totals?.products)} produk</p>
              <p className="text-[11px] font-semibold text-slate-500">dari {nfmt(totals?.validOrders)} transaksi</p>
            </div>
            <div className="rounded-2xl bg-[#F9FAFB] px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Terlaris #1</p>
              <p className="mt-1 truncate text-sm font-black text-[#374151]" title={totals?.top?.name || ""}>
                {totals?.top?.name || "—"}
              </p>
              <p className="text-[11px] font-semibold text-slate-500">
                {totals?.top ? `${nfmt(totals.top.units)} unit` : "Belum ada"}
              </p>
            </div>
            <div className="rounded-2xl bg-[#F9FAFB] px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {compareOn && comparison ? `vs ${comparison.shortLabel}` : "Periode pembanding"}
              </p>
              {!compareOn ? (
                <p className="mt-1 text-sm font-black text-slate-400">Dimatikan</p>
              ) : !comparison?.hasData ? (
                <p className="mt-1 text-sm font-black text-slate-400">Belum ada data</p>
              ) : (
                <>
                  <p
                    className={`mt-1 inline-flex items-center gap-1 text-xl font-black tabular-nums ${
                      (totals?.deltaUnits || 0) === 0
                        ? "text-slate-500"
                        : (totals?.deltaUnits || 0) > 0
                          ? "text-emerald-600"
                          : "text-rose-600"
                    }`}
                  >
                    {(totals?.deltaUnits || 0) === 0 ? null : (totals?.deltaUnits || 0) > 0 ? (
                      <ArrowUpRight size={16} strokeWidth={2.4} />
                    ) : (
                      <ArrowDown size={16} strokeWidth={2.4} />
                    )}
                    {(totals?.deltaUnits || 0) > 0 ? "+" : (totals?.deltaUnits || 0) < 0 ? "−" : ""}
                    {nfmt(Math.abs(totals?.deltaUnits || 0))} unit
                  </p>
                  <p className="text-[11px] font-semibold text-slate-500">
                    {totals?.deltaPct === null
                      ? `${nfmt(totals?.unitsPrev || 0)} unit di ${comparison?.shortLabel}`
                      : `${(totals?.deltaPct || 0) > 0 ? "+" : "−"}${pct(Math.abs(totals?.deltaPct || 0))}`}
                  </p>
                </>
              )}
              {compareOn && comparison && !comparison.hasData ? (
                <p className="mt-0.5 text-[11px] font-semibold text-slate-400">Belum ada data pembanding</p>
              ) : null}
            </div>
          </div>

          {totals?.units === 0 ? (
            <p className="mt-4 rounded-2xl bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-slate-500">
              Belum ada penjualan di {data?.period.label}. Daftar di bawah hanya produk yang terjual di periode
              pembanding ({comparison?.shortLabel}).
            </p>
          ) : null}

          {/* Daftar ranking */}
          <div className="mt-4">
            <div className="hidden items-center gap-3 px-2 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 sm:flex">
              <span className="w-6 shrink-0 text-center">#</span>
              <span className="min-w-0 flex-1">Produk</span>
              <span className="w-16 shrink-0 text-right">Unit</span>
              <span className="w-24 shrink-0 text-right">Omzet</span>
              <span className="w-14 shrink-0 text-right">Porsi</span>
              {compareVisible ? <span className="w-32 shrink-0 text-right">vs {comparison?.shortLabel}</span> : null}
              <span className="w-6 shrink-0" />
            </div>

            <ul className="divide-y divide-[#F1F3F5]">
              {visible.map((row, index) => {
                const isOpen = expanded === row.key;
                const value = sortMode === "revenue" ? row.revenue : row.units;
                const width = Math.max(2, Math.round((value / maxUnits) * 100));
                return (
                  <li key={row.key}>
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : row.key)}
                      aria-expanded={isOpen}
                      className="w-full px-2 py-3 text-left transition-colors hover:bg-[#FAFBFC]"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[11px] font-black tabular-nums ${
                            index === 0 ? "bg-slate-900 text-white" : "bg-[#F3F4F6] text-slate-600"
                          }`}
                        >
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-bold text-[#374151]" title={row.name}>
                              {row.name}
                            </span>
                            {compareVisible && (row.isNew || row.prevUnits === 0) ? <DeltaChip row={row} /> : null}
                          </span>
                          <span className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[11px] font-semibold text-slate-500 sm:hidden">
                            <span className="tabular-nums">{nfmt(row.units)} unit</span>
                            <span className="tabular-nums">{rp(row.revenue)}</span>
                            <span className="tabular-nums">{pct(row.share)}</span>
                          </span>
                        </span>
                        <span className="hidden w-16 shrink-0 text-right text-sm font-bold tabular-nums text-[#374151] sm:block">
                          {nfmt(row.units)}
                        </span>
                        <span className="hidden w-24 shrink-0 text-right text-[11px] font-semibold tabular-nums text-slate-500 sm:block">
                          {rp(row.revenue)}
                        </span>
                        <span className="hidden w-14 shrink-0 text-right text-[11px] font-bold tabular-nums text-slate-600 sm:block">
                          {pct(row.share)}
                        </span>
                        {compareVisible ? (
                          <span className="hidden w-32 shrink-0 justify-end sm:flex">
                            {row.prevUnits === 0 && !row.isNew ? (
                              <span className="text-[11px] font-semibold text-slate-400">—</span>
                            ) : (
                              <DeltaChip row={row} />
                            )}
                          </span>
                        ) : null}
                        <ChevronDown
                          size={15}
                          className={`shrink-0 text-slate-300 transition-transform ${isOpen ? "rotate-180" : ""}`}
                        />
                      </div>

                      <div className="mt-2 flex items-center gap-3 pl-9">
                        <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[#F1F3F5]">
                          <span
                            className="block h-full rounded-full"
                            style={{
                              width: `${width}%`,
                              background: index === 0 ? "#0F172A" : index < 3 ? "#475569" : "#94A3B8",
                            }}
                          />
                        </span>
                        {compareVisible && row.prevUnits === 0 ? <span className="sm:hidden"><DeltaChip row={row} /></span> : null}
                      </div>
                    </button>

                    {isOpen ? (
                      <div className="mb-3 grid gap-2 pl-9 sm:grid-cols-2">
                        <BreakdownColumn title="Per ukuran" items={row.sizes} accent="#475569" />
                        <BreakdownColumn title="Per cover & hanger" items={row.covers} accent="#94A3B8" />
                        {compareVisible ? (
                          <div className="sm:col-span-2">
                            <p className="text-[11px] font-semibold text-slate-500">
                              {row.isNew
                                ? `Baru di periode ini — belum terjual di ${comparison?.shortLabel}.`
                                : row.prevUnits === 0
                                  ? "Tidak terjual di periode ini."
                                  : `${nfmt(row.units)} unit sekarang vs ${nfmt(row.prevUnits)} unit di ${comparison?.shortLabel}.`}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            {sorted.length > 10 ? (
              <button
                type="button"
                onClick={() => setShowAll((value) => !value)}
                className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#E5E7EB] px-3 py-2 text-xs font-bold text-slate-600 hover:bg-[#F9FAFB]"
              >
                {showAll ? "Tampilkan lebih sedikit" : `Lihat semua (${sorted.length} produk)`}
                <ChevronDown size={14} className={showAll ? "rotate-180 transition-transform" : "transition-transform"} />
              </button>
            ) : null}

            {compareVisible ? (
              <p className="mt-3 text-[11px] font-semibold text-slate-400">
                Dibandingkan dengan rentang {comparison?.rangeLabel} — aturan transaksi sah & penggabungan produk
                sama untuk kedua periode.
              </p>
            ) : compareOn && comparison ? (
              <p className="mt-3 text-[11px] font-semibold text-slate-400">
                Belum ada data pembanding untuk {comparison.label}.
              </p>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
