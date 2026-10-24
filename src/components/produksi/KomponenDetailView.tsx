"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  STOCK_STATUS_LABEL,
  categoryLabel,
  formatDate,
  formatQty,
  formatRupiah,
  movementLabel,
  stockStatus,
} from "@/lib/produksi";
import { produksiFetch } from "@/lib/produksi-api";
import { useProduksiAccess } from "./useAccess";
import {
  AccessGate,
  Badge,
  EmptyState,
  ErrorBox,
  PageHead,
  Spinner,
  StatCard,
  cardClass,
} from "./ui";

type ComponentDetail = {
  id: string;
  code: string;
  name: string;
  category: string;
  unit_use: string;
  unit_buy: string;
  conversion: number;
  min_stock: number;
  supplier: string;
  notes: string;
  fabric_type_name: string;
  is_active: boolean;
  stock: number;
  safe_price?: number;
  real_price?: number;
  last_buy_price?: number;
  stock_value?: number;
  price_gap?: number;
};

type Movement = {
  id: string;
  movement_date: string;
  type: string;
  qty: number;
  unit_use?: string;
  unit_price?: number;
  value?: number;
  running_balance: number;
  ref_type: string;
  notes: string;
  actor: string;
};

type PurchaseLine = {
  id: string;
  purchase_number: string;
  purchase_date: string;
  supplier: string;
  qty_buy: number;
  unit_buy: string;
  price_buy: number;
  qty_use: number;
  line_value: number;
  allocated_cost: number;
  final_unit_price: number;
};

