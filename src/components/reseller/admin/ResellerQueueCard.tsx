"use client";

import Link from "next/link";
import { Store, ChevronRight } from "lucide-react";
import { useResellerQueueCount } from "@/lib/use-reseller-queue";

/** Kartu kecil dashboard ops: jumlah antrean reseller yang perlu dicek. */
export default function ResellerQueueCard() {
  const count = useResellerQueueCount(true);

  return (
    <Link
      href="/ops/reseller?tab=perlu-dicek"
      className="flex items-center gap-3 bg-white rounded-xl px-4 py-3.5 shadow-sm border border-gray-200 hover:border-slate-300 transition-colors"
    >
      <span className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 grid place-items-center shrink-0">
        <Store size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-slate-900 leading-tight">Reseller perlu dicek</p>
        <p className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">
          {count > 0 ? `${count} antrean menunggu konfirmasi` : "Tidak ada antrean"}
        </p>
      </div>
      <span
        className={`shrink-0 min-w-[26px] h-[26px] px-1.5 inline-flex items-center justify-center rounded-full text-[12px] font-black ${
          count > 0 ? "bg-red-500 text-white" : "bg-slate-100 text-slate-500"
        }`}
      >
        {count}
      </span>
      <ChevronRight size={16} className="text-slate-400 shrink-0" />
    </Link>
  );
}
