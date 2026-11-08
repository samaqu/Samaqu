"use client";

import { Pencil, Receipt, Trash2 } from "lucide-react";
import { angka, rupiah, tanggalLabel } from "./helpers";
import type { ExpenseItem, ExpenseRow, PengeluaranTipe } from "./types";

const headClass = "px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-wider text-white/60";

function Aksi({
  row,
  onEdit,
  onDelete,
}: {
  row: ExpenseRow;
  onEdit: (row: ExpenseRow) => void;
  onDelete: (row: ExpenseRow) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={() => onEdit(row)}
        aria-label={`Ubah pengeluaran ${row.nama_barang || row.kategori || ""}`.trim()}
        className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
      >
        <Pencil size={14} />
      </button>
      <button
        type="button"
        onClick={() => onDelete(row)}
        aria-label={`Hapus pengeluaran ${row.nama_barang || row.kategori || ""}`.trim()}
        className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

/** Tabel detail pengeluaran (kolom mengikuti tab aktif). */
export default function PengeluaranTable({
  tipe,
  rows,
  items,
  loading,
  onEdit,
  onDelete,
}: {
  tipe: PengeluaranTipe;
  rows: ExpenseRow[];
  items: ExpenseItem[];
  loading?: boolean;
  onEdit: (row: ExpenseRow) => void;
  onDelete: (row: ExpenseRow) => void;
}) {
  const satuanOf = (row: ExpenseRow) => {
    const item = items.find((entry) => entry.id === row.item_id);
    return item?.satuan || "";
  };

  const kolom = tipe === "packing" ? 6 : 5;

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200">
      <table className="w-full min-w-[680px] border-collapse text-sm">
        <thead className="bg-[#18181b]">
          <tr>
            <th className={`${headClass} whitespace-nowrap`}>Tanggal</th>
            {tipe === "packing" ? (
              <>
                <th className={headClass}>Barang</th>
                <th className={`${headClass} text-right`}>Qty</th>
                <th className={`${headClass} hidden text-right lg:table-cell`}>Harga Satuan</th>
                <th className={`${headClass} text-right`}>Total</th>
              </>
            ) : (
              <>
                <th className={headClass}>Kategori</th>
                <th className={`${headClass} hidden lg:table-cell`}>Metode Bayar</th>
                <th className={`${headClass} text-right`}>Jumlah</th>
              </>
            )}
            <th className={`${headClass} text-right`}>Aksi</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            [0, 1, 2, 3].map((index) => (
              <tr key={`skeleton-${index}`} className="border-t border-slate-100">
                {Array.from({ length: kolom }).map((_, cell) => (
                  <td key={cell} className="px-3 py-3.5">
                    <div className="h-4 w-full max-w-[120px] animate-pulse rounded-md bg-slate-100" />
                  </td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={kolom} className="px-6 py-14 text-center">
                <div className="flex flex-col items-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50">
                    <Receipt size={22} className="text-slate-400" />
                  </div>
                  <p className="text-sm font-bold text-slate-700">
                    Belum ada pengeluaran {tipe === "packing" ? "packing" : "operasional"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Catat pengeluaran pertama lewat tombol Tambah di atas.
                  </p>
                </div>
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="whitespace-nowrap px-3 py-3 text-xs font-semibold text-slate-600">
                  {tanggalLabel(row.tanggal)}
                </td>

                {tipe === "packing" ? (
                  <>
                    <td className="px-3 py-3 text-sm font-bold text-slate-900">
                      {row.nama_barang || "-"}
                      {satuanOf(row) ? (
                        <span className="ml-1.5 text-[11px] font-semibold text-slate-400">
                          / {satuanOf(row)}
                        </span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-semibold tabular-nums text-slate-700">
                      {angka(row.qty ?? 0)}
                      {satuanOf(row) ? <span className="ml-1 text-[11px] text-slate-400">{satuanOf(row)}</span> : null}
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-slate-600 lg:table-cell">
                      {rupiah(row.harga_satuan)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-bold tabular-nums text-slate-900">
                      {rupiah(row.jumlah)}
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-3">
                      <span className="inline-flex rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700">
                        {row.kategori || "-"}
                      </span>
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-3 text-xs font-semibold text-slate-500 lg:table-cell">
                      {row.metode_bayar || "-"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-bold tabular-nums text-slate-900">
                      {rupiah(row.jumlah)}
                    </td>
                  </>
                )}

                <td className="px-3 py-3">
                  <Aksi row={row} onEdit={onEdit} onDelete={onDelete} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
