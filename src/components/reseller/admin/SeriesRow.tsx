"use client";

import type { CatalogRow } from "./api";
import { rupiah } from "@/lib/reseller/format";

/** Label visibilitas produk (dipakai filter "Tampil di"). */
export function visibilityLabel(row: Pick<CatalogRow, "is_published" | "open_order_enabled">): string {
  if (row.is_published) return "Katalog website";
  if (row.open_order_enabled) return "Open Order";
  return "Tersembunyi";
}

/**
 * Satu baris series di tabel Produk & Harga.
 * Toggle "Dijual ke reseller" menyimpan otomatis; batas harga jual portal =
 * harga beli reseller (tidak ada lagi input harga minimum jual di sini).
 */
export default function SeriesRow({
  row,
  defaultDiscount,
  seriesLabel,
  selected,
  isNew,
  saving,
  onSelect,
  onToggle,
}: {
  row: CatalogRow;
  defaultDiscount: number;
  /** Nama series tampil (fallback "Standar" untuk produk satu-series tanpa nama). */
  seriesLabel: string;
  selected: boolean;
  isNew: boolean;
  saving: boolean;
  onSelect: (checked: boolean) => void;
  onToggle: () => void;
}) {
  const special = row.reseller_discount_percent;
  const hasSpecial = special !== null && special !== undefined;
  const shownDiscount = hasSpecial ? Number(special) : defaultDiscount;
  const muted = !row.reseller_enabled;

  return (
    <tr className={`border-b border-slate-100 ${selected ? "bg-blue-50/40" : "hover:bg-slate-50/60"}`}>
      <td className="px-3 py-2.5 align-middle">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(e.target.checked)}
          aria-label={`Pilih series ${seriesLabel}`}
          style={{ accentColor: "#2563eb", width: 15, height: 15 }}
        />
      </td>
      <td className="py-2.5 pl-8 pr-3 align-middle">
        <div className="flex items-center gap-1.5">
          <span
            className={`font-bold text-[12.5px] leading-tight ${muted ? "text-slate-400" : "text-slate-800"}`}
          >
            {seriesLabel}
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
        className={`px-3 py-2.5 align-middle text-right text-[12px] font-semibold whitespace-nowrap ${
          muted ? "text-slate-400" : "text-slate-700"
        }`}
      >
        {rupiah(row.price)}
      </td>
      <td className="px-3 py-2.5 align-middle whitespace-nowrap">
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
        className={`px-3 py-2.5 align-middle text-right text-[12.5px] font-bold whitespace-nowrap ${
          muted ? "text-slate-400" : "text-slate-900"
        }`}
      >
        {rupiah(row.buy_price)}
      </td>
      <td className="px-3 py-2.5 align-middle text-center">
        <button
          type="button"
          role="switch"
          aria-checked={row.reseller_enabled}
          aria-label={`Dijual ke reseller: ${seriesLabel}`}
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
    </tr>
  );
}
