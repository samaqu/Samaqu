"use client";

import { RefreshCw, Wallet } from "lucide-react";
import { BULAN_LABEL, tahunOptions } from "./helpers";

/** Kartu header halaman Pengeluaran + pemilih Bulan & Tahun. */
export default function PengeluaranHeader({
  bulan,
  tahun,
  isFetching,
  onChange,
}: {
  bulan: number;
  tahun: number;
  isFetching?: boolean;
  onChange: (bulan: number, tahun: number) => void;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100">
            <Wallet size={26} className="text-slate-900" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
              Rekap Pengeluaran
            </h1>
            <p className="mt-1 font-medium text-slate-500">
              Catat pengeluaran packing &amp; operasional
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isFetching ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-bold text-slate-500">
              <RefreshCw size={12} className="animate-spin" /> Memperbarui…
            </span>
          ) : null}

          <select
            value={bulan}
            onChange={(event) => onChange(Number(event.target.value), tahun)}
            aria-label="Pilih bulan"
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
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
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            {tahunOptions(tahun).map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}
