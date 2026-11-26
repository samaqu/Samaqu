"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, ChevronDown } from "lucide-react";

/**
 * "Produk Paling Banyak Terjual Melalui AI" — tampilan sengaja SAMA dengan "Produk Terlaris" di Laporan Office
 * (`components/ops/BestSellerSection.tsx`): tombol Per Series / Per Produk, urut unit atau omzet, tiga kartu
 * ringkasan, daftar peringkat dengan Unit / Omzet / Porsi, klik baris untuk rincian series dan ukuran.
 *
 * Bedanya hanya datanya: barang dari order closing AI saja (`/api/ops/ai-performance` → `produkTerjual`).
 * Tanpa perbandingan bulan lalu. Komponen Laporan yang asli tidak diubah.
 */

type Breakdown = { label: string; units: number };
type SeriesBreakdown = Breakdown & { key: string; revenue: number; sizes: Breakdown[] };

export type ProdukTerjualRow = {
  key: string;
  name: string;
  subname: string;
  units: number;
  revenue: number;
  share: number;
  fallback: boolean;
  addonUnits: number;
  sizes: Breakdown[];
  seriesBreakdown: SeriesBreakdown[];
};

type ModeData = { rows: ProdukTerjualRow[]; totals: { units: number; revenue: number; products: number } };

export type ProdukTerjualData = {
  /** Order sah dari closing AI yang dihitung. */
  orders: number;
  modes: { series: ModeData; product: ModeData };
};

const nfmt = (value: number | null | undefined) =>
  (Number(value) || 0).toLocaleString("id-ID", { maximumFractionDigits: 0 });
