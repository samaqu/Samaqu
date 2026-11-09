"use client";

/**
 * Rincian Biaya Free Gift — HPP barang yang dibagikan gratis pada periode laporan.
 *
 * Barisnya datang dari `GET /api/ops/laporan` → `summary.freeGift` (baris pesanan berharga Rp0
 * dan cover hanger yang nilainya tertutup diskon pesanan). Komponen ini hanya menampilkan;
 * biayanya sudah dihitung server dengan HPP per unit yang sama dengan modal barang terjual,
 * jadi tidak menambah atau mengurangi total HPP di kartu atas.
 *
 * Palet mengikuti brand monokrom Samaqu (zinc/grafit), sama seperti kartu laporan lainnya.
 */

import { Gift } from "lucide-react";
import CountUp from "@/components/admin/CountUp";

export type FreeGiftRow = {
  id: string;
  /** SKU katalog produk (`products.sku`); kosong bila produk tidak punya SKU. */
  sku: string;
  name: string;
  /** Series produk (`order_items.series` / nama item); kosong untuk produk tanpa series. */
  series: string;
  /** Varian baris pesanan (warna/ukuran), mis. "Cover Thobe + Hanger · ALL SIZE". */
  variant: string;
  /** Unit yang dibagikan gratis pada periode ini. */
  qty: number;
  /** HPP per unit — 0 berarti modal produk belum diisi di katalog. */
  unitHpp: number;
  /** qty × HPP/unit. */
  cost: number;
  /** Unit pada baris ini yang belum punya data modal. */
  unknownQty: number;
};

export type FreeGiftData = {
  items: FreeGiftRow[];
  /** Total biaya promosi (Rp). */
  total: number;
  /** Total unit yang dibagikan gratis. */
  qty: number;
  /** Unit yang belum punya HPP. */
  unknownQty?: number;
};

const nfmt = (value: number | null | undefined) =>
  new Intl.NumberFormat("id-ID").format(Math.round(Number(value) || 0));

const rp = (value: number | null | undefined) => `Rp ${nfmt(value)}`;

export default function RincianFreeGift({ data }: { data?: FreeGiftData }) {
  const items = data?.items || [];
  const total = Number(data?.total) || 0;
  const totalQty = Number(data?.qty) || 0;

  /**
   * Porsi baris terhadap total promosi. Modal produk masih kosong di katalog (Rp 0) pada
   * banyak periode, jadi porsinya jatuh ke jumlah unit supaya kolomnya tidak penuh "—".
   */
  const shareOf = (row: FreeGiftRow) => {
    if (total > 0) return Math.round((row.cost / total) * 1000) / 10;
    if (totalQty > 0) return Math.round((row.qty / totalQty) * 1000) / 10;
    return 0;
  };

  return (
    <section className="lpr-rise rounded-3xl border border-[#E4E4E7] bg-[#EFEFF1] p-5 shadow-sm md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-zinc-900 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <Gift size={18} strokeWidth={1.9} />
          </span>
          <div>
            <h2 className="text-sm font-black tracking-tight text-zinc-900">Rincian Biaya Free Gift</h2>
            <p className="mt-0.5 text-xs font-medium text-zinc-500">
              Detail HPP produk yang dibagikan sebagai free gift/promosi.
            </p>
          </div>
        </div>
        {totalQty > 0 ? (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#E4E4E7] bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">
            {nfmt(totalQty)} unit dibagikan
          </span>
        ) : null}
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-[#E4E4E7] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="border-b border-[#E4E4E7] bg-[#FAFAFA] text-[10px] font-black uppercase tracking-[0.1em] text-zinc-500">
                <th className="w-[1%] px-3 py-3 text-center">#</th>
                <th className="w-[1%] whitespace-nowrap px-3 py-3">SKU</th>
                <th className="px-3 py-3">Nama Produk</th>
                <th className="w-[1%] whitespace-nowrap px-3 py-3 text-right">Qty Dibagikan</th>
                <th className="w-[1%] whitespace-nowrap px-3 py-3 text-right">HPP/Unit</th>
                <th className="w-[1%] whitespace-nowrap px-3 py-3 text-right">Total Biaya</th>
                <th className="w-[1%] whitespace-nowrap px-3 py-3 text-right">% Dari Total Promosi</th>
              </tr>
            </thead>
            <tbody className="align-top">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-xs font-semibold text-zinc-500">
                    Belum ada data free gift pada periode ini
                  </td>
                </tr>
              ) : (
                items.map((row, index) => (
                  <tr key={row.id} className="border-b border-[#F1F1F3] last:border-0">
                    <td className="px-3 py-3 text-center text-[11px] font-bold tabular-nums text-zinc-400">
                      {index + 1}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-[11px] font-bold tabular-nums text-zinc-600">
                      {row.sku || "—"}
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-xs font-bold leading-snug text-zinc-900">{row.name}</p>
                      {row.variant ? (
                        <p className="mt-0.5 text-[10px] font-semibold text-zinc-500">{row.variant}</p>
                      ) : null}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {row.series ? (
                          <span className="rounded-full border border-[#E4E4E7] bg-[#FAFAFA] px-1.5 py-0.5 text-[10px] font-bold text-zinc-600">
                            {row.series}
                          </span>
                        ) : null}
                        {row.unknownQty > 0 ? (
                          <span className="text-[10px] font-semibold text-zinc-400">
                            {nfmt(row.unknownQty)} unit tanpa HPP
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-xs font-bold tabular-nums text-zinc-900">
                      {nfmt(row.qty)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-xs font-semibold tabular-nums text-zinc-600">
                      {row.unitHpp > 0 ? rp(row.unitHpp) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-xs font-black tabular-nums text-zinc-900">
                      {row.cost > 0 ? rp(row.cost) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-xs font-bold tabular-nums text-zinc-600">
                      {`${shareOf(row).toLocaleString("id-ID")}%`}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E4E4E7] bg-[#FAFAFA] px-4 py-3">
          <span className="text-[11px] font-black uppercase tracking-[0.1em] text-zinc-600">
            Total Biaya Promosi
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-black tabular-nums text-zinc-900">
              <CountUp value={total} format={rp} />
            </span>
            <span className="rounded-full border border-[#E4E4E7] bg-white px-2 py-0.5 text-[10px] font-black tabular-nums text-zinc-500">
              {nfmt(totalQty)} unit
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
