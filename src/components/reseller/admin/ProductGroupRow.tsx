"use client";

import type { CatalogRow } from "./api";
import SeriesRow, { type SeriesDraft } from "./SeriesRow";

export interface CatalogGroup {
  key: string;
  name: string;
  category: string;
  image: string | null;
  kain: string | null;
  rows: CatalogRow[];
}

/** Grup satu produk (beberapa series) di tabel Produk & Harga. */
export default function ProductGroupRow({
  group,
  defaultDiscount,
  drafts,
  selected,
  busyId,
  onSelectGroup,
  onSelectRow,
  onDraftChange,
  onSaveRow,
  isNewRow,
}: {
  group: CatalogGroup;
  defaultDiscount: number;
  drafts: Record<string, SeriesDraft>;
  selected: Set<string>;
  busyId: string | null;
  onSelectGroup: (checked: boolean) => void;
  onSelectRow: (id: string, checked: boolean) => void;
  onDraftChange: (id: string, patch: Partial<SeriesDraft>) => void;
  onSaveRow: (id: string) => void;
  isNewRow: (row: CatalogRow) => boolean;
}) {
  const allSelected = group.rows.every((row) => selected.has(row.id));

  return (
    <>
      <tr className="bg-slate-50/80 border-y border-slate-200">
        <td className="px-3 py-2.5" colSpan={8}>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) => onSelectGroup(e.target.checked)}
              aria-label={`Pilih semua series ${group.name}`}
              style={{ accentColor: "#2563eb", width: 15, height: 15 }}
            />
            {group.image ? (
              <img
                src={group.image}
                alt={group.name}
                style={{ width: 34, height: 42, objectFit: "cover", borderRadius: 8, flex: "none" }}
              />
            ) : (
              <span style={{ width: 34, height: 42, borderRadius: 8, background: "#e2e8f0", flex: "none" }} />
            )}
            <div className="min-w-0">
              <p className="font-extrabold text-slate-900 text-[13px] leading-tight">
                {group.name}
                <span className="ml-2 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">{group.category}</span>
              </p>
              <p className="text-[11px] text-slate-500">
                {group.kain ? `Kain ${group.kain} · ` : ""}
                {group.rows.length} series
              </p>
            </div>
            <button
              type="button"
              onClick={() => onSelectGroup(true)}
              className="ml-auto px-2.5 py-1.5 rounded-lg text-[11.5px] font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 whitespace-nowrap"
            >
              Atur semua series produk ini
            </button>
          </div>
        </td>
      </tr>
      {group.rows.map((row) => {
        const rowDraft = drafts[row.id] || { enabled: row.reseller_enabled, minSell: row.reseller_min_sell_price };
        const dirty =
          rowDraft.enabled !== row.reseller_enabled ||
          (rowDraft.minSell ?? null) !== (row.reseller_min_sell_price ?? null);
        return (
          <SeriesRow
            key={row.id}
            row={row}
            defaultDiscount={defaultDiscount}
            draft={rowDraft}
            selected={selected.has(row.id)}
            isNew={isNewRow(row)}
            dirty={dirty}
            busy={busyId === row.id}
            onSelect={(checked) => onSelectRow(row.id, checked)}
            onDraftChange={(patch) => onDraftChange(row.id, patch)}
            onSave={() => onSaveRow(row.id)}
          />
        );
      })}
    </>
  );
}