const rp = (value: number | null | undefined) => `Rp ${nfmt(value)}`;
const pct = (value: number | null | undefined) =>
  `${(Number(value) || 0).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;

function BreakdownColumn({ title, items, accent }: { title: string; items: Breakdown[]; accent: string }) {
  const max = Math.max(1, ...items.map((item) => item.units));
  return (
    <div className="rounded-2xl bg-[#F9FAFB] p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{title}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-xs font-semibold text-slate-400">Tidak ada rincian ukuran.</p>
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

export default function ProdukTerjualAi({ data }: { data?: ProdukTerjualData | null }) {
  const [sortMode, setSortMode] = useState<"units" | "revenue">("units");
  const [groupMode, setGroupMode] = useState<"series" | "product">("series");
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const modeData = data?.modes?.[groupMode];
  const rows = modeData?.rows;
  const sorted = useMemo(() => {
    const copy = [...(rows ?? [])];
    if (sortMode === "revenue") copy.sort((a, b) => b.revenue - a.revenue || b.units - a.units);
    return copy;
  }, [rows, sortMode]);

  const visible = showAll ? sorted : sorted.slice(0, 10);
  const maxValue = Math.max(1, ...visible.map((row) => (sortMode === "revenue" ? row.revenue : row.units)));
  const totals = modeData?.totals;
  const top = rows?.[0];

  return (
    <section className="rounded-3xl border border-[#E4E4E7] bg-[#EFEFF1] p-5 shadow-sm md:p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-slate-700">
          <ArrowUpRight size={18} strokeWidth={1.9} />
        </span>
        <div>
          <h2 className="text-lg font-black tracking-tight text-[#374151]">Produk Paling Banyak Terjual Melalui AI</h2>
          <p className="text-xs font-medium text-slate-500">
            Daftar produk yang berhasil terjual melalui bantuan AI bulan ini, diurutkan berdasarkan jumlah unit terjual.
          </p>
        </div>
      </div>

      {!data ? (
        <div className="mt-5 rounded-2xl bg-[#F9FAFB] px-4 py-6 text-center">
          <p className="text-sm font-bold text-slate-700">Daftar produk belum bisa dimuat</p>
          <p className="mt-1 text-xs text-slate-500">Muat ulang halaman untuk mencoba lagi.</p>
        </div>
      ) : sorted.length === 0 ? (
        <div className="mt-5 grid place-items-center rounded-2xl bg-[#F9FAFB] px-4 py-10 text-center">
          <p className="text-sm font-bold text-slate-700">Belum ada produk terjual lewat AI di periode ini</p>
          <p className="mt-1 text-xs text-slate-500">Pilih bulan lain untuk melihat riwayatnya.</p>
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-full bg-white p-1">
              {[
                { key: "units" as const, label: "Unit terbanyak" },
                { key: "revenue" as const, label: "Omzet terbesar" },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setSortMode(item.key)}
                  className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${
                    sortMode === item.key ? "bg-[#EFEFF1] text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 rounded-full bg-white p-1">
              {[
                { key: "series" as const, label: "Per Series" },
                { key: "product" as const, label: "Per Produk" },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setGroupMode(item.key);
                    setExpanded(null);
                    setShowAll(false);
                  }}
                  className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${
                    groupMode === item.key ? "bg-[#EFEFF1] text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Ringkasan periode */}
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="rounded-2xl bg-[#F9FAFB] px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total unit terjual</p>
              <p className="mt-1 text-xl font-black tabular-nums text-[#374151]">{nfmt(totals?.units)} unit</p>
              <p className="text-[11px] font-semibold text-slate-500">{rp(totals?.revenue)} omzet</p>
            </div>
            <div className="rounded-2xl bg-[#F9FAFB] px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Produk terjual</p>
              <p className="mt-1 text-xl font-black tabular-nums text-[#374151]">{nfmt(totals?.products)} produk</p>
              <p className="text-[11px] font-semibold text-slate-500">dari {nfmt(data.orders)} transaksi</p>
            </div>
            <div className="rounded-2xl bg-[#F9FAFB] px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Terlaris #1</p>
              <p className="mt-1 truncate text-sm font-black text-[#374151]" title={top?.name || ""}>
                {top?.name || "—"}
              </p>
              <p className="text-[11px] font-semibold text-slate-500">{top ? `${nfmt(top.units)} unit` : "Belum ada"}</p>
            </div>
          </div>

          {/* Daftar ranking */}
          <div className="mt-4">
            <div className="hidden items-center gap-3 px-2 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 sm:flex">
              <span className="w-6 shrink-0 text-center">#</span>
              <span className="min-w-0 flex-1">Produk</span>
              <span className="w-16 shrink-0 text-right">Unit</span>
              <span className="w-24 shrink-0 text-right">Omzet</span>
              <span className="w-14 shrink-0 text-right">Porsi</span>
              <span className="w-6 shrink-0" />
            </div>

            <ul className="divide-y divide-[#F1F3F5]">
              {visible.map((row, index) => {
                const isOpen = expanded === row.key;
                const value = sortMode === "revenue" ? row.revenue : row.units;
                const width = Math.max(2, Math.round((value / maxValue) * 100));
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
                            index === 0 ? "bg-slate-900 text-white" : "bg-white text-slate-600"
                          }`}
                        >
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-bold text-[#374151]" title={row.name}>
                              {row.name}
                            </span>
                            {row.fallback ? (
                              <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">
                                Fallback
                              </span>
                            ) : null}
                          </span>
                          {row.subname ? (
                            <span className="mt-0.5 block truncate text-[11px] font-semibold text-slate-400">{row.subname}</span>
                          ) : null}
                          {row.addonUnits ? (
                            <span className="mt-0.5 block text-[10px] font-bold text-amber-600">
                              termasuk {nfmt(row.addonUnits)} add-on Open Order
                            </span>
                          ) : null}
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
                        <ChevronDown
                          size={15}
                          className={`shrink-0 text-slate-300 transition-transform ${isOpen ? "rotate-180" : ""}`}
                        />
                      </div>

                      <div className="mt-2 flex items-center gap-3 pl-9">
                        <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[#E4E4E7]">
                          <span
                            className="block h-full rounded-full"
                            style={{
                              width: `${width}%`,
                              background: index === 0 ? "#0F172A" : index < 3 ? "#475569" : "#94A3B8",
                            }}
                          />
                        </span>
                      </div>
                    </button>

                    {isOpen ? (
                      <div className="mb-3 grid gap-2 pl-9">
                        {groupMode === "product" && row.seriesBreakdown.length > 0 ? (
                          <div className="rounded-2xl bg-[#F9FAFB] p-3">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Per series</p>
                            <ul className="mt-2 space-y-2">
                              {row.seriesBreakdown.map((item) => (
                                <li key={item.key} className="rounded-xl bg-white px-3 py-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="truncate text-[11px] font-bold text-slate-700" title={item.label}>
                                      {item.label}
                                    </span>
                                    <span className="shrink-0 text-[11px] font-bold tabular-nums text-slate-600">
                                      {nfmt(item.units)} unit · {rp(item.revenue)}
                                    </span>
                                  </div>
                                  {item.sizes.length > 0 ? (
                                    <div className="mt-1.5 flex flex-wrap gap-1">
                                      {item.sizes.map((size) => (
                                        <span
                                          key={size.label}
                                          className="rounded-full bg-[#F3F4F6] px-2 py-0.5 text-[10px] font-semibold text-slate-600"
                                        >
                                          {size.label} · {nfmt(size.units)}
                                        </span>
                                      ))}
                                    </div>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : (
                          <BreakdownColumn title="Per ukuran" items={row.sizes} accent="#475569" />
                        )}
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
                {showAll
                  ? "Tampilkan lebih sedikit"
                  : `Lihat semua (${sorted.length} ${groupMode === "product" ? "produk" : "baris"})`}
                <ChevronDown size={14} className={showAll ? "rotate-180 transition-transform" : "transition-transform"} />
              </button>
            ) : null}

            <p className="mt-3 text-[11px] font-semibold text-slate-400">
              Omzet sudah dipotong diskon dan tidak termasuk ongkir. Cover &amp; hanger tidak ikut daftar.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
