"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import type { CatalogRow } from "./api";
import { rupiah } from "@/lib/reseller/format";
import RupiahInput from "@/components/reseller/RupiahInput";

export type RowSaveState = "idle" | "saving" | "saved" | "error";

/** Label visibilitas produk (dipakai filter "Tampil di"). */
export function visibilityLabel(row: Pick<CatalogRow, "is_published" | "open_order_enabled">): string {
  if (row.is_published) return "Katalog website";
  if (row.open_order_enabled) return "Open Order";
  return "Tersembunyi";
}

/**
 * Satu baris series di tabel Produk & Harga.
 * Toggle & harga minimum jual SIMPAN OTOMATIS (toggle langsung, harga saat blur/Enter);
 * kolom paling kanan menampilkan spinner / centang "tersimpan" / tanda gagal.
 */
export default function SeriesRow({
  row,
  defaultDiscount,
  selected,
  isNew,
  status,
  onSelect,
  onToggle,
  onMinSellCommit,
}: {
  row: CatalogRow;
  defaultDiscount: number;
  selected: boolean;
  isNew: boolean;
  status: RowSaveState;
  onSelect: (checked: boolean) => void;
  onToggle: () => void;
  onMinSellCommit: (value: number | null) => void;
}) {
  const [minSell, setMinSell] = useState(row.reseller_min_sell_price ?? 0);
  const saving = status === "saving";

  useEffect(() => {
    setMinSell(row.reseller_min_sell_price ?? 0);
  }, [row.reseller_min_sell_price]);

  const special = row.reseller_discount_percent;
  const hasSpecial = special !== null && special !== undefined;
  const shownDiscount = hasSpecial ? Number(special) : defaultDiscount;
  const belowBuy = minSell > 0 && minSell < row.buy_price;
  const muted = !row.reseller_enabled;

  const commitMinSell = () => {
    if (saving) return;
    const next = minSell > 0 ? minSell : null;
    if (next !== (row.reseller_min_sell_price ?? null)) onMinSellCommit(next);
  };

  return (
    <tr className={`border-b border-slate-100 ${selected ? "bg-blue-50/40" : "hover:bg-slate-50/60"}`}>
      <td className="px-3 align-middle">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(e.target.checked)}
          aria-label={`Pilih series ${row.series || row.name}`}
          style={{ accentColor: "#2563eb", width: 15, height: 15 }}
        />
      </td>
      <td className="py-1.5 pl-8 pr-3 align-middle">
        <div className="flex items-center gap-1.5">
          <span
            className={`font-bold text-[12.5px] leading-tight ${muted ? "text-slate-400" : "text-slate-800"}`}
          >
            {row.series || "—"}
          </span>
          {isNew ? (
            <span className="inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-black">
              Baru
            </span>
          ) : null}
        </div>
        <div className="text-[10.5px] text-slate-400 leading-tight">{visibilityLabel(row)}</div>
      </td>
      <td
        className={`px-3 py-1.5 align-middle text-right text-[12px] font-semibold whitespace-nowrap ${
          muted ? "text-slate-400" : "text-slate-700"
        }`}
      >
        {rupiah(row.price)}
      </td>
      <td className="px-3 py-1.5 align-middle whitespace-nowrap">
        <span className={`font-bold text-[12.5px] ${muted ? "text-slate-400" : hasSpecial ? "text-slate-900" : "text-slate-500"}`}>
          {shownDiscount}%
        </span>
        <span
          className={`ml-1.5 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold align-middle ${
            hasSpecial ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"
          }`}
        >
          {hasSpecial ? "khusus" : "default"}
        </span>
      </td>
      <td
        className={`px-3 py-1.5 align-middle text-right text-[12.5px] font-bold whitespace-nowrap ${
          muted ? "text-slate-400" : "text-slate-900"
        }`}
      >
        {rupiah(row.buy_price)}
      </td>
      <td className="px-3 py-1.5 align-middle">
        <div className="w-[140px]">
          <RupiahInput
            value={minSell}
            onChange={setMinSell}
            onBlur={commitMinSell}
            compact
            disabled={saving}
            placeholder="Belum diatur"
            ariaLabel={`Harga minimum jual reseller ${row.series || row.name}`}
          />
        </div>
        {belowBuy ? (
          <p className="text-[10.5px] font-bold text-amber-600 mt-0.5">Di bawah harga beli</p>
        ) : null}
      </td>
      <td className="px-3 py-1.5 align-middle text-center">
        <button
          type="button"
          role="switch"
          aria-checked={row.reseller_enabled}
          aria-label={`Dijual ke reseller: ${row.series || row.name}`}
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
      </td>
      <td className="px-2 py-1.5 align-middle text-center" aria-live="polite">
        {status === "saving" ? (
          <Loader2 size={14} className="animate-spin text-slate-400 inline" />
        ) : status === "saved" ? (
          <Check size={14} className="text-emerald-600 inline" />
        ) : status === "error" ? (
          <AlertTriangle size={14} className="text-red-500 inline" />
        ) : (
          <span className="inline-block h-[14px]" />
        )}
      </td>
    </tr>
  );
}
