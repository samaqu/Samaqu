"use client";

import type { CatalogRow } from "./api";
import SeriesRow from "./SeriesRow";

export interface CatalogGroup {
  key: string;
  name: string;
  category: string;
  kain: string | null;
  rows: CatalogRow[];
}

/** Grup satu produk (beberapa series) di tabel Produk & Harga. */
export default function ProductGroupRow({
  group,
  defaultDiscount,
  selected,
  savingId,
  onSelectGroup,
  onSelectRow,
  onToggle,
  isNewRow,
}: {
  group: CatalogGroup;
  defaultDiscount: number;
  selected: Set<string>;
  savingId: string | null;
  onSelectGroup: (checked: boolean) => void;
  onSelectRow: (id: string, checked: boolean) => void;
  onToggle: (row: CatalogRow) => void;
  isNewRow: (row: CatalogRow) => boolean;
}) {
  const allSelected = group.rows.every((row) => selected.has(row.id));
  const singleSeries = group.rows.length === 1;

  return (
    <>
      <tr className="bg-slate-50 border-y border-slate-200">
        <td className="px-3 py-2 align-middle" colSpan={6}>
          <div className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) => onSelectGroup(e.target.checked)}
              aria-label={`Pilih semua series ${group.name}`}
              style={{ accentColor: "#2563eb", width: 15, height: 15 }}
            />
            <div className="min-w-0">
              <p className="font-extrabold text-slate-900 text-[13px] leading-tight">
                {group.name}
                <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  {group.category}
                </span>
              </p>
              <p className="text-[11px] text-slate-500 leading-tight">
                {group.kain ? `Kain ${group.kain} · ` : ""}
                {group.rows.length} series
              </p>
            </div>
            <button
              type="button"
              onClick={() => onSelectGroup(true)}
              className="ml-auto px-2 py-1 rounded-lg text-[11px] font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 whitespace-nowrap"
            >
              Atur semua series produk ini
            </button>
          </div>
        </td>
      </tr>
      {group.rows.map((row) => (
        <SeriesRow
          key={row.id}
          row={row}
          defaultDiscount={defaultDiscount}
          seriesLabel={row.series || (singleSeries ? "Standar" : "—")}
          selected={selected.has(row.id)}
          isNew={isNewRow(row)}
          saving={savingId === row.id}
          onSelect={(checked) => onSelectRow(row.id, checked)}
          onToggle={() => onToggle(row)}
        />
      ))}
    </>
  );
}
