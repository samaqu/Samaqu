"use client";

import { money, phone, time, totalDraft, type Draft } from "./draft-format";

export default function DraftCard({
  draft,
  selected,
  onSelect,
}: {
  draft: Draft;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full rounded-[15px] border p-3 text-left transition-colors ${
        selected ? "ring-1 ring-[#1F7A4D]/20" : "hover:bg-[#FAFAF9]"
      }`}
      style={{
        borderColor: selected ? "#1F7A4D" : "#E7E6E1",
        background: selected ? "#F1FAF5" : "#fff",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-[13px] font-black" style={{ color: "#141414" }}>
          {draft.customer_name || phone(draft.customer_whatsapp)}
        </p>
        <span className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ background: "#FBEFD9", color: "#8A5A12" }}>
          Menunggu review
        </span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <span className="text-[10px]" style={{ color: "#8A8880" }}>{time(draft.created_at)}</span>
        <span className="text-[12px] font-black tabular-nums" style={{ color: "#141414" }}>{money(totalDraft(draft.payload))}</span>
      </div>
    </button>
  );
}
