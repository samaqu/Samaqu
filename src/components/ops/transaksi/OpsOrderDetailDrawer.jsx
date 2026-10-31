"use client";

/**
 * Detail pesanan dashboard ops — layout SAMA dengan panel admin (OrderDetailPanel),
 * tapi tema mono (hitam/slate), bukan pink.
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { waNumber } from "@/lib/whatsapp";
import { formatTrackingTime, sortHistoryDesc, trackingRow, trackingSummary } from "@/lib/jnt/track-status";
import { orderStage } from "@/lib/order-flow";
import { NEUTRAL_ITEM_PHOTO } from "@/lib/order-photo";
import { formatWeightExact } from "@/lib/shipping-weight";
import { usePaymentMethodName } from "@/lib/use-payment-methods";
import { paymentChannelLabel } from "@/lib/payment-channel";
import PanelDetailPesanan, { jamWIB } from "@/components/ops/transaksi/PanelDetailPesanan";
import TransaksiResiPanel from "@/components/ops/transaksi/TransaksiResiPanel";
import { formatRupiah } from "@/components/ops/transaksi/transaksi-format";

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

  // Metode pembayaran (sama dengan yang dipakai drawer panel admin).
  const { name: paymentName } = usePaymentMethodName(order?.payment_method);
  const channelLabel = paymentChannelLabel(order?.payment_channel);
  const paymentDetail = paymentName ? `${paymentName}${channelLabel ? ` · ${channelLabel}` : ""}` : channelLabel || "—";

  // Aksi footer: aturan sama dengan tombol lama (Ubah / Cetak Resi / Hubungi Customer / Batalkan).
  const aksiOps = [];
  if (order?.can_edit) aksiOps.push({ key: "ubah", label: "Ubah", jenis: "sekunder", onClick: () => onEdit(order) });
  if (isSelesai) {
    aksiOps.push({
      key: "hubungi",
      label: "Hubungi Customer",
      jenis: "utama",
      disabled: !canHubungiCustomer,
      onClick: () => {
        if (canHubungiCustomer) window.open(`https://wa.me/${customerWa}`, "_blank", "noopener,noreferrer");
      },
    });
  } else if (canPrint) {
    aksiOps.push({ key: "cetak", label: "Cetak Resi", jenis: "utama", onClick: () => resiPanelRef.current?.print() });
  }
  if (order?.can_cancel) aksiOps.push({ key: "batal", label: "Batalkan", jenis: "bahaya", onClick: () => onCancel(order) });

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
                      {row.receivedByThirdParty ? (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">Diterima oleh: {row.receivedByThirdParty}</p>
                      ) : null}
                      {row.handoverNote ? (
                        <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">{row.handoverNote}</p>
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
            className="fixed inset-0 z-[9999] flex justify-end items-stretch bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          >
          {/* Panel menggeser & fixed sendiri (sama dengan panel admin); di sini hanya overlay.
              Semua logic & aksi tetap dikirim dari file ini. */}
          <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", height: "100%" }}>
          <PanelDetailPesanan
            tema="mono"
            onClose={onClose}
            sumber={order.source_label}
            tahap={orderStage(order)}
            createdAt={order.created_at}
            nama={order.customer_name || "Tanpa nama"}
            telepon={order.customer_whatsapp || ""}
            alamat={[order.shipping_address, order.shipping_kecamatan, order.kota, order.shipping_province, order.shipping_postal_code].filter(Boolean).join(", ")}
            kurir={order.shipping_method || "J&T Express"}
            layanan={order.shipping_method || "—"}
            resi={awb}
            resiKosong="Resi belum dibuat"
            onLacak={toggleTrack}
            onSalinResi={() => {
              if (awb) navigator.clipboard?.writeText(awb).catch(() => {});
            }}
            resiTersalin={false}
            berat={order.weight > 0 ? formatWeightExact(order.weight) : "-"}
            statusKirim={lastScan?.status}
            statusKirimMeta={
              lastScan ? [lastScan.location, lastScan.dateTime ? formatTrackingTime(lastScan.dateTime) : ""].filter(Boolean).join(" · ") : ""
            }
            items={(order.items || []).map((item, index) => ({
              key: `${item.product_id}-${item.color}-${item.size}-${index}`,
              nama: item.product_name,
              chips: [
                item.kain ? { teks: `Kain ${item.kain}`, jenis: "kain" } : null,
                item.series ? { teks: item.series, jenis: "kain" } : null,
                { teks: `${item.size || ""}${item.size ? " · " : ""}x${item.quantity}`, jenis: "netral" },
              ].filter(Boolean),
              harga: `Rp ${formatRupiah(item.price * item.quantity)}`,
              foto: item.product_image || NEUTRAL_ITEM_PHOTO,
            }))}
            subtotal={order.subtotal}
            ongkir={order.shipping_cost}
            diskon={order.discount}
            total={order.total}
            metodeBayar={paymentDetail}
            waktuPesan={jamWIB(order.created_at)}
            waktuBayar={order.paid_at ? jamWIB(order.paid_at) : null}
            nomorPesanan={order.order_number}
            onSalinNomor={() => navigator.clipboard?.writeText(order.order_number).catch(() => {})}
            nomorTersalin={false}
            onChat={() => {
              if (canHubungiCustomer) window.open(`https://wa.me/${customerWa}`, "_blank", "noopener,noreferrer");
            }}
            aksi={aksiOps}
          >
            {shippingContent}
          </PanelDetailPesanan>
          </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
