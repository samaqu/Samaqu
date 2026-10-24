"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Riwayat pergerakan stok dari tabel `stock_movements` (retur, tukar size, penyesuaian,
 * dan Stok Opname). Dipakai di tab Barang Masuk (direction "in") dan Barang Keluar ("out")
 * supaya entri "Opname SO-xxx" terlihat jelas dan bisa difilter per sumber.
 */

type Movement = {
  id: string;
  product_id: string;
  product_name: string;
  color: string | null;
  size: string | null;
  qty: number;
  direction: "in" | "out";
  source: string;
  before_stock: number | null;
  after_stock: number | null;
  actor_name: string | null;
  notes: string | null;
  created_at: string;
};

const SOURCE_LABEL: Record<string, string> = {
  opname: "Opname",
  return: "Retur",
  tukar_size: "Tukar size",
  batal: "Pembatalan",
  manual: "Manual",
  koreksi_produksi: "Koreksi Produksi",
};

function sourceLabel(source?: string | null): string {
  const key = String(source || "").trim();
  return SOURCE_LABEL[key] || key || "-";
}

export default function StockMovementsPanel({ direction }: { direction: "in" | "out" }) {
  const [items, setItems] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [source, setSource] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/ops/stock-movements?direction=${direction}&limit=200`, {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Gagal memuat riwayat stok.");
      setItems(json?.items || []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat riwayat stok.");
    } finally {
      setLoading(false);
    }
  }, [direction]);

  useEffect(() => {
    load();
  }, [load]);

  const sources = useMemo(
    () => Array.from(new Set(items.map((m) => String(m.source || "").trim()).filter(Boolean))),
    [items],
  );
  const rows = useMemo(
    () => (source === "all" ? items : items.filter((m) => String(m.source) === source)),
    [items, source],
  );

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div>
          <p className="text-sm font-bold text-gray-900 dark:text-white">Riwayat pergerakan stok</p>
          <p className="text-[11px] text-gray-500 dark:text-slate-400">
            Termasuk penyesuaian Stok Opname (tercatat sebagai “Opname SO-xxx”).
          </p>
        </div>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-[13px] font-semibold text-gray-700 dark:text-slate-200"
          title="Saring per sumber pergerakan"
        >
          <option value="all">Semua sumber</option>
          {sources.map((value) => (
            <option key={value} value={value}>{sourceLabel(value)}</option>
          ))}
        </select>
      </div>

      <div className="bg-white dark:bg-[#1a1d28] rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[820px]">
            <thead>
              <tr className="bg-[#1e3a5f]">
                {["Tanggal", "Produk", "Kain/Warna", "Ukuran", "Perubahan", "Stok", "Keterangan", "Oleh"].map((head) => (
                  <th
                    key={head}
                    className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-white whitespace-nowrap"
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">Memuat…</td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-red-600">{error}</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">
                    Belum ada pergerakan stok {source === "all" ? "" : `dari sumber ${sourceLabel(source)}`}.
                  </td>
                </tr>
              ) : (
                rows.map((m, index) => (
                  <tr
                    key={m.id}
                    className={`${index % 2 === 0 ? "bg-white dark:bg-[#16171d]" : "bg-blue-50/30 dark:bg-[#1a1d28]"} border-b border-gray-100 dark:border-slate-800/50`}
                  >
                    <td className="px-3 py-2 text-[13px] text-gray-600 dark:text-slate-300 whitespace-nowrap">
                      {new Date(m.created_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
                    </td>
                    <td className="px-3 py-2 text-[13px] font-semibold text-gray-900 dark:text-white">{m.product_name}</td>
                    <td className="px-3 py-2 text-[13px] text-gray-600 dark:text-slate-300 whitespace-nowrap">
                      {m.color && m.color !== "default" ? m.color : "-"}
                    </td>
                    <td className="px-3 py-2 text-[13px] text-center font-semibold text-gray-700 dark:text-slate-200">{m.size || "-"}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-bold ${
                          m.direction === "in"
                            ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400"
                            : "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400"
                        }`}
                      >
                        {m.direction === "in" ? "+" : "-"}{m.qty}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[12px] text-gray-600 dark:text-slate-300 whitespace-nowrap tabular-nums">
                      {m.before_stock ?? "-"} → {m.after_stock ?? "-"}
                    </td>
                    <td className="px-3 py-2 text-[12px] text-gray-600 dark:text-slate-300">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 text-[10px] font-bold">
                          {sourceLabel(m.source)}
                        </span>
                        <span className="max-w-[360px] truncate" title={m.notes || undefined}>{m.notes || "-"}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[12px] text-gray-600 dark:text-slate-300 whitespace-nowrap">
                      {m.actor_name || "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
