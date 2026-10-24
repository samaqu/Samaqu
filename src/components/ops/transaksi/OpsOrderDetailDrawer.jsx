"use client";

/**
 * Detail pesanan dashboard ops — layout SAMA dengan panel admin (OrderDetailPanel),
 * tapi tema mono (hitam/slate), bukan pink.
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Ban, Pencil, Truck, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { waNumber } from "@/lib/whatsapp";
import { formatTrackingTime, sortHistoryDesc, trackingRow, trackingSummary } from "@/lib/jnt/track-status";
import TransaksiResiPanel from "@/components/ops/transaksi/TransaksiResiPanel";
import OrderDetailPanel from "@/components/ops/transaksi/OrderDetailPanel";

export default function OpsOrderDetailDrawer({ open, order, onClose, onEdit, onCancel, onResiCreated }) {
  const [track, setTrack] = useState({ status: "idle", history: [], error: "" });
  const [trackBusy, setTrackBusy] = useState(false);
  const [trackOpen, setTrackOpen] = useState(false);
  const resiPanelRef = useRef(null);

  const awb = order?.awb_no || "";
  const historyRows = sortHistoryDesc(track.history).map(trackingRow);
  const lastScan = historyRows[0] || null;
  const trackRows = trackOpen ? historyRows : [];
  const trackSummary = trackOpen ? trackingSummary(track.history) : null;
  const canPrint = Boolean(awb) && order?.status !== "dibatalkan";
  // Khusus pesanan Selesai: "Cetak Resi" di footer diganti "Hubungi Customer" (tanpa pesan).
  const isSelesai = order?.status === "selesai" || order?.shipping_status === "selesai";
  const customerWa = waNumber(order?.customer_whatsapp || "");
  const canHubungiCustomer = /^628[1-9][0-9]{6,10}$/.test(customerWa);

  useEffect(() => {
    if (!open) {
      setTrack({ status: "idle", history: [], error: "" });
      setTrackBusy(false);
      setTrackOpen(false);
    }
  }, [open]);

  const loadTrack = async (force = false) => {
    if (!awb || trackBusy) return;
    setTrackBusy(true);
    setTrack((current) => ({ ...current, status: "loading", error: "" }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/jnt/track?awb=${encodeURIComponent(awb)}${force ? "&refresh=1" : ""}`, {
        cache: "no-store",
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error || "Gagal mengambil riwayat dari J&T.");
      setTrack({
        status: "done",
        history: Array.isArray(json.data?.history) ? json.data.history : [],
        error: "",
      });
    } catch (error) {
      setTrack({
        status: "error",
        history: [],
        error: error instanceof Error ? error.message : "Gagal mengambil riwayat dari J&T.",
      });
    } finally {
      setTrackBusy(false);
    }
  };

  // Status terbaru J&T langsung dimuat saat drawer dibuka.
  useEffect(() => {
    if (!open || !awb) return;
    loadTrack(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, awb]);

  const toggleTrack = () => {
    const next = !trackOpen;
    setTrackOpen(next);
    if (next) loadTrack(true);
  };

  const shippingContent = (
    <div className="space-y-2.5">
      <TransaksiResiPanel
        ref={resiPanelRef}
        order={order}
        onResiCreated={onResiCreated}
        hidePrintButton
        latestTracking={lastScan}
        trackingState={track.status}
      />
      {awb ? (
        <div className="pt-0.5">
          <button
            type="button"
            onClick={toggleTrack}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-[13px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <Truck size={15} /> {trackOpen ? "Tutup riwayat" : "Lacak Resi"}
          </button>

          {trackOpen ? (
            <div className="mt-2 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
              {track.status === "done" && trackSummary?.receiver ? (
                <p className="px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800">
                  Diterima oleh: {trackSummary.receiver}
                </p>
              ) : null}
              {track.status === "loading" ? (
                <p className="px-3 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400">Memuat riwayat dari J&T…</p>
              ) : track.status === "error" ? (
                <p className="px-3 py-2.5 text-xs font-semibold text-red-600 dark:text-red-400">{track.error}</p>
              ) : trackRows.length === 0 ? (
                <p className="px-3 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400">Belum ada riwayat dari J&T.</p>
              ) : (
                <ul className="max-h-[196px] overflow-y-auto no-scrollbar divide-y divide-slate-100 dark:divide-slate-800">
                  {trackRows.map((row, index) => (
                    <li key={`${row.dateTime}-${index}`} className="px-3 py-2">
                      <p className={`text-xs font-bold ${row.warning ? "text-amber-600 dark:text-amber-400" : "text-slate-800 dark:text-slate-100"}`}>
                        {row.status}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {[row.location, formatTrackingTime(row.dateTime)].filter(Boolean).join(" • ")}
                      </p>
                      {row.note ? (
                        <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Catatan: {row.note}</p>
                      ) : null}
                      {row.driver ? (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">Kurir: {row.driver}</p>
                      ) : null}
                      {row.receiver ? (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">Diterima oleh: {row.receiver}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-900">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {trackRows.length > 0 ? `${trackRows.length} riwayat` : "Riwayat J&T"}
                </span>
                {trackBusy ? (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Memuat…</span>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  return (
    <AnimatePresence>
      {open && order ? (
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
            aria-label="Detail pesanan"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{order.source_label}</p>
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">Detail Pesanan</h3>
              </div>
              <button
                onClick={onClose}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Tutup"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4" style={{ scrollbarWidth: "none" }}>
              <OrderDetailPanel
                order={order}
                theme="mono"
                latestTracking={lastScan}
                trackingState={track.status}
                shippingContent={shippingContent}
                onOpenTrack={toggleTrack}
              />
            </div>

            {(order.can_edit || order.can_cancel || canPrint || isSelesai) && (
              <div className="flex shrink-0 gap-2 border-t border-slate-200 px-5 py-3.5 dark:border-slate-800">
                {order.can_edit ? (
                  <button
                    onClick={() => onEdit(order)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-slate-200 px-4 py-2.5 font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Pencil size={16} /> Ubah
                  </button>
                ) : null}
                {isSelesai ? (
                  <button
                    type="button"
                    disabled={!canHubungiCustomer}
                    onClick={() => {
                      if (canHubungiCustomer) {
                        window.open(`https://wa.me/${customerWa}`, "_blank", "noopener,noreferrer");
                      }
                    }}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-slate-200 px-4 py-2.5 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Hubungi Customer
                  </button>
                ) : canPrint ? (
                  <button
                    onClick={() => resiPanelRef.current?.print()}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-slate-200 px-4 py-2.5 font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Cetak Resi
                  </button>
                ) : null}
                {order.can_cancel ? (
                  <button
                    onClick={() => onCancel(order)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-red-200 px-4 py-2.5 font-bold text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    <Ban size={16} /> Batalkan
                  </button>
                ) : null}
              </div>
            )}
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
