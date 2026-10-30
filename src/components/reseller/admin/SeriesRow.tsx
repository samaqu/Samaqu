"use client";

import { useEffect, useState } from "react";
import type { CatalogRow } from "./api";
import { rupiah } from "@/lib/reseller/format";
import RupiahInput from "@/components/reseller/RupiahInput";

function titleOf(row: CatalogRow, isSingle: boolean): string {
  if (isSingle) {
    return row.series ? `${row.name} — ${row.series}` : row.name;
  }
  return row.series || "—";
}

function discountOf(row: CatalogRow, defaultDiscount: number) {
  const special = row.reseller_discount_percent;
  const hasSpecial = special !== null && special !== undefined;
  return {
    hasSpecial,
    shown: hasSpecial ? Number(special) : defaultDiscount,
  };
}

/** Draft + commit harga minimum jual (auto-save saat blur/Enter). */
function useMinSell(
  row: CatalogRow,
  saving: boolean,
  onCommit: (value: number | null) => void
) {
  const [value, setValue] = useState(row.reseller_min_sell_price ?? 0);

  useEffect(() => {
    setValue(row.reseller_min_sell_price ?? 0);
  }, [row.id, row.reseller_min_sell_price]);

  const commit = () => {
    if (saving) return;
    const next = value > 0 ? value : null;
    if (next !== (row.reseller_min_sell_price ?? null)) onCommit(next);
  };

  return { value, setValue, commit };
}

function NewBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-black leading-none">
      Baru
    </span>
  );
}

function DiscountCell({ row, defaultDiscount, muted }: { row: CatalogRow; defaultDiscount: number; muted: boolean }) {
  const { hasSpecial, shown } = discountOf(row, defaultDiscount);
  return (
    <span className="whitespace-nowrap">
      <span className={`font-bold text-[12.5px] ${muted ? "text-slate-400" : hasSpecial ? "text-slate-900" : "text-slate-500"}`}>
        {shown}%
      </span>
      <span
        className={`ml-1.5 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold align-middle ${
          hasSpecial ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"
        }`}
      >
        {hasSpecial ? "khusus" : "default"}
      </span>
    </span>
  );
}

function MinSellField({
  row,
  saving,
  onCommit,
  compactLabel,
}: {
  row: CatalogRow;
  saving: boolean;
  onCommit: (value: number | null) => void;
  compactLabel?: boolean;
}) {
  const { value, setValue, commit } = useMinSell(row, saving, onCommit);
  const belowBuy = value > 0 && value < row.buy_price;
  return (
    <div>
      <RupiahInput
        value={value}
        onChange={setValue}
        onBlur={commit}
        compact
        disabled={saving}
        placeholder={
          row.reseller_min_sell_price == null
            ? `${row.price.toLocaleString("id-ID")} (harga katalog)`
            : "Belum diatur"
        }
        ariaLabel={`Harga minimum jual reseller ${row.series || row.name}`}
      />
      {belowBuy ? (
        <p className={`text-[10.5px] font-bold text-amber-600 ${compactLabel ? "" : "mt-0.5"}`}>
          Di bawah harga beli (batas tetap harga beli)
        </p>
      ) : null}
    </div>
  );
}

