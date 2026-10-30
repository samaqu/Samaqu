"use client";

import type { CatalogRow } from "./api";
import { SeriesCard } from "./SeriesRow";
import { singleSeriesLabel, type CatalogGroup } from "./ProductGroupRow";

/** Daftar kartu ringkas untuk tab Produk & Harga di layar sempit. */
export default function MobilePriceList({
  groups,
  defaultDiscount,
  selected,
  savingId,
  onSelectGroup,
  onSelectRow,
  onToggle,
  onMinSellCommit,
  isNewRow,
}: {
  groups: CatalogGroup[];
  defaultDiscount: number;
  selected: Set<string>;
  savingId: string | null;
  onSelectGroup: (ids: string[], checked: boolean) => void;
  onSelectRow: (id: string, checked: boolean) => void;
  onToggle: (row: CatalogRow) => void;
  onMinSellCommit: (row: CatalogRow, value: number | null) => void;
  isNewRow: (row: CatalogRow) => boolean;
}) {
  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const single = group.rows.length === 1;
        const allSelected = group.rows.every((row) => selected.has(row.id));

        return (
          <div key={group.key} className="space-y-2">
            {!single ? (
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => onSelectGroup(group.rows.map((row) => row.id), e.target.checked)}
                  aria-label={`Pilih semua series ${group.name}`}
                  style={{ accentColor: "#2563eb", width: 15, height: 15 }}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold text-slate-900 text-[12.5px] leading-tight">
                    {group.name}
                    <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      {group.category}
                    </span>
                  </p>
                  <p className="text-[10.5px] text-slate-500">{group.rows.length} series</p>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectGroup(group.rows.map((row) => row.id), true)}
                  className="px-2 py-1 rounded-lg text-[10.5px] font-bold text-slate-600 bg-white border border-slate-200 whitespace-nowrap"
                >
                  Pilih semua
                </button>
              </div>
            ) : null}

            <div className={single ? "" : "ml-2 border-l-2 border-slate-100 pl-2 space-y-2"}>
              {group.rows.map((row) => (
                <SeriesCard
                  key={row.id}
                  row={row}
                  defaultDiscount={defaultDiscount}
                  seriesLabel={single ? singleSeriesLabel(group) : undefined}
                  isSingle={single}
                  selected={selected.has(row.id)}
                  isNew={isNewRow(row)}
                  saving={savingId === row.id}
                  onSelect={(checked) => onSelectRow(row.id, checked)}
                  onToggle={() => onToggle(row)}
                  onMinSellCommit={(value) => onMinSellCommit(row, value)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
