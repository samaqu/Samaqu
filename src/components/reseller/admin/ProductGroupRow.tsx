"use client";

import type { CatalogRow } from "./api";
import ProductThumb from "./ProductThumb";
import SeriesRow, { type RowSaveState } from "./SeriesRow";

export interface CatalogGroup {
  key: string;
  name: string;
  category: string;
  thumbnail: string | null;
  kain: string | null;
  rows: CatalogRow[];
}

/** Grup satu produk (beberapa series) di tabel Produk & Harga. */
export default function ProductGroupRow({
  group,
  defaultDiscount,
  selected,
  rowStatus,
  onSelectGroup,
  onSelectRow,
  onToggle,
  onMinSellCommit,
  isNewRow,
}: {
  group: CatalogGroup;
  defaultDiscount: number;
  selected: Set<string>;
  rowStatus: Record<string, RowSaveState>;
  onSelectGroup: (checked: boolean) => void;
  onSelectRow: (id: string, checked: boolean) => void;
  onToggle: (row: CatalogRow) => void;
  onMinSellCommit: (row: CatalogRow, value: number | null) => void;
  isNewRow: (row: CatalogRow) => boolean;
}) {
  const allSelected = group.rows.every((row) => selected.has(row.id));

  return (
    <>
      <tr className="bg-slate-50 border-y border-slate-200">
        <td className="px-3 py-2 align-middle" colSpan={8}>
          <div className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) => onSelectGroup(e.target.checked)}
              aria-label={`Pilih semua series ${group.name}`}
              style={{ accentColor: "#2563eb", width: 15, height: 15 }}
            />
            <ProductThumb src={group.thumbnail} className="w-9 h-[42px] rounded-lg flex-none" />
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
          selected={selected.has(row.id)}
          isNew={isNewRow(row)}
          status={rowStatus[row.id] || "idle"}
          onSelect={(checked) => onSelectRow(row.id, checked)}
          onToggle={() => onToggle(row)}
          onMinSellCommit={(value) => onMinSellCommit(row, value)}
        />
      ))}
    </>
  );
}
