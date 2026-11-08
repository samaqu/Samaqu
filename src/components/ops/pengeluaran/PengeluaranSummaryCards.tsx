"use client";

import { Layers, Package, Receipt, Wallet } from "lucide-react";
import GlassCard from "@/components/ops/GlassCard";
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

/** Tiga kartu ringkasan yang mengikuti tab aktif. */
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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="h-4 w-28 animate-pulse rounded-md bg-slate-100" />
            <div className="mt-4 h-7 w-32 animate-pulse rounded-md bg-slate-100" />
            <div className="mt-3 h-3 w-24 animate-pulse rounded-md bg-slate-100" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {kartuUntuk(tipe, summary).map((card) => (
        <GlassCard
          key={card.key}
          icon={card.icon}
          label={card.label}
          value={card.value}
          caption={card.caption}
          tone={card.tone}
        />
      ))}
    </div>
  );
}
