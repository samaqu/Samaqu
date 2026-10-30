"use client";

import type { CatalogRow } from "./api";
import ProductGroupRow, { type CatalogGroup } from "./ProductGroupRow";
import MobilePriceList from "./MobilePriceList";

/** Tabel Produk & Harga: desktop tabel rapat, mobile kartu per series. */
export default function PriceTable({
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
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <p className="px-4 py-2.5 text-[11.5px] text-slate-500 border-b border-slate-100 bg-slate-50/60">
        Harga minimum jual: batas terendah harga jual reseller. Kosong = sama dengan harga katalog.
        Tidak bisa di bawah harga beli reseller.
      </p>
      <div className="hidden md:block">
        <table className="w-full text-left table-fixed">
          <colgroup>
            <col style={{ width: 34 }} />
            <col />
            <col style={{ width: 100 }} />
            <col style={{ width: 112 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 200 }} />
            <col style={{ width: 62 }} />
          </colgroup>
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-200 bg-slate-50">
              <th className="px-2 py-2.5 sticky top-0 z-10 bg-slate-50"> </th>
              <th className="px-2 py-2.5 sticky top-0 z-10 bg-slate-50 whitespace-nowrap">Series</th>
              <th className="px-2 py-2.5 sticky top-0 z-10 bg-slate-50 text-right whitespace-nowrap">Harga katalog</th>
              <th className="px-2 py-2.5 sticky top-0 z-10 bg-slate-50 whitespace-nowrap">Diskon</th>
              <th className="px-2 py-2.5 sticky top-0 z-10 bg-slate-50 text-right whitespace-nowrap">Harga beli reseller</th>
              <th
                className="px-2 py-2.5 sticky top-0 z-10 bg-slate-50 whitespace-nowrap"
                title="Batas terendah harga jual reseller. Kosong = harga katalog; tidak bisa di bawah harga beli."
              >
                Harga minimum jual
              </th>
              <th className="px-2 py-2.5 sticky top-0 z-10 bg-slate-50 text-center whitespace-nowrap">Dijual</th>
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
                onMinSellCommit={onMinSellCommit}
                isNewRow={isNewRow}
              />
            ))}
            {groups.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500 text-sm font-semibold">
                  Tidak ada produk yang cocok dengan filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="md:hidden p-3">
        {groups.length === 0 ? (
          <p className="py-8 text-center text-slate-500 text-sm font-semibold">
            Tidak ada produk yang cocok dengan filter.
          </p>
        ) : (
          <MobilePriceList
            groups={groups}
            defaultDiscount={defaultDiscount}
            selected={selected}
            savingId={savingId}
            onSelectGroup={onSelectGroup}
            onSelectRow={onSelectRow}
            onToggle={onToggle}
            onMinSellCommit={onMinSellCommit}
            isNewRow={isNewRow}
          />
        )}
      </div>

      <p className="px-4 py-3 text-[11.5px] text-slate-500 border-t border-slate-100 bg-slate-50/60">
        Hanya produk Katalog website yang bisa dijual reseller. Harga minimum jual membatasi harga
        jual portal; kosong = harga katalog, dan angka di bawah harga beli tetap dibatasi harga beli.
      </p>
    </div>
  );
}
