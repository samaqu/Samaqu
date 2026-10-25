"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpFromLine, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatRupiah, formatTanggalJamID } from "@/components/ops/transaksi/transaksi-format";

const STATUS_LABEL = {
  completed: "Terjual",
  pending: "Belum bayar",
  return: "Dibatalkan",
  retur: "Retur",
  tukar_size: "Tukar size",
};
const STATUS_STYLE = {
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  return: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  retur: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  tukar_size: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
};

function dateOnly(value) {
  if (!value) return "-";
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00+07:00`);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function DetailRow({ label, value, strong = false }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2.5 last:border-0 dark:border-slate-800">
      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</span>
      <span className={`text-right text-sm break-words ${strong ? "font-extrabold text-slate-900 dark:text-white" : "font-semibold text-slate-800 dark:text-slate-100"}`}>
        {value || "-"}
      </span>
    </div>
  );
}

export default function StockOutDetailDrawer({ open, item, product, sku, colorLabel, onClose }) {
  const status = String(item?.status || "completed");
  const orderNumber = useMemo(() => {
    const value = String(item?.order_id || "");
    return /^(?:OPS|SMQ|CYO)-[0-9]{8}-[0-9]+$/i.test(value) ? value.toUpperCase() : "";
  }, [item?.order_id]);
  const [order, setOrder] = useState(null);
  const [orderLoading, setOrderLoading] = useState(false);

  useEffect(() => {
    if (!open || !orderNumber) {
      setOrder(null);
      setOrderLoading(false);
      return undefined;
    }
    let alive = true;
    setOrderLoading(true);
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const res = await fetch(`/api/ops/orders?order_number=${encodeURIComponent(orderNumber)}`, {
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        });
        const json = await res.json().catch(() => null);
        if (alive) setOrder(res.ok ? json?.order || null : null);
      } catch {
        if (alive) setOrder(null);
      } finally {
        if (alive) setOrderLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, orderNumber]);

  const orderAddress = order
    ? [order.shipping_address, order.shipping_kecamatan, order.shipping_city, order.shipping_province, order.shipping_postal_code]
        .filter(Boolean)
        .join(", ")
    : "";

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
            aria-label="Detail barang keluar"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
                  <ArrowUpFromLine size={19} className="text-slate-700 dark:text-slate-200" />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate font-heading font-bold text-slate-900 dark:text-white">Detail Barang Keluar</h3>
                  <p className="truncate text-xs font-bold text-slate-500 dark:text-slate-400">{item.product_name || product?.name || "-"}</p>
                </div>
              </div>
              <button type="button" onClick={onClose} className="shrink-0 rounded-full p-2 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Tutup">
                <X size={18} className="text-slate-500 dark:text-slate-400" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4" style={{ scrollbarWidth: "none" }}>
              <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${STATUS_STYLE[status] || STATUS_STYLE.completed}`}>
                    {STATUS_LABEL[status] || status}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{dateOnly(item.date)}</span>
                </div>
                <p className="mt-3 text-base font-extrabold text-slate-900 dark:text-white">{item.product_name || product?.name || "-"}</p>
                <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {[item.series || product?.series, colorLabel, item.variant_size].filter(Boolean).join(" · ") || "-"}
                </p>
                <div className="mt-3 flex items-end justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Jumlah keluar</span>
                  <span className="rounded-lg bg-red-100 px-2.5 py-1 text-sm font-extrabold text-red-700 dark:bg-red-900/40 dark:text-red-300">
                    -{Number(item.qty) || 0}
                  </span>
                </div>
              </div>

              <section>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Rincian</p>
                <div className="rounded-2xl border border-slate-200 px-4 dark:border-slate-800">
                  <DetailRow label="SKU" value={sku} />
                  <DetailRow label="Warna" value={colorLabel} />
                  <DetailRow label="Ukuran" value={item.variant_size} />
                  <DetailRow label="Tanggal keluar" value={dateOnly(item.date)} />
                  <DetailRow label="Jam dicatat" value={item.created_date ? formatTanggalJamID(item.created_date) : "-"} />
                  <DetailRow label="Harga satuan" value={`Rp ${formatRupiah(Number(item.price) || 0)}`} />
                  <DetailRow label="Total" value={`Rp ${formatRupiah(Number(item.total) || 0)}`} strong />
                  <DetailRow label="Platform" value={item.platform} />
                </div>
              </section>

              {orderNumber ? (
                <section>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Pesanan terkait</p>
                  <div className="rounded-2xl border border-slate-200 px-4 dark:border-slate-800">
                    <DetailRow label="No. Order" value={orderNumber} />
                    {orderLoading ? (
                      <p className="py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">Memuat data pesanan…</p>
                    ) : order ? (
                      <>
                        <DetailRow label="Nama customer" value={order.customer_name} />
                        <DetailRow label="WhatsApp" value={order.customer_whatsapp} />
                        <DetailRow label="Alamat" value={orderAddress || "-"} />
                        <DetailRow label="Status pesanan" value={order.status} />
                      </>
                    ) : (
                      <p className="py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">Data pesanan tidak ditemukan.</p>
                    )}
                  </div>
                </section>
              ) : (
                <section>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Referensi</p>
                  <div className="rounded-2xl border border-slate-200 px-4 dark:border-slate-800">
                    <DetailRow label="Nomor retur" value={item.order_id} />
                    <DetailRow label="Jenis" value={item.platform} />
                  </div>
                </section>
              )}
            </div>

            <div className="shrink-0 border-t border-slate-200 px-5 py-3.5 dark:border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-xl bg-slate-900 px-4 py-2.5 font-bold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
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
