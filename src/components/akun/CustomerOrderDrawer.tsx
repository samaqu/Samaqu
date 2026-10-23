"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import OrderDetailPanel from "@/components/ops/transaksi/OrderDetailPanel";
import { formatTrackingTime, sortHistoryDesc, trackingRow, trackingSummary } from "@/lib/jnt/track-status";
import { orderSourceLabel } from "@/lib/transaksi";

type CustomerOrder = Record<string, any>;

/**
 * Drawer detail pesanan customer — layout sama dengan drawer admin/ops:
 * overlay gelap + panel kanan 448px, isi OrderDetailPanel tema mono.
 *
 * Lacak Resi tidak membuka halaman: tombol footer membuka riwayat J&T
 * langsung di dalam drawer (pola yang sama dengan panel admin).
 */
export default function CustomerOrderDrawer({
  order,
  onClose,
}: {
  order: CustomerOrder | null;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [trackOpen, setTrackOpen] = useState(false);
  const [trackBusy, setTrackBusy] = useState(false);
  const [trackHistory, setTrackHistory] = useState<any[]>([]);
  const [trackError, setTrackError] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!order) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [order, onClose]);

  // Drawer baru / pesanan lain: tutup riwayat lama.
  useEffect(() => {
    setTrackOpen(false);
    setTrackBusy(false);
    setTrackHistory([]);
    setTrackError("");
  }, [order?.order_number]);

  // Portal ke body: halaman /akun dibungkus AkunPageTransition yang memakai
  // transform/filter, sehingga `fixed` di dalamnya terkurung di area konten
  // (drawer jadi pendek dan bergeser). Portal mengembalikannya ke viewport.
  if (!order || !mounted) return null;

  const awb = order.awb_no || "";

  const loadTrack = async (force = false) => {
    if (!awb || trackBusy) return;
    setTrackBusy(true);
    setTrackError("");
    try {
      const res = await fetch(`/api/jnt/track?awb=${encodeURIComponent(awb)}${force ? "&refresh=1" : ""}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success || !json?.data) {
        throw new Error(json?.error || "Gagal mengambil riwayat dari J&T.");
      }
      setTrackHistory(Array.isArray(json.data.history) ? json.data.history : []);
    } catch (error) {
      setTrackError(error instanceof Error ? error.message : "Gagal mengambil riwayat dari J&T.");
    } finally {
      setTrackBusy(false);
    }
  };

  const toggleTrack = () => {
    const next = !trackOpen;
    setTrackOpen(next);
    if (next && trackHistory.length === 0) loadTrack(true);
  };

  const panelOrder = {
    ...order,
    items: order.order_items || [],
    kota: order.shipping_city,
    notes: order.shipping_notes,
    shipping_kecamatan: order.shipping_kecamatan,
    shipping_province: order.shipping_province,
  };

  const latestTracking = order.tracking_status_text
    ? {
        status: order.tracking_status_text,
        location: order.tracking_city,
        dateTime: order.tracking_updated_at || "",
      }
    : null;

  const trackRows = sortHistoryDesc(trackHistory).map(trackingRow);
  const trackSummary = trackingSummary(trackHistory);

  return createPortal(
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Detail pesanan">
      <button
        type="button"
        aria-label="Tutup detail pesanan"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/40"
      />

      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[448px] flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
              {orderSourceLabel(order)}
            </p>
            <h2 className="mt-0.5 text-lg font-extrabold text-slate-900">Detail Pesanan</h2>
            <p className="mt-0.5 font-mono text-xs font-semibold text-slate-500">{order.order_number}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <OrderDetailPanel
            order={panelOrder}
            theme="mono"
            latestTracking={latestTracking}
            trackingState="done"
          />

          {trackOpen ? (
            <section className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                    Riwayat Pengiriman
                  </p>
                  {trackSummary ? (
                    <>
                      <p className="mt-1 text-sm font-bold text-slate-900">{trackSummary.status}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatTrackingTime(trackSummary.updatedAt)}
                      </p>
                      {trackSummary.receiver ? (
                        <p className="mt-1 text-xs text-slate-500">
                          Diterima oleh: <b className="text-slate-700">{trackSummary.receiver}</b>
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="mt-1 text-sm font-semibold text-slate-700">Lacak resi {awb}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => loadTrack(true)}
                  disabled={trackBusy}
                  className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  {trackBusy ? "Memuat..." : "Perbarui"}
                </button>
              </div>

              {trackError ? (
                <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
                  {trackError}
                </p>
              ) : trackBusy && trackRows.length === 0 ? (
                <div className="mt-3 space-y-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-200/70" />
                  ))}
                </div>
              ) : trackRows.length === 0 ? (
                <p className="mt-3 text-xs font-semibold text-slate-500">Belum ada riwayat dari J&T.</p>
              ) : (
                <ol className="mt-3 space-y-3 border-l border-slate-200 pl-3">
                  {trackRows.map((row, index) => (
                    <li key={`${row.dateTime}-${index}`} className="relative">
                      <span
                        className={`absolute -left-[17px] top-1.5 h-2 w-2 rounded-full ${
                          index === 0 ? "bg-slate-900" : "bg-slate-300"
                        }`}
                      />
                      <p className={`text-xs font-bold ${row.warning ? "text-amber-600" : "text-slate-900"}`}>
                        {row.status}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {[row.location, formatTrackingTime(row.dateTime)].filter(Boolean).join(" • ")}
                      </p>
                      {row.note ? (
                        <p className="mt-0.5 text-[11px] text-slate-500">Catatan: {row.note}</p>
                      ) : null}
                      {row.receiver ? (
                        <p className="mt-0.5 text-[11px] text-slate-500">Diterima oleh: {row.receiver}</p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ) : null}
        </div>

        <footer className="border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={toggleTrack}
            disabled={!awb}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {!awb ? "Resi belum tersedia" : trackOpen ? "Tutup Lacak" : trackBusy ? "Memuat..." : "Lacak Resi"}
          </button>
        </footer>
      </aside>
    </div>,
    document.body
  );
}