/** Satu baris series (tabel desktop). */
export default function SeriesRow({
  row,
  defaultDiscount,
  seriesLabel,
  isSingle,
  indent,
  selected,
  isNew,
  saving,
  onSelect,
  onToggle,
  onMinSellCommit,
}: {
  row: CatalogRow;
  defaultDiscount: number;
  seriesLabel?: string;
  isSingle: boolean;
  indent: boolean;
  selected: boolean;
  isNew: boolean;
  saving: boolean;
  onSelect: (checked: boolean) => void;
  onToggle: () => void;
  onMinSellCommit: (value: number | null) => void;
}) {
  const muted = !row.reseller_enabled;
  const title = seriesLabel || titleOf(row, isSingle);

  return (
    <tr className={`border-b border-slate-100 ${selected ? "bg-blue-50/40" : "hover:bg-slate-50/60"}`}>
      <td className="px-2 py-1.5 align-middle">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(e.target.checked)}
          aria-label={`Pilih series ${title}`}
          style={{ accentColor: "#2563eb", width: 15, height: 15 }}
        />
      </td>
      <td className={`py-1.5 pr-3 align-middle ${indent ? "pl-7" : "pl-3"}`}>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`font-bold text-[12.5px] leading-tight ${muted ? "text-slate-400" : "text-slate-800"}`}>
            {title}
          </span>
          <NewBadge show={isNew} />
        </div>
      </td>
      <td className={`px-2 py-1.5 align-middle text-right text-[12px] font-semibold whitespace-nowrap ${muted ? "text-slate-400" : "text-slate-700"}`}>
        {rupiah(row.price)}
      </td>
      <td className="px-2 py-1.5 align-middle">
        <DiscountCell row={row} defaultDiscount={defaultDiscount} muted={muted} />
      </td>
      <td className={`px-2 py-1.5 align-middle text-right text-[12.5px] font-bold whitespace-nowrap ${muted ? "text-slate-400" : "text-slate-900"}`}>
        {rupiah(row.buy_price)}
      </td>
      <td className="px-2 py-1.5 align-middle">
        <div className="w-[184px]">
          <MinSellField row={row} saving={saving} onCommit={onMinSellCommit} />
        </div>
      </td>
      <td className="px-2 py-1.5 align-middle text-center">
        <DijualToggle row={row} saving={saving} onToggle={onToggle} label={title} />
      </td>
    </tr>
  );
}

/** Versi kartu ringkas untuk mobile (tanpa scroll horizontal). */
export function SeriesCard({
  row,
  defaultDiscount,
  seriesLabel,
  isSingle,
  selected,
  isNew,
  saving,
  onSelect,
  onToggle,
  onMinSellCommit,
}: {
  row: CatalogRow;
  defaultDiscount: number;
  seriesLabel?: string;
  isSingle: boolean;
  selected: boolean;
  isNew: boolean;
  saving: boolean;
  onSelect: (checked: boolean) => void;
  onToggle: () => void;
  onMinSellCommit: (value: number | null) => void;
}) {
  const muted = !row.reseller_enabled;
  const title = seriesLabel || titleOf(row, isSingle);

  return (
    <div className={`rounded-xl border px-3 py-2.5 ${selected ? "border-blue-200 bg-blue-50/40" : "border-slate-200 bg-white"}`}>
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(e.target.checked)}
          aria-label={`Pilih series ${title}`}
          style={{ accentColor: "#2563eb", width: 15, height: 15, marginTop: 2 }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`font-bold text-[13px] leading-tight ${muted ? "text-slate-400" : "text-slate-800"}`}>
              {title}
            </span>
            <NewBadge show={isNew} />
          </div>
        </div>
        <DijualToggle row={row} saving={saving} onToggle={onToggle} label={title} />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11.5px]">
        <div>
          <span className="block text-[9.5px] uppercase tracking-wider font-bold text-slate-400">Harga katalog</span>
          <span className={`font-bold ${muted ? "text-slate-400" : "text-slate-700"}`}>{rupiah(row.price)}</span>
        </div>
        <div>
          <span className="block text-[9.5px] uppercase tracking-wider font-bold text-slate-400">Diskon</span>
          <DiscountCell row={row} defaultDiscount={defaultDiscount} muted={muted} />
        </div>
        <div>
          <span className="block text-[9.5px] uppercase tracking-wider font-bold text-slate-400">Harga beli</span>
          <span className={`font-bold ${muted ? "text-slate-400" : "text-slate-900"}`}>{rupiah(row.buy_price)}</span>
        </div>
        <div>
          <span className="block text-[9.5px] uppercase tracking-wider font-bold text-slate-400">Harga minimum jual</span>
          <MinSellField row={row} saving={saving} onCommit={onMinSellCommit} compactLabel />
        </div>
      </div>
    </div>
  );
}

function DijualToggle({
  row,
  saving,
  onToggle,
  label,
}: {
  row: CatalogRow;
  saving: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={row.reseller_enabled}
      aria-label={`Dijual ke reseller: ${label}`}
      disabled={saving}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-60 ${
        row.reseller_enabled ? "bg-blue-600" : "bg-slate-300"
      }`}
    >
      <span
        className="inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow transition-transform"
        style={{ transform: row.reseller_enabled ? "translateX(22px)" : "translateX(3px)" }}
      />
    </button>
  );
}
