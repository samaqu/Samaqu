"use client";

import { money, time, totalDraft, type Draft } from "./draft-format";

export default function DraftDetailHeader({ draft }: { draft: Draft }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b px-4 py-4 sm:px-5" style={{ borderColor: "#E7E6E1" }}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-black" style={{ color: "#141414" }}>Draft transaksi</h2>
          <span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: "#FBEFD9", color: "#8A5A12" }}>
            Menunggu review
          </span>
        </div>
        <p className="mt-1 text-[11px]" style={{ color: "#8A8880" }}>Masuk {time(draft.created_at)}</p>
      </div>
      <div className="text-right">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "#8A8880" }}>Total tagihan</p>
        <p className="mt-0.5 text-xl font-black tabular-nums" style={{ color: "#1F7A4D" }}>{money(totalDraft(draft.payload))}</p>
      </div>
    </div>
  );
}
