"use client";

import { RefreshCw, Wallet } from "lucide-react";
import PengeluaranSummaryCards from "./PengeluaranSummaryCards";
import { BULAN_LABEL, tahunOptions } from "./helpers";
import type { PengeluaranSummary, PengeluaranTipe } from "./types";

/**
 * Kartu gelap header halaman Pengeluaran (warna Samaqu: hitam–grafit) berisi judul,
 * pemilih Bulan & Tahun, dan tiga kartu ringkasan yang mengikuti tab aktif.
 */
export default function PengeluaranHeader({
  bulan,
  tahun,
  tipe,
  summary,
  loading,
  isFetching,
  onChange,
}: {
  bulan: number;
  tahun: number;
  tipe: PengeluaranTipe;
  summary: PengeluaranSummary;
  loading?: boolean;
  isFetching?: boolean;
  onChange: (bulan: number, tahun: number) => void;
}) {
  const selectClass =
    "h-10 rounded-xl border border-white/15 bg-[#1d1d21] px-3 text-sm font-bold text-white outline-none transition-colors hover:border-white/30 focus:border-white/40 focus:ring-2 focus:ring-white/15";

  return (
    <section className="relative overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#111113_0%,#1c1c20_52%,#2d2d33_100%)] p-5 text-white shadow-sm md:p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full bg-white/[0.07] blur-3xl"
      />

      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10">
            <Wallet size={26} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">Rekap Pengeluaran</h1>
            <p className="mt-1 text-sm font-medium text-white/55">
              Catat pengeluaran packing &amp; operasional
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isFetching ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-bold text-white/70">
              <RefreshCw size={12} className="animate-spin" /> Memperbarui…
            </span>
          ) : null}

          <select
            value={bulan}
            onChange={(event) => onChange(Number(event.target.value), tahun)}
            aria-label="Pilih bulan"
            className={selectClass}
          >
            {BULAN_LABEL.map((label, index) => (
              <option key={label} value={index + 1}>
                {label}
              </option>
            ))}
          </select>

          <select
            value={tahun}
            onChange={(event) => onChange(bulan, Number(event.target.value))}
            aria-label="Pilih tahun"
            className={selectClass}
          >
            {tahunOptions(tahun).map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="relative mt-5">
        <PengeluaranSummaryCards tipe={tipe} summary={summary} loading={loading} />
      </div>
    </section>
  );
}
