"use client";

/**
 * Breakdown Pengeluaran — kartu rincian biaya yang bisa dibuka/tutup.
 *
 * Tiga komponen biaya laporan keuangan: modal barang terjual (COGS), biaya
 * Mayar (gateway + layanan), dan biaya operasional + packing. Semua angka datang
 * dari API laporan (`/api/ops/laporan`) — komponen ini hanya menampilkan, tidak
 * menghitung ulang total.
 *
 * Palet mengikuti brand monokrom Samaqu (zinc/grafit), bukan warna-warni.
 */

import { useState, type ReactNode } from "react";
import { ChevronDown, FileText, Package, Store } from "lucide-react";

export type CogsRow = {
  id: string;
  name: string;
  /** Varian (kain · warna · ukuran) — pengganti kode SKU yang tidak ada di order_items. */
  variant: string;
  qty: number;
  /** Subtotal modal baris ini (0 bila modal belum diketahui). */
  hpp: number;
  /** Unit pada baris ini yang belum punya data modal. */
  unknownQty: number;
};

export type FeeRow = { channel: string; count: number; fee: number };

export type ExpenseItemRow = { nama: string; qty: number; jumlah: number };

export type BreakdownData = {
  cogs: CogsRow[];
  fees: FeeRow[];
  packing: ExpenseItemRow[];
  operasional: ExpenseItemRow[];
};

const nfmt = (value: number | null | undefined) =>
  new Intl.NumberFormat("id-ID").format(Math.round(Number(value) || 0));

const rp = (value: number | null | undefined) => `Rp ${nfmt(value)}`;

const shareOf = (value: number, total: number) =>
  total > 0 ? `${Math.round((value / total) * 1000) / 10}%` : "—";

/* ───────────────────────── pieces ───────────────────────── */