export default function KomponenDetailView({ id }: { id: string }) {
  const access = useProduksiAccess();
  const [item, setItem] = useState<ComponentDetail | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [purchases, setPurchases] = useState<PurchaseLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const json = await produksiFetch<{
        item: ComponentDetail;
        movements: Movement[];
        purchases: PurchaseLine[];
      }>(`/api/ops/production/components/${id}`);
      setItem(json.item);
      setMovements(json.movements || []);
      setPurchases(json.purchases || []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat komponen.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (access.allowed) load();
  }, [load, access.allowed]);

  return (
    <AccessGate access={access}>
      <div className="space-y-4 min-w-0 max-w-full overflow-x-hidden">
        <Link
          href="/ops/produksi/komponen"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
        >
          <ArrowLeft size={14} /> Kembali ke Komponen &amp; Bahan
        </Link>

        <ErrorBox message={error} />
        {loading ? (
          <div className={cardClass}><Spinner /></div>
        ) : !item ? (
          <div className={cardClass}><EmptyState title="Komponen tidak ditemukan" /></div>
        ) : (
          <>
            <PageHead
              title={item.name}
              subtitle={`${item.code} · ${categoryLabel(item.category)}${item.fabric_type_name ? ` · ${item.fabric_type_name}` : ""}`}
              actions={
                <div className="flex items-center gap-2">
                  <Badge tone={item.is_active ? "blue" : "slate"}>{item.is_active ? "Aktif" : "Nonaktif"}</Badge>
                  <Badge
                    tone={
                      stockStatus(item.stock, item.min_stock) === "aman"
                        ? "green"
                        : stockStatus(item.stock, item.min_stock) === "menipis"
                          ? "amber"
                          : "red"
                    }
                  >
                    {STOCK_STATUS_LABEL[stockStatus(item.stock, item.min_stock)]}
                  </Badge>
                </div>
              }
            />

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="Stok saat ini" value={`${formatQty(item.stock)} ${item.unit_use}`} hint={`Minimum ${formatQty(item.min_stock)} ${item.unit_use}`} />
              {access.role === "owner" ? (
                <>
                  <StatCard label="Harga Real" value={`Rp ${formatRupiah(item.real_price)}`} hint="Rata-rata tertimbang termasuk ongkir" />
                  <StatCard label="Harga Aman" value={`Rp ${formatRupiah(item.safe_price)}`} hint="Patokan HPP standar" />
                  <StatCard
                    label="Nilai stok"
                    value={`Rp ${formatRupiah(item.stock_value)}`}
                    hint={`Selisih Harga Aman ${Number(item.price_gap) < 0 ? "−" : "+"}Rp ${formatRupiah(Math.abs(Number(item.price_gap) || 0))}`}
                    tone={Number(item.price_gap) < 0 ? "danger" : "default"}
                  />
                </>
              ) : (
                <StatCard label="Satuan" value={`${item.unit_use} / ${item.unit_buy}`} hint={`1 ${item.unit_buy} = ${formatQty(item.conversion)} ${item.unit_use}`} />
              )}
            </div>

            <div className={`${cardClass} p-4`}>
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-3">Informasi komponen</p>
              <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 text-sm">
                <Info label="Kategori" value={categoryLabel(item.category)} />
                <Info label="Satuan pakai" value={item.unit_use} />
                <Info label="Satuan beli" value={`${item.unit_buy} (1 = ${formatQty(item.conversion)} ${item.unit_use})`} />
                <Info label="Jenis kain" value={item.fabric_type_name || "—"} />
                <Info label="Supplier utama" value={item.supplier || "—"} />
                <Info label="Stok minimum" value={`${formatQty(item.min_stock)} ${item.unit_use}`} />
                {access.role === "owner" ? (
                  <Info label="Harga beli terakhir" value={`Rp ${formatRupiah(item.last_buy_price)} / ${item.unit_use}`} />
                ) : null}
              </dl>
              {item.notes ? (
                <p className="mt-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
                  {item.notes}
                </p>
              ) : null}
            </div>

            <div className={`${cardClass} overflow-hidden`}>
              <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
                <p className="text-sm font-bold text-slate-900 dark:text-white">Buku stok</p>
                <p className="text-[11px] text-slate-400">Append-only — koreksi lewat transaksi baru</p>
              </div>
              <div className="min-w-0 max-w-full overflow-hidden">
                <table className="w-full border-collapse table-fixed">
                  <colgroup>
                    {access.role === "owner" ? (
                      <>
                        <col className="w-[15%]" />
                        <col className="w-[35%]" />
                        <col className="w-[16%]" />
                        <col className="w-[16%]" />
                        <col className="w-[18%]" />
                      </>
                    ) : (
                      <>
                        <col className="w-[18%]" />
                        <col className="w-[48%]" />
                        <col className="w-[18%]" />
                        <col className="w-[16%]" />
                      </>
                    )}
                  </colgroup>
                  <thead>
                    <tr className="bg-[#1e3a5f]">
                      {["Tanggal", "Jenis", "Jumlah", ...(access.role === "owner" ? ["Harga satuan"] : []), "Saldo"].map((h, index) => (
                        <th key={h} className={`px-3 py-3 ${index >= 2 ? "text-right" : "text-left"} text-[11px] font-bold text-white uppercase tracking-wider leading-tight`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                    {movements.length === 0 ? (
                      <tr><td colSpan={access.role === "owner" ? 5 : 4}><EmptyState title="Belum ada pergerakan stok" description="Tambahkan lewat Stok Awal atau Pembelian Bahan." /></td></tr>
                    ) : (
                      movements.map((row, index) => (
                        <tr key={row.id} className={index % 2 === 0 ? "bg-white dark:bg-[#16171d]" : "bg-slate-50/60 dark:bg-[#1a1d28]"}>
                          <td className="px-3 py-3 align-middle text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">{formatDate(row.movement_date)}</td>
                          <td className="px-3 py-3 align-middle min-w-0">
                            <span className="block text-[13px] font-bold text-slate-800 dark:text-slate-100 truncate">{movementLabel(row.type)}</span>
                            {row.notes ? (
                              <span className="block text-[11px] text-slate-400 dark:text-slate-500 truncate" title={row.notes}>{row.notes}</span>
                            ) : null}
                          </td>
                          <td className="px-3 py-3 align-middle text-right whitespace-nowrap tabular-nums">
                            <span className={`text-[13px] font-bold ${row.qty > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                              {row.qty > 0 ? "+" : "−"}{formatQty(Math.abs(row.qty))}
                            </span>
                            <span className="ml-1 text-[11px] font-semibold text-slate-400">{row.unit_use || item.unit_use}</span>
                          </td>
                          {access.role === "owner" ? (
                            <td className="px-3 py-3 align-middle text-right text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap tabular-nums">Rp {formatRupiah(row.unit_price)}</td>
                          ) : null}
                          <td className="px-3 py-3 align-middle text-right text-[13px] font-black text-slate-900 dark:text-white whitespace-nowrap tabular-nums">{formatQty(row.running_balance)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {access.role === "owner" && purchases.length > 0 ? (
              <div className={`${cardClass} overflow-hidden`}>
                <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">Riwayat pembelian</p>
                </div>
                <div className="min-w-0 max-w-full overflow-hidden">
                  <table className="w-full border-collapse table-fixed">
                    <colgroup>
                      <col className="w-[13%]" />
                      <col className="w-[22%]" />
                      <col className="w-[19%]" />
                      <col className="w-[16%]" />
                      <col className="w-[30%]" />
                    </colgroup>
                    <thead>
                      <tr className="bg-[#1e3a5f]">
                        <th className="px-3 py-3 text-left text-[11px] font-bold text-white uppercase tracking-wider leading-tight">Tanggal</th>
                        <th className="px-3 py-3 text-left text-[11px] font-bold text-white uppercase tracking-wider leading-tight">No. Pembelian</th>
                        <th className="px-3 py-3 text-left text-[11px] font-bold text-white uppercase tracking-wider leading-tight">Supplier</th>
                        <th className="px-3 py-3 text-right text-[11px] font-bold text-white uppercase tracking-wider leading-tight">Qty beli</th>
                        <th className="px-3 py-3 text-right text-[11px] font-bold text-white uppercase tracking-wider leading-tight">Harga akhir</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                      {purchases.map((row, index) => (
                        <tr key={row.id} className={index % 2 === 0 ? "bg-white dark:bg-[#16171d]" : "bg-slate-50/60 dark:bg-[#1a1d28]"}>
                          <td className="px-3 py-3 align-middle text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">{formatDate(row.purchase_date)}</td>
                          <td className="px-3 py-3 align-middle text-[13px] font-black text-slate-900 dark:text-white whitespace-nowrap">{row.purchase_number}</td>
                          <td className="px-3 py-3 align-middle text-xs font-semibold text-slate-600 dark:text-slate-300 truncate" title={row.supplier}>{row.supplier || "—"}</td>
                          <td className="px-3 py-3 align-middle text-right text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap tabular-nums">{formatQty(row.qty_buy)} {row.unit_buy}</td>
                          <td className="px-3 py-3 align-middle text-right whitespace-nowrap tabular-nums">
                            <span className="text-[13px] font-black text-slate-900 dark:text-white">Rp {formatRupiah(row.final_unit_price)}</span>
                            <span className="block text-[10px] text-slate-400">
                              Beli Rp {formatRupiah(row.price_buy)} · Ongkir Rp {formatRupiah(row.allocated_cost)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </AccessGate>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="mt-0.5 font-semibold text-slate-800 dark:text-slate-100">{value}</dd>
    </div>
  );
}
