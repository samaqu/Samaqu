"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Daftar anomali stok.
 *
 * Menampilkan baris dari `stock_anomaly_log`: saat ada pesanan/retur/edit yang gagal
 * memotong atau mengembalikan stok karena variannya tidak ditemukan, karena input tanpa
 * varian, atau karena ID bayangan. Halaman ini READ-ONLY — tidak mengubah stok apa pun.
 */

type AnomalyRow = {
  id: number;
  product_id: string | null;
  product_name: string | null;
  color: string | null;
  size: string | null;
  qty: number;
  reason: string;
  order_id: string | null;
  source: string | null;
  created_at: string;
};

const REASON_LABEL: Record<string, string> = {
  variant_not_found: "Varian tidak ditemukan",
  missing_variant_input: "Input tanpa varian",
  phantom_product: "ID bayangan (bukan produk)",
  restore_variant_not_found: "Restore ke varian tidak ada",
  increment_variant_not_found: "Tambah ke varian tidak ada",
  increment_insufficient_stock: "Tarik stok, sisa kurang",
  insufficient_stock: "Stok tidak cukup",
  // Komponen (box kabak)
  component_missing_ref: "Komponen tanpa referensi order",
  component_out_of_stock: "Komponen habis",
  component_variant_not_found: "Varian komponen tidak ada",
  rollback_restore_failed: "Rollback stok gagal",
};

const REASON_TONE: Record<string, string> = {
  variant_not_found: "bg-red-100 text-red-700",
  missing_variant_input: "bg-red-100 text-red-700",
  phantom_product: "bg-slate-200 text-slate-700",
  restore_variant_not_found: "bg-amber-100 text-amber-800",
  increment_variant_not_found: "bg-amber-100 text-amber-800",
  increment_insufficient_stock: "bg-orange-100 text-orange-800",
  insufficient_stock: "bg-orange-100 text-orange-800",
  component_missing_ref: "bg-slate-200 text-slate-700",
  component_out_of_stock: "bg-orange-100 text-orange-800",
  component_variant_not_found: "bg-red-100 text-red-700",
  rollback_restore_failed: "bg-red-100 text-red-700",
};

function reasonLabel(reason: string) {
  return REASON_LABEL[reason] || reason;
}

export default function StockAnomalyList() {
  const [rows, setRows] = useState<AnomalyRow[]>([]);
  const [summary, setSummary] = useState<{ reason: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [days, setDays] = useState(30);
  const [reason, setReason] = useState("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const params = new URLSearchParams({ days: String(days), limit: "200" });
      if (reason !== "all") params.set("reason", reason);
      const res = await fetch(`/api/ops/stock-anomaly?${params.toString()}`, {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Gagal memuat anomali stok.");
      setRows(json.items || []);
      setSummary(json.summary || []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat anomali stok.");
    } finally {
      setLoading(false);
    }
  }, [days, reason]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.product_name, row.product_id, row.color, row.size, row.order_id, row.source, row.reason]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [rows, search]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white md:text-2xl">Anomali Stok</h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Pergerakan stok yang gagal karena varian tidak ditemukan atau data pengirim tidak lengkap.
            Halaman ini hanya membaca — stok tidak diubah dari sini.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-[13px] font-semibold text-gray-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            title="Rentang hari"
          >
            <option value={7}>7 hari</option>
            <option value={30}>30 hari</option>
            <option value={90}>90 hari</option>
            <option value={365}>1 tahun</option>
          </select>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-[13px] font-semibold text-gray-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            title="Jenis anomali"
          >
            <option value="all">Semua jenis</option>
            {Object.entries(REASON_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      {summary.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {summary.map((item) => (
            <span
              key={item.reason}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold ${
                REASON_TONE[item.reason] || "bg-slate-100 text-slate-700"
              }`}
            >
              {reasonLabel(item.reason)}
              <span className="rounded-full bg-white/70 px-1.5 text-[11px] tabular-nums">{item.count}</span>
            </span>
          ))}
        </div>
      ) : null}

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Cari produk, warna, ukuran, nomor pesanan, atau sumber..."
        className="w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-[13px] font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      />

      <div className="overflow-x-auto rounded-lg border border-gray-300 bg-white dark:border-slate-800 dark:bg-[#1a1d28]">
        <table className="w-full min-w-[900px] border-collapse text-[13px]">
          <thead>
            <tr className="bg-[#1e3a5f]">
              {["Waktu", "Produk", "Warna", "Ukuran", "Qty", "Penyebab", "Pesanan", "Sumber"].map((head) => (
                <th
                  key={head}
                  className="whitespace-nowrap border-r border-white/25 px-2.5 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-white last:border-r-0"
                >
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-400">Memuat…</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-400">
                  Tidak ada anomali pada rentang ini.
                </td>
              </tr>
            ) : (
              filtered.map((row, index) => (
                <tr
                  key={row.id}
                  className={`${index % 2 === 0 ? "bg-white" : "bg-slate-50/80"} border-b border-gray-200/70 dark:border-slate-800`}
                >
                  <td className="whitespace-nowrap px-2.5 py-2 text-slate-600 dark:text-slate-300">
                    {new Date(row.created_at).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="px-2.5 py-2 font-semibold text-slate-900 dark:text-white">
                    {row.product_name || row.product_id || "-"}
                  </td>
                  <td className="px-2.5 py-2 text-slate-600 dark:text-slate-300">{row.color || "-"}</td>
                  <td className="px-2.5 py-2 text-center font-semibold text-slate-700 dark:text-slate-200">{row.size || "-"}</td>
                  <td className="px-2.5 py-2 text-center tabular-nums text-slate-700 dark:text-slate-200">{row.qty}</td>
                  <td className="px-2.5 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${REASON_TONE[row.reason] || "bg-slate-100 text-slate-700"}`}>
                      {reasonLabel(row.reason)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-2 text-slate-600 dark:text-slate-300">{row.order_id || "-"}</td>
                  <td className="px-2.5 py-2 text-slate-600 dark:text-slate-300">{row.source || "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-slate-400">
        Menampilkan {filtered.length} dari {rows.length} anomali · rentang {days} hari terakhir.
      </p>
    </div>
  );
}
