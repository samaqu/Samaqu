"use client";

import { useState } from "react";
import type { CatalogRow } from "./api";
import { rupiah } from "@/lib/reseller/format";
import RupiahInput from "@/components/reseller/RupiahInput";

export interface SeriesDraft {
  enabled: boolean;
  minSell: number | null;
}

/** Satu baris series di tabel Produk & Harga. */
export default function SeriesRow({
  row,
  defaultDiscount,
  draft,
  selected,
  isNew,
  dirty,
  busy,
  onSelect,
  onDraftChange,
  onSave,
}: {
  row: CatalogRow;
  defaultDiscount: number;
  draft: SeriesDraft;
  selected: boolean;
  isNew: boolean;
  dirty: boolean;
  busy: boolean;
  onSelect: (checked: boolean) => void;
  onDraftChange: (patch: Partial<SeriesDraft>) => void;
  onSave: () => void;
}) {
  const special = row.reseller_discount_percent;
  const hasSpecial = special !== null && special !== undefined;
  const shownDiscount = hasSpecial ? Number(special) : defaultDiscount;
  const minSell = draft.minSell ?? 0;
  const belowBuy = minSell > 0 && minSell < row.buy_price;

  return (
    <tr className={`border-b border-slate-100 ${selected ? "bg-blue-50/40" : ""}`}>
      <td className="px-3 py-2.5 align-top">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(e.target.checked)}
          aria-label={`Pilih series ${row.series || row.name}`}
          style={{ accentColor: "#2563eb", width: 15, height: 15 }}
        />
      </td>
      <td className="px-3 py-2.5 align-top">
        <div className="font-bold text-slate-800 text-[12.5px] leading-tight">
          {row.series || "—"}
          {isNew ? (
            <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-black align-middle">
              Baru
            </span>
          ) : null}
        </div>
        {!row.is_published ? (
          <div className="text-[10.5px] text-slate-400 mt-0.5">Draft (tidak tampil di katalog website)</div>
        ) : null}
      </td>
      <td className="px-3 py-2.5 align-top text-[12px] font-semibold text-slate-700 whitespace-nowrap">
        {rupiah(row.price)}
      </td>
      <td className="px-3 py-2.5 align-top whitespace-nowrap">
        <span className={`font-bold text-[12.5px] ${hasSpecial ? "text-slate-900" : "text-slate-400"}`}>
          {shownDiscount}%
        </span>
        <span
          className={`ml-1.5 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
            hasSpecial ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"
          }`}
        >
          {hasSpecial ? "khusus" : "default"}
        </span>
      </td>
      <td className="px-3 py-2.5 align-top text-[12px] font-bold text-slate-900 whitespace-nowrap">
        {rupiah(row.buy_price)}
      </td>
      <td className="px-3 py-2 align-top" style={{ minWidth: 150 }}>
        <RupiahInput
          value={minSell}
          onChange={(value) => onDraftChange({ minSell: value > 0 ? value : null })}
          placeholder="Kosong"
          ariaLabel="Harga minimum jual reseller"
        />
        {belowBuy ? <p className="text-[10.5px] font-bold text-amber-600 mt-1">Di bawah harga beli</p> : null}
      </td>
      <td className="px-3 py-2.5 align-top">
        <button
          type="button"
          role="switch"
          aria-checked={draft.enabled}
          aria-label={`Dijual ke reseller: ${row.series || row.name}`}
          onClick={() => onDraftChange({ enabled: !draft.enabled })}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            draft.enabled ? "bg-blue-600" : "bg-slate-300"
          }`}
        >
          <span
            className="inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow transition-transform"
            style={{ transform: draft.enabled ? "translateX(22px)" : "translateX(3px)" }}
          />
        </button>
      </td>
      <td className="px-3 py-2.5 align-top text-right whitespace-nowrap">
        {dirty ? (
          <button
            type="button"
            onClick={onSave}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg text-[12px] font-bold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "…" : "Simpan"}
          </button>
        ) : (
          <span className="text-[11px] text-slate-300">—</span>
        )}
      </td>
    </tr>
  );
}