function Card({
  icon,
  title,
  badge,
  amount,
  open,
  onToggle,
  children,
}: {
  icon: ReactNode;
  title: string;
  badge?: string | null;
  amount: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-white transition-colors duration-200 ${
        open ? "border-zinc-300" : "border-[#E4E4E7]"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#FAFAFA]"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] text-zinc-700">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-black tracking-tight text-zinc-900">{title}</span>
          {badge ? (
            <span className="mt-0.5 inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">
              {badge}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-[15px] font-black tabular-nums text-zinc-900">{amount}</span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-zinc-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? <div className="border-t border-[#F1F1F3] bg-[#FAFAFA] px-4 py-3">{children}</div> : null}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-2 text-[11px] font-semibold text-zinc-400">{text}</p>;
}

/**
 * Total kartu datang dari `summary`, rinciannya dari `breakdown`. Kalau keduanya tidak sinkron
 * (respons lama yang belum membawa `breakdown`), jangan tulis "0 transaksi" di bawah angka yang
 * bukan 0 — itu terbaca seperti angkanya salah.
 */
const STALE_TEXT = "Rincian belum termuat. Muat ulang laporan untuk melihat detailnya.";

function DetailLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-400">
      <FileText size={11} strokeWidth={2.2} />
      {children}
    </p>
  );
}

function LineRow({
  name,
  variant,
  qty,
  amount,
  share,
  note,
}: {
  name: string;
  variant?: string | null;
  qty?: number | null;
  amount: string;
  share: string;
  note?: string | null;
}) {
  return (
    <li className="flex items-center gap-2 text-[11.5px] leading-snug">
      <span className="h-1 w-1 shrink-0 rounded-full bg-zinc-400" />
      <span className="min-w-0 flex-1 break-words font-semibold text-zinc-800">
        {name}
        {variant ? <span className="ml-1 font-medium text-zinc-400">({variant})</span> : null}
        {note ? <span className="ml-1 font-medium text-zinc-400">· {note}</span> : null}
      </span>
      {qty ? (
        <span className="shrink-0 rounded-md border border-[#E4E4E7] bg-white px-1.5 py-0.5 text-[10px] font-black tabular-nums text-zinc-500">
          {nfmt(qty)}x
        </span>
      ) : null}
      <span className="w-24 shrink-0 text-right font-bold tabular-nums text-zinc-900">{amount}</span>
      <span className="w-11 shrink-0 text-right text-[10px] font-bold tabular-nums text-zinc-400">{share}</span>
    </li>
  );
}

/* ───────────────────────── main ───────────────────────── */

export default function BreakdownPengeluaran({
  data,
  hppTotal,
  feeTotal,
  packingTotal,
  operasionalTotal,
  hppComplete,
}: {
  data: BreakdownData;
  hppTotal: number;
  feeTotal: number;
  packingTotal: number;
  operasionalTotal: number;
  /** false = masih ada unit tanpa modal; angka COGS belum lengkap. */
  hppComplete: boolean;
}) {
  const [open, setOpen] = useState<"cogs" | "fees" | "expenses" | null>("cogs");
  const toggle = (key: "cogs" | "fees" | "expenses") => setOpen((prev) => (prev === key ? null : key));

  const expenseTotal = packingTotal + operasionalTotal;
  const missingQty = data.cogs.reduce((sum, row) => sum + (row.unknownQty || 0), 0);
  const feeCount = data.fees.reduce((sum, row) => sum + row.count, 0);

  return (
    <div className="space-y-2.5">
      {/* 01 — MODAL BARANG TERJUAL */}
      <Card
        icon={<Package size={16} strokeWidth={1.9} />}
        title="Modal Barang Terjual (COGS)"
        badge={hppComplete ? "Lengkap" : missingQty > 0 ? `${nfmt(missingQty)} unit tanpa modal` : "Belum lengkap"}
        amount={rp(hppTotal)}
        open={open === "cogs"}
        onToggle={() => toggle("cogs")}
      >
        {data.cogs.length === 0 ? (
          <Empty text="Belum ada barang terjual di periode ini." />
        ) : (
          <>
            <DetailLabel>Detail breakdown</DetailLabel>
            <ul className="space-y-1.5">
              {data.cogs.map((row) => (
                <LineRow
                  key={row.id}
                  name={row.name}
                  variant={row.variant || "tanpa varian"}
                  qty={row.qty}
                  amount={row.hpp > 0 ? rp(row.hpp) : "—"}
                  share={shareOf(row.hpp, hppTotal)}
                  note={row.unknownQty > 0 ? `${nfmt(row.unknownQty)} unit tanpa modal` : null}
                />
              ))}
            </ul>
          </>
        )}
      </Card>

      {/* 02 — BIAYA MAYAR */}
      <Card
        icon={<Store size={16} strokeWidth={1.9} />}
        title="Biaya Mayar"
        badge={feeCount > 0 ? `${nfmt(feeCount)} transaksi cair` : null}
        amount={rp(feeTotal)}
        open={open === "fees"}
        onToggle={() => toggle("fees")}
      >
        {data.fees.length === 0 ? (
          <Empty text={feeTotal > 0 ? STALE_TEXT : "Belum ada transaksi Mayar yang cair di periode ini."} />
        ) : (
          <>
            <DetailLabel>Detail breakdown</DetailLabel>
            <ul className="space-y-1.5">
              {data.fees.map((row) => (
                <LineRow
                  key={row.channel}
                  name={row.channel}
                  variant={`${nfmt(row.count)} transaksi`}
                  amount={rp(row.fee)}
                  share={shareOf(row.fee, feeTotal)}
                />
              ))}
            </ul>
          </>
        )}
      </Card>

      {/* 03 — BIAYA OPERASIONAL & PACKING */}
      <Card
        icon={<FileText size={16} strokeWidth={1.9} />}
        title="Operating Expenses"
        badge={`${
          data.packing.length + data.operasional.length > 0
            ? `${nfmt(data.packing.length + data.operasional.length)} pengeluaran`
            : expenseTotal > 0
              ? "rincian belum termuat"
              : "0 pengeluaran"
        }`}
        amount={rp(expenseTotal)}
        open={open === "expenses"}
        onToggle={() => toggle("expenses")}
      >
        {data.packing.length === 0 && data.operasional.length === 0 ? (
          <Empty text={expenseTotal > 0 ? STALE_TEXT : "Belum ada pengeluaran tercatat di periode ini."} />
        ) : (
          <>
            <DetailLabel>Detail breakdown</DetailLabel>

            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between gap-2 border-b border-[#EDEDF0] pb-1.5">
                  <span className="flex items-center gap-1.5 text-[11px] font-black text-zinc-800">
                    <Package size={12} strokeWidth={2} className="text-zinc-400" />
                    Packing
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-[11.5px] font-black tabular-nums text-zinc-900">{rp(packingTotal)}</span>
                    <span className="w-11 text-right text-[10px] font-bold tabular-nums text-zinc-400">
                      {shareOf(packingTotal, expenseTotal)}
                    </span>
                  </span>
                </div>
                {data.packing.length === 0 ? (
                  <Empty text="Tidak ada biaya packing." />
                ) : (
                  <ul className="mt-1.5 space-y-1.5">
                    {data.packing.map((row, index) => (
                      <LineRow
                        key={`${row.nama}-${index}`}
                        name={row.nama}
                        qty={row.qty}
                        amount={rp(row.jumlah)}
                        share=""
                      />
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 border-b border-[#EDEDF0] pb-1.5">
                  <span className="flex items-center gap-1.5 text-[11px] font-black text-zinc-800">
                    <Store size={12} strokeWidth={2} className="text-zinc-400" />
                    Operasional
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-[11.5px] font-black tabular-nums text-zinc-900">{rp(operasionalTotal)}</span>
                    <span className="w-11 text-right text-[10px] font-bold tabular-nums text-zinc-400">
                      {shareOf(operasionalTotal, expenseTotal)}
                    </span>
                  </span>
                </div>
                {data.operasional.length === 0 ? (
                  <Empty text="Tidak ada biaya operasional." />
                ) : (
                  <ul className="mt-1.5 space-y-1.5">
                    {data.operasional.map((row, index) => (
                      <LineRow key={`${row.nama}-${index}`} name={row.nama} amount={rp(row.jumlah)} share="" />
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
