"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Archive, Clock3, Trash2, X } from "lucide-react";
import { formatRupiah, formatTanggalJamID } from "@/components/ops/transaksi/transaksi-format";

const SOURCE_LABEL = {
  manual: "Manual",
  batal: "Pembatalan",
  tukar_size: "Tukar size",
  return: "Retur",
};
const SOURCE_STYLE = {
  manual: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  batal: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  tukar_size: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  return: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

function sourceKey(value) {
  const key = String(value || "").trim();
  return key || "manual";
}

function dateOnly(value) {
  if (!value) return "-";
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00+07:00`);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function DetailRow({ label, value, strong = false }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-slate-100 last:border-0 dark:border-slate-800">
      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</span>
      <span
        className={`text-right text-sm break-words ${
          strong ? "font-extrabold text-slate-900 dark:text-white" : "font-semibold text-slate-800 dark:text-slate-100"
        }`}
      >
        {value || "-"}
      </span>
    </div>
  );
}

export default function StockInDetailDrawer({
  open,
  item,
  product,
  sku,
  colorLabel,
  onClose,
  onDelete,
}) {
  const source = sourceKey(item?.source);
  const auto = ["batal", "tukar_size", "return"].includes(source);
  const totalValue = (Number(item?.qty) || 0) * (Number(item?.cost_per_unit) || 0);

  return (
    <AnimatePresence>
      {open && item ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.22 }}
            className="fixed inset-y-0 right-0 z-[9999] flex w-full flex-col bg-white shadow-2xl dark:bg-[#1a1d28] sm:max-w-md"
            role="dialog"
            aria-label="Detail barang masuk"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
                  <Archive size={19} className="text-slate-700 dark:text-slate-200" />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate font-heading font-bold text-slate-900 dark:text-white">Detail Barang Masuk</h3>
                  <p className="truncate text-xs font-bold text-slate-500 dark:text-slate-400">
                    {item.product_name || product?.name || "-"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-full p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Tutup"
              >
                <X size={18} className="text-slate-500 dark:text-slate-400" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4" style={{ scrollbarWidth: "none" }}>
              <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${SOURCE_STYLE[source] || SOURCE_STYLE.manual}`}>
                    {SOURCE_LABEL[source] || source}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    {dateOnly(item.date)}
                  </span>
                </div>
                <p className="mt-3 text-base font-extrabold text-slate-900 dark:text-white">
                  {item.product_name || product?.name || "-"}
                </p>
                <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {[product?.series, colorLabel, item.variant_size].filter(Boolean).join(" · ") || "-"}
                </p>
                <div className="mt-3 flex items-end justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Jumlah masuk</span>
                  <span className="rounded-lg bg-green-100 px-2.5 py-1 text-sm font-extrabold text-green-700 dark:bg-green-900/40 dark:text-green-300">
                    +{Number(item.qty) || 0}
                  </span>
                </div>
              </div>

              <section>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Rincian</p>
                <div className="rounded-2xl border border-slate-200 px-4 dark:border-slate-800">
                  <DetailRow label="SKU" value={sku} />
                  <DetailRow label="Warna" value={colorLabel} />
                  <DetailRow label="Ukuran" value={item.variant_size} />
                  <DetailRow label="Tanggal masuk" value={dateOnly(item.date)} />
                  <DetailRow label="Jam dicatat" value={item.created_at ? formatTanggalJamID(item.created_at) : "-"} />
                  <DetailRow label="Harga satuan" value={`Rp ${formatRupiah(Number(item.cost_per_unit) || 0)}`} />
                  <DetailRow label="Total nilai" value={`Rp ${formatRupiah(totalValue)}`} strong />
                </div>
              </section>

              <section>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Catatan</p>
                <div className="rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-800">
                  <p className="whitespace-pre-wrap text-sm font-semibold leading-relaxed text-slate-700 dark:text-slate-200">
                    {item.notes || "Tidak ada catatan."}
                  </p>
                </div>
              </section>

              {item.ref_return_id ? (
                <section>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Referensi</p>
                  <div className="rounded-2xl border border-slate-200 px-4 dark:border-slate-800">
                    <DetailRow label="ID retur" value={item.ref_return_id} />
                  </div>
                </section>
              ) : null}

              <div className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-[11px] font-semibold leading-relaxed text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                <Clock3 size={14} className="mt-0.5 shrink-0" />
                Waktu dicatat memakai jam server (WIB). Baris otomatis dari retur/pembatalan tidak bisa dihapus dari sini.
              </div>
            </div>

            <div className="flex shrink-0 gap-2 border-t border-slate-200 px-5 py-3.5 dark:border-slate-800">
              {!auto && onDelete ? (
                <button
                  type="button"
                  onClick={() => onDelete(item)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-red-200 px-4 py-2.5 font-bold text-red-600 transition-colors hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  <Trash2 size={16} /> Hapus
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 font-bold text-white transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
              >
                Tutup
              </button>
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
