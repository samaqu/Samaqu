"use client";

import type { CatalogRow } from "./api";
import ProductGroupRow, { type CatalogGroup } from "./ProductGroupRow";
import type { SeriesDraft } from "./SeriesRow";

/** Tabel Produk & Harga: header kolom + grup produk + catatan bawah. */
export default function PriceTable({
  groups,
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
  groups: CatalogGroup[];
  defaultDiscount: number;
  drafts: Record<string, SeriesDraft>;
  selected: Set<string>;
  busyId: string | null;
  onSelectGroup: (ids: string[], checked: boolean) => void;
  onSelectRow: (id: string, checked: boolean) => void;
  onDraftChange: (id: string, patch: Partial<SeriesDraft>) => void;
  onSaveRow: (id: string) => void;
  isNewRow: (row: CatalogRow) => boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-200 bg-slate-50">
              <th className="px-3 py-2.5 w-[38px]"> </th>
              <th className="px-3 py-2.5">Series</th>
              <th className="px-3 py-2.5">Harga katalog</th>
              <th className="px-3 py-2.5">Diskon</th>
              <th className="px-3 py-2.5">Harga beli reseller</th>
              <th className="px-3 py-2.5">Min jual reseller</th>
              <th className="px-3 py-2.5">Dijual</th>
              <th className="px-3 py-2.5 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <ProductGroupRow
                key={group.key}
                group={group}
                defaultDiscount={defaultDiscount}
                drafts={drafts}
                selected={selected}
                busyId={busyId}
                onSelectGroup={(checked) => onSelectGroup(group.rows.map((row) => row.id), checked)}
                onSelectRow={onSelectRow}
                onDraftChange={onDraftChange}
                onSaveRow={onSaveRow}
                isNewRow={isNewRow}
              />
            ))}
            {groups.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-500 text-sm font-semibold">
                  Tidak ada produk yang cocok dengan filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-3 text-[11.5px] text-slate-500 border-t border-slate-100 bg-slate-50/60">
        Perubahan di halaman ini hanya mengatur harga reseller. Harga katalog, stok, katalog website, dan Open Order
        tidak berubah.
      </p>
    </div>
  );
}
