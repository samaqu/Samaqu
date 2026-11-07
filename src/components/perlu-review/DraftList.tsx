"use client";

import DraftCard from "./DraftCard";
import type { Draft } from "./draft-format";

export default function DraftList({
  drafts,
  selectedId,
  onSelect,
}: {
  drafts: Draft[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="min-w-0 lg:sticky lg:top-4">
      <div className="overflow-hidden rounded-2xl border bg-white shadow-[0_1px_3px_rgba(20,20,20,0.04)]" style={{ borderColor: "#E7E6E1" }}>
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "#E7E6E1" }}>
          <p className="text-[13px] font-black" style={{ color: "#141414" }}>Draft transaksi</p>
          <p className="text-[10px] font-semibold" style={{ color: "#8A8880" }}>{drafts.length} menunggu</p>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-2 lg:max-h-[calc(100dvh-190px)]">
          {drafts.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs leading-relaxed" style={{ color: "#8A8880" }}>
              Belum ada draft transaksi.
            </p>
          ) : (
            <div className="grid gap-2">
              {drafts.map((draft) => (
                <DraftCard
                  key={draft.id}
                  draft={draft}
                  selected={draft.id === selectedId}
                  onSelect={() => onSelect(draft.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
