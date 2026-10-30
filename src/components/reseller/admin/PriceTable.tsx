"use client";

import type { CatalogRow } from "./api";
import ProductGroupRow, { type CatalogGroup } from "./ProductGroupRow";

/** Tabel Produk & Harga: header sticky, baris rapat semua kolom sejajar. */
export default function PriceTable({
  groups,
  defaultDiscount,
  selected,
  savingId,
  onSelectGroup,
  onSelectRow,
  onToggle,
  isNewRow,
}: {
  groups: CatalogGroup[];
  defaultDiscount: number;
  selected: Set<string>;
  savingId: string | null;
  onSelectGroup: (ids: string[], checked: boolean) => void;
  onSelectRow: (id: string, checked: boolean) => void;
  onToggle: (row: CatalogRow) => void;
  isNewRow: (row: CatalogRow) => boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden max-lg:overflow-x-auto">
      <table className="w-full min-w-[560px] text-left table-fixed">
        <colgroup>
          <col style={{ width: 36 }} />
          <col />
          <col style={{ width: 108 }} />
          <col style={{ width: 116 }} />
          <col style={{ width: 122 }} />
          <col style={{ width: 64 }} />
        </colgroup>
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-200 bg-slate-50">
            <th className="px-3 py-2.5 sticky top-0 z-10 bg-slate-50"> </th>
            <th className="px-3 py-2.5 sticky top-0 z-10 bg-slate-50">Series</th>
            <th className="px-3 py-2.5 sticky top-0 z-10 bg-slate-50 text-right">Harga katalog</th>
            <th className="px-3 py-2.5 sticky top-0 z-10 bg-slate-50">Diskon</th>
            <th className="px-3 py-2.5 sticky top-0 z-10 bg-slate-50 text-right">Harga beli reseller</th>
            <th className="px-3 py-2.5 sticky top-0 z-10 bg-slate-50 text-center">Dijual</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <ProductGroupRow
              key={group.key}
              group={group}
              defaultDiscount={defaultDiscount}
              selected={selected}
              savingId={savingId}
              onSelectGroup={(checked) => onSelectGroup(group.rows.map((row) => row.id), checked)}
              onSelectRow={onSelectRow}
              onToggle={onToggle}
              isNewRow={isNewRow}
            />
          ))}
          {groups.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-slate-500 text-sm font-semibold">
                Tidak ada produk yang cocok dengan filter.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <p className="px-4 py-3 text-[11.5px] text-slate-500 border-t border-slate-100 bg-slate-50/60">
        Perubahan di halaman ini hanya mengatur harga reseller. Harga katalog, stok, katalog website, dan Open Order
        tidak berubah.
      </p>
    </div>
  );
}
