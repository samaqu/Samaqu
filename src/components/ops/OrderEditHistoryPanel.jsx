"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Eye, History, RefreshCw, Search, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatRupiah, formatTanggalJamID } from "@/components/ops/transaksi/transaksi-format";

function itemsLabel(items) {
  return (items || [])
    .map((item) => [item.product_name, item.color && item.color !== "default" ? item.color : null, item.size].filter(Boolean).join(" · "))
    .filter(Boolean)
    .join(", ");
}

function editedTimeParts(iso) {
  const [date = "-", time = ""] = formatTanggalJamID(iso).split(" · ");
  return { date, time };
}

function itemQty(items) {
  return (items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
}

function EditItems({ title, items }) {
  return (
    <section>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</p>
      <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100 dark:border-slate-800 dark:divide-slate-800">
        {(items || []).length === 0 ? (
          <p className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">Tidak ada item.</p>
        ) : (
          items.map((item, index) => (
            <div key={`${item.product_id}-${item.color}-${item.size}-${index}`} className="flex items-start justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-white break-words">{item.product_name}</p>
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  {[item.color && item.color !== "default" ? item.color : null, item.size].filter(Boolean).join(" · ") || "-"}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs font-bold text-slate-900 dark:text-white">× {item.quantity}</p>
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Rp {formatRupiah(Number(item.price) || 0)}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export default function OrderEditHistoryPanel() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/ops/order-edits?limit=300", {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Gagal memuat riwayat edit.");
      setItems(json?.items || []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat riwayat edit.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) =>
      [item.order_number, item.customer_name, item.actor, item.note, itemsLabel(item.before_items), itemsLabel(item.after_items)]
        .some((value) => String(value || "").toLowerCase().includes(query)),
    );
  }, [items, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-gray-900 dark:text-white">Riwayat edit transaksi</p>
          <p className="text-[11px] text-gray-500 dark:text-slate-400">
            Audit perubahan item, total, dan berat. Tidak mengubah stok atau laporan.
          </p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="relative min-w-0 flex-1 sm:w-[260px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari order, customer, produk..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-8 text-sm text-slate-900 placeholder-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            {search ? (
              <button type="button" onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400" aria-label="Hapus pencarian">
                <X size={13} />
              </button>
            ) : null}
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Muat
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#1a1d28]">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              <col style={{ width: "19%" }} />
              <col style={{ width: "23%" }} />
              <col style={{ width: "28%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "8%" }} />
            </colgroup>
            <thead>
              <tr className="border-b border-[#e2e8f0] bg-[#f8fafc] dark:border-slate-700 dark:bg-slate-800/60">
                {["Tanggal & Jam", "Order / Customer", "Perubahan", "Total", "Berat", "Aksi"].map((head) => (
                  <th key={head} className="px-3.5 py-3 text-left font-inter text-[11px] font-bold uppercase tracking-[.06em] text-slate-500 dark:text-slate-300">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">Memuat…</td></tr>
              ) : error ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-red-600">{error}</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">Belum ada riwayat edit.</td></tr>
              ) : (
                rows.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setSelected(item)}
                    className="cursor-pointer border-b border-[#e2e8f0] transition-colors hover:bg-[#eff6ff] dark:border-slate-800/60 dark:hover:bg-slate-800/70"
                  >
                    <td className="px-3.5 py-2.5 align-middle text-[12px] font-semibold text-slate-600 dark:text-slate-300">
                      <span className="block whitespace-nowrap">{editedTimeParts(item.edited_at).date}</span>
                      <span className="block whitespace-nowrap text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                        {editedTimeParts(item.edited_at).time || "-"}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 align-middle">
                      <p className="text-[13px] font-bold text-slate-900 dark:text-white">{item.order_number}</p>
                      <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{item.customer_name}</p>
                    </td>
                    <td className="px-3.5 py-2.5 align-middle">
                      <p className="truncate text-[12px] font-semibold text-slate-700 dark:text-slate-200" title={itemsLabel(item.after_items)}>
                        {itemsLabel(item.after_items) || "-"}
                      </p>
                      <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        {itemQty(item.before_items)} → {itemQty(item.after_items)} pcs
                      </p>
                    </td>
                    <td className="px-3.5 py-2.5 align-middle text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                      <p className="whitespace-nowrap">Rp {formatRupiah(Number(item.before_totals?.total) || 0)}</p>
                      <p className="whitespace-nowrap text-slate-500 dark:text-slate-400">→ Rp {formatRupiah(Number(item.after_totals?.total) || 0)}</p>
                    </td>
                    <td className="px-3.5 py-2.5 align-middle text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                      {Number(item.before_totals?.weight) || 0} → {Number(item.after_totals?.weight) || 0} g
                    </td>
                    <td className="px-3.5 py-2.5 text-center align-middle">
                      <Eye size={15} className="mx-auto text-slate-400 dark:text-slate-500" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800 md:hidden">
          {loading ? (
            <p className="px-4 py-10 text-center text-sm text-slate-400">Memuat…</p>
          ) : error ? (
            <p className="px-4 py-10 text-center text-sm text-red-600">{error}</p>
          ) : rows.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-400">Belum ada riwayat edit.</p>
          ) : (
            rows.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelected(item)}
                className="block w-full px-4 py-3.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-extrabold text-slate-900 dark:text-white">{item.order_number}</p>
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{item.customer_name}</p>
                  </div>
                  <span className="shrink-0 text-[10px] font-semibold text-slate-400">{formatTanggalJamID(item.edited_at)}</span>
                </div>
                <p className="mt-1.5 truncate text-xs font-semibold text-slate-700 dark:text-slate-200">{itemsLabel(item.after_items) || "-"}</p>
                <div className="mt-1 flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  <span>{itemQty(item.before_items)} → {itemQty(item.after_items)} pcs</span>
                  <span>Rp {formatRupiah(Number(item.after_totals?.total) || 0)}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <AnimatePresence>
        {selected ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-sm"
              onClick={() => setSelected(null)}
            />
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "tween", duration: 0.22 }}
              className="fixed inset-y-0 right-0 z-[9999] flex w-full flex-col bg-white shadow-2xl dark:bg-[#1a1d28] sm:max-w-md"
              role="dialog"
              aria-label="Detail riwayat edit"
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
                    <History size={19} className="text-slate-700 dark:text-slate-200" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate font-heading font-bold text-slate-900 dark:text-white">Riwayat Edit</h3>
                    <p className="truncate text-xs font-bold text-slate-500 dark:text-slate-400">{selected.order_number} · {selected.customer_name}</p>
                  </div>
                </div>
                <button type="button" onClick={() => setSelected(null)} className="shrink-0 rounded-full p-2 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Tutup">
                  <X size={18} className="text-slate-500 dark:text-slate-400" />
                </button>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4" style={{ scrollbarWidth: "none" }}>
                <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Diedit oleh</p>
                  <p className="mt-1 text-sm font-extrabold text-slate-900 dark:text-white">{selected.actor}</p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">{formatTanggalJamID(selected.edited_at)}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <span className={`rounded-lg px-2 py-1 text-[10px] font-bold ${selected.had_awb ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
                      {selected.had_awb ? "Diedit setelah resi" : "Sebelum resi"}
                    </span>
                    {selected.awb_no ? <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">AWB {selected.awb_no}</span> : null}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Rp {formatRupiah(Number(selected.before_totals?.total) || 0)}</p>
                    <p className="text-sm font-extrabold text-slate-900 dark:text-white">→ Rp {formatRupiah(Number(selected.after_totals?.total) || 0)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Berat</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{Number(selected.before_totals?.weight) || 0} g</p>
                    <p className="text-sm font-extrabold text-slate-900 dark:text-white">→ {Number(selected.after_totals?.weight) || 0} g</p>
                  </div>
                </div>

                <EditItems title="Sebelum" items={selected.before_items} />
                <EditItems title="Sesudah" items={selected.after_items} />

                {selected.note ? (
                  <section>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Catatan</p>
                    <div className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:text-slate-200">
                      {selected.note}
                    </div>
                  </section>
                ) : null}
              </div>

              <div className="shrink-0 border-t border-slate-200 px-5 py-3.5 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="w-full rounded-xl bg-slate-900 px-4 py-2.5 font-bold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
                >
                  Tutup
                </button>
              </div>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
