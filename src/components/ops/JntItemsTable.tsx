"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle, Search, X } from "lucide-react";
import { formatKg, formatRp, formatTanggalPendek, normalizeAwb, type JntInvoiceItem } from "@/lib/jnt-invoice";

/**
 * Tabel cross-check per resi: biaya J&T vs ongkir yang dibayar customer.
 *
 * Kolom "Selisih" dihitung dari NET (setelah diskon), bukan dari biaya kirim bruto —
 * kalau dihitung dari bruto, diskon J&T akan terbaca seperti keuntungan padahal ia
 * cuma pengurang biaya.
 */

type Filter = "semua" | "tanpa-diskon" | "belum-cocok" | "minus";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "semua", label: "Semua" },
  { key: "tanpa-diskon", label: "Tanpa Diskon" },
  { key: "belum-cocok", label: "Belum Cocok" },
  { key: "minus", label: "Selisih Minus" },
];

export default function JntItemsTable({ items }: { items: JntInvoiceItem[] }) {
  const [filter, setFilter] = useState<Filter>("semua");
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return items.filter((item) => {
      if (filter === "tanpa-diskon" && item.has_discount) return false;
      if (filter === "belum-cocok" && item.order_number) return false;
      if (filter === "minus") {
        if (!item.order_number) return false;
        if (Number(item.shipping_cost || 0) - Number(item.net_cost || 0) >= 0) return false;
      }
      if (!keyword) return true;
      return [item.awb_no, item.city, item.district, item.service, item.order_number]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword));
    });
  }, [items, filter, search]);

  const counts = useMemo(
    () => ({
      semua: items.length,
      "tanpa-diskon": items.filter((item) => !item.has_discount).length,
      "belum-cocok": items.filter((item) => !item.order_number).length,
      minus: items.filter((item) => item.order_number && Number(item.shipping_cost || 0) - Number(item.net_cost || 0) < 0).length,
    }),
    [items],
  );

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut", delay: 0.1 }}
      className="rounded-2xl border border-slate-200 bg-white p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-slate-900">Cross-check per Resi</h2>
          <p className="text-xs text-slate-500">
            Biaya J&T dari ekspor (basis tanggal pengiriman) dibandingkan ongkir yang dibayar customer dari pesanan.
          </p>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari resi / kota / no. pesanan"
            className="w-56 rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-7 text-xs text-slate-900 outline-none transition focus:border-slate-400"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {FILTERS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setFilter(entry.key)}
            className={`rounded-full px-3 py-1 text-xs font-bold transition ${
              filter === entry.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {entry.label} ({counts[entry.key]})
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-[1000px] w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <th className="py-2 pr-3">No. Resi</th>
              <th className="py-2 pr-3">Tanggal Kirim</th>
              <th className="py-2 pr-3">Tujuan</th>
              <th className="py-2 pr-3">Layanan</th>
              <th className="py-2 pr-3 text-right">Berat</th>
              <th className="py-2 pr-3 text-right">Biaya Kirim</th>
              <th className="py-2 pr-3 text-right">Diskon</th>
              <th className="py-2 pr-3 text-right">Net (dibukukan)</th>
              <th className="py-2 pr-3 text-right">Ongkir Customer</th>
              <th className="py-2 text-right">Selisih</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const selisih = item.order_number ? Number(item.shipping_cost || 0) - Number(item.net_cost || 0) : null;
              return (
                <tr key={normalizeAwb(item.awb_no)} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                  <td className="py-2 pr-3 whitespace-nowrap font-mono text-xs text-slate-800">
                    {item.awb_no}
                    {!item.has_discount && (
                      <motion.span
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700"
                      >
                        <AlertTriangle size={10} /> Tanpa Diskon
                      </motion.span>
                    )}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap text-xs text-slate-600">{formatTanggalPendek(item.delivery_date)}</td>
                  <td className="py-2 pr-3 text-xs text-slate-700">
                    <span className="block max-w-[190px] truncate" title={`${item.district || ""} ${item.city || ""}`.trim()}>
                      {item.district ? `${item.district}, ` : ""}
                      {item.city || "—"}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-xs text-slate-500">{item.service || "—"}</td>
                  <td className="py-2 pr-3 text-right text-xs text-slate-600">{formatKg(item.weight)}</td>
                  <td className="py-2 pr-3 text-right text-xs text-slate-500">{formatRp(item.gross_cost)}</td>
                  <td className="py-2 pr-3 text-right text-xs text-slate-500">{item.discount ? `− ${formatRp(item.discount)}` : "—"}</td>
                  <td className="py-2 pr-3 text-right text-xs font-bold text-slate-900">{formatRp(item.net_cost)}</td>
                  <td className="py-2 pr-3 text-right text-xs text-slate-700">
                    {item.order_number ? (
                      <>
                        {formatRp(item.shipping_cost)}
                        <span className="block text-[10px] font-normal text-slate-400">{item.order_number}</span>
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                        Belum ada di pesanan
                      </span>
                    )}
                  </td>
                  <td
                    className={`py-2 text-right text-xs font-bold ${
                      selisih == null ? "text-slate-300" : selisih < 0 ? "text-red-600" : "text-emerald-600"
                    }`}
                  >
                    {selisih == null ? "—" : formatRp(selisih)}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="py-8 text-center text-sm text-slate-400">
                  {items.length === 0 ? "Belum ada baris resi di bulan ini — upload file Excel J&T dulu." : "Tidak ada baris yang cocok dengan filter."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {items.length > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400">
          <CheckCircle size={12} className="text-slate-300" />
          {rows.length} dari {items.length} resi ditampilkan. Selisih = ongkir customer − net J&T (setelah diskon).
        </p>
      )}
    </motion.section>
  );
}
