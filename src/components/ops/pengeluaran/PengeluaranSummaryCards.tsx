"use client";

import { Layers, Package, Receipt, Wallet } from "lucide-react";
import { angka, rupiah } from "./helpers";
import type { PengeluaranSummary, PengeluaranTipe } from "./types";

type Card = {
  key: string;
  icon: typeof Wallet;
  label: string;
  value: string;
  caption: string;
  tone?: "default" | "muted";
};

function kartuUntuk(tipe: PengeluaranTipe, summary: PengeluaranSummary): Card[] {
  if (tipe === "packing") {
    return [
      {
        key: "transaksi",
        icon: Receipt,
        label: "Total Transaksi",
        value: angka(summary.jumlah_transaksi),
        caption: "Pembelian packing",
      },
      {
        key: "kuantitas",
        icon: Package,
        label: "Total Kuantitas",
        value: angka(summary.total_kuantitas),
        caption: "Total item dibeli",
      },
      {
        key: "biaya",
        icon: Wallet,
        label: "Total Biaya",
        value: rupiah(summary.total_biaya),
        caption: "Biaya packing",
      },
    ];
  }

  const terbesar = summary.kategori_terbesar;
  return [
    {
      key: "transaksi",
      icon: Receipt,
      label: "Total Transaksi",
      value: angka(summary.jumlah_transaksi),
      caption: "Transaksi operasional",
    },
    {
      key: "biaya",
      icon: Wallet,
      label: "Total Biaya",
      value: rupiah(summary.total_biaya),
      caption: "Biaya operasional",
    },
    {
      key: "kategori",
      icon: Layers,
      label: "Kategori Terbesar",
      value: terbesar ? terbesar.kategori : "—",
      caption: terbesar ? `${rupiah(terbesar.jumlah)} bulan ini` : "Belum ada data kategori",
      tone: terbesar ? "default" : "muted",
    },
  ];
}

/** Tiga kartu ringkasan yang mengikuti tab aktif — dirender di dalam kartu gelap header. */
export default function PengeluaranSummaryCards({
  tipe,
  summary,
  loading,
}: {
  tipe: PengeluaranTipe;
  summary: PengeluaranSummary;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="rounded-2xl border border-white/15 bg-white/[0.06] p-4">
            <div className="h-3 w-28 animate-pulse rounded-md bg-white/15" />
            <div className="mt-4 h-7 w-32 animate-pulse rounded-md bg-white/15" />
            <div className="mt-3 h-3 w-24 animate-pulse rounded-md bg-white/10" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {kartuUntuk(tipe, summary).map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.key}
            className="flex flex-col rounded-2xl border border-white/15 bg-white/[0.06] p-4"
          >
            <div className="flex min-h-[20px] items-center gap-2 text-white/55">
              <Icon size={15} className="shrink-0" />
              <span className="truncate text-[10px] font-black uppercase tracking-[0.14em]">
                {card.label}
              </span>
            </div>
            <p
              className={`mt-3 whitespace-nowrap text-[clamp(1.1rem,1.6vw,1.6rem)] font-black leading-tight tabular-nums ${
                card.tone === "muted" ? "text-white/40" : "text-white"
              }`}
            >
              {card.value}
            </p>
            <p className="mt-auto pt-1.5 text-xs font-semibold text-white/45">{card.caption}</p>
          </div>
        );
      })}
    </div>
  );
}
