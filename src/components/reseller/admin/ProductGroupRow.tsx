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

/** Label untuk produk satu-series: "Nama produk — Series". */
export function singleSeriesLabel(group: CatalogGroup): string {
  const row = group.rows[0];
  return row.series ? `${row.name} — ${row.series}` : row.name;
}

/** Grup produk di tabel Produk & Harga: header tipis + satu baris per series. */
export default function ProductGroupRow({
  group,
  defaultDiscount,
  selected,
  savingId,
  onSelectGroup,
  onSelectRow,
  onToggle,
  onMinSellCommit,
  isNewRow,
}: {
  group: CatalogGroup;
  defaultDiscount: number;
  selected: Set<string>;
  savingId: string | null;
  onSelectGroup: (checked: boolean) => void;
  onSelectRow: (id: string, checked: boolean) => void;
  onToggle: (row: CatalogRow) => void;
  onMinSellCommit: (row: CatalogRow, value: number | null) => void;
  isNewRow: (row: CatalogRow) => boolean;
}) {
  const allSelected = group.rows.every((row) => selected.has(row.id));
  const single = group.rows.length === 1;

  if (single) {
    const row = group.rows[0];
    return (
      <SeriesRow
        row={row}
        defaultDiscount={defaultDiscount}
        seriesLabel={singleSeriesLabel(group)}
        isSingle
        indent={false}
        selected={selected.has(row.id)}
        isNew={isNewRow(row)}
        saving={savingId === row.id}
        onSelect={(checked) => onSelectRow(row.id, checked)}
        onToggle={() => onToggle(row)}
        onMinSellCommit={(value) => onMinSellCommit(row, value)}
      />
    );
  }

  return (
    <>
      <tr className="bg-slate-50 border-y border-slate-200">
        <td className="px-2 py-1.5 align-middle" colSpan={7}>
          <div className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) => onSelectGroup(e.target.checked)}
              aria-label={`Pilih semua series ${group.name}`}
              style={{ accentColor: "#2563eb", width: 15, height: 15 }}
            />
            <div className="min-w-0">
              <p className="font-extrabold text-slate-900 text-[12.5px] leading-tight">
                {group.name}
                <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  {group.category}
                </span>
                <span className="ml-2 text-[10px] font-semibold text-slate-400">
                  {group.rows.length} series
                </span>
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
          isSingle={false}
          indent
          selected={selected.has(row.id)}
          isNew={isNewRow(row)}
          saving={savingId === row.id}
          onSelect={(checked) => onSelectRow(row.id, checked)}
          onToggle={() => onToggle(row)}
          onMinSellCommit={(value) => onMinSellCommit(row, value)}
        />
      ))}
    </>
  );
}
