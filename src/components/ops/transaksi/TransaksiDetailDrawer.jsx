"use client";

/**
 * Detail transaksi (panel samping) untuk menu Transaksi.
 *
 * Isinya sengaja hanya data yang benar-benar tercatat: info pelanggan, daftar item,
 * ongkir/diskon, total, sumber, status, dan waktu dicatat. HPP/keuntungan TIDAK
 * ditampilkan (datanya belum ada).
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Ban, CreditCard, MapPin, Pencil, Receipt, ShoppingBag, Trash2, Truck, X } from "lucide-react";
import { NEUTRAL_ITEM_PHOTO } from "@/lib/order-photo";
import { isPaketItem, variantName } from "@/lib/item-label";
import { ORDER_STAGE_LABEL, orderStage } from "@/lib/order-flow";
import { usePaymentMethodName } from "@/lib/use-payment-methods";
import { paymentChannelLabel } from "@/lib/payment-channel";
import { supabase } from "@/lib/supabase";
import { formatWeightExact } from "@/lib/shipping-weight";
import { formatTrackingTime, sortHistoryDesc, trackingRow, trackingSummary } from "@/lib/jnt/track-status";
import { jntServiceTag } from "@/lib/jnt/layanan";
import JntBadge from "@/components/JntBadge";
import { SOURCE_STYLES, STATUS_STYLES, formatRupiah, formatTanggalJamID } from "@/components/ops/transaksi/transaksi-format";
import TransaksiResiPanel from "@/components/ops/transaksi/TransaksiResiPanel";

export default function TransaksiDetailDrawer({ open, order, variant = "ops", onClose, onEdit, onCancel, onDelete, onResiCreated }) {
  const isPanel = variant === "panel";
  const status = order ? STATUS_STYLES[order.status] : null;
  const source = order ? SOURCE_STYLES[order.source_key || order.source] : null;

  // Nama metode pembayaran: `orders.payment_method` bisa berupa id ke tabel `payment_methods`
  // (pesanan baru) atau string lama ('bank'/'qris'/'cod'/'cash'). Hook ini yang menerjemahkannya.
  const { name: paymentName } = usePaymentMethodName(order?.payment_method);
  // Rincian channel gateway (mis. Mayar → "QRIS" / "BNI Virtual Account"), kalau sudah tercatat.
  const channelLabel = paymentChannelLabel(order?.payment_channel);
  const paymentDetail = paymentName
    ? `${paymentName}${channelLabel ? ` · ${channelLabel}` : ""}`
    : channelLabel || "-";

  const awb = order?.awb_no || "";
  // Akses ke dialog "Cetak Resi" milik TransaksiResiPanel (panel admin: tombolnya di footer).
  const resiPanelRef = useRef(null);

  // Data lama `order` bisa berubah setelah resi dibuat; panel resi di-reset saat drawer ditutup.
  useEffect(() => {
    if (open) return undefined;
    setTrack({ status: "idle", history: [], error: "", serviceCode: "" });
    setTrackOpen(false);
    setTrackBusy(false);
    setTrackModal(false);
    return undefined;
  }, [open]);

  /** Riwayat pengiriman (Lacak Resi): hasil baca dari endpoint tracking publik — read-only. */
  const [track, setTrack] = useState({ status: "idle", history: [], error: "", serviceCode: "" });
  const [trackOpen, setTrackOpen] = useState(false);
  const [trackBusy, setTrackBusy] = useState(false);
  // Modal Lacak (khusus tampilan panel ala mockup).
  const [trackModal, setTrackModal] = useState(false);
  const trackRows = trackOpen ? sortHistoryDesc(track.history).map(trackingRow) : [];
  // Riwayat urut terbaru → lama (dipakai drawer panel: kotak "scan terakhir" + modal).
  const historyRows = sortHistoryDesc(track.history).map(trackingRow);
  /** Scan terakhir dari J&T — dipakai sama di panel admin & dashboard ops. */
  const lastScan = historyRows[0] || null;
  // Ringkasan sama seperti yang dipakai dashboard admin (mis. "Diterima oleh: Lea").
  const trackSummary = trackOpen ? trackingSummary(track.history) : null;
  // Badge layanan: tracking J&T (EZ/ECO) → teks shipping_method → fallback EZ.
  const serviceTag = jntServiceTag(track.serviceCode || order?.shipping_method);

  /** Ambil riwayat dari J&T. `force` = lewati cache 5 menit di endpoint. Tanpa tulis DB. */
  const loadTrack = async (force = false) => {
    if (!awb || trackBusy) return;
    setTrackBusy(true);
    setTrack((current) => ({ ...current, status: "loading", error: "" }));
    try {
      // Token admin ops ikut dikirim: endpoint hanya menyertakan data kurir & nama penerima
      // kalau pemintanya admin (versi publik/customer sengaja tanpa data itu).
      const { data: { session: trackSession } } = await supabase.auth.getSession();
      const res = await fetch(`/api/jnt/track?awb=${encodeURIComponent(awb)}${force ? "&refresh=1" : ""}`, {
        cache: "no-store",
        headers: trackSession?.access_token ? { Authorization: `Bearer ${trackSession.access_token}` } : undefined,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error || "Gagal mengambil riwayat dari J&T.");
      setTrack({
        status: "done",
        history: Array.isArray(json.data?.history) ? json.data.history : [],
        error: "",
        serviceCode: String(json.data?.detail?.services_code || "").toUpperCase(),
      });
    } catch (error) {
      setTrack({
        status: "error",
        history: [],
        error: error instanceof Error ? error.message : "Gagal mengambil riwayat dari J&T.",
        serviceCode: "",
      });
    } finally {
      setTrackBusy(false);
    }
  };

  // Status terbaru J&T SELALU diambil fresh saat drawer dibuka (bypass cache 5 menit),
  // supaya tidak menunggu klik "Lihat" dan tidak kena cache lama/riwayat kosong.
  useEffect(() => {
    if (!open || !awb) return;
    loadTrack(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, awb]);

  /**
   * Buka/tutup panel riwayat. SETIAP kali dibuka, riwayat diambil langsung dari J&T
   * (`refresh=1` → lewati cache 5 menit), jadi yang tampil selalu data terbaru.
   * Ini murni baca — tidak menulis database dan tidak mengubah status pesanan.
   */
  const toggleTrack = () => {
    const next = !trackOpen;
    setTrackOpen(next);
    if (next) loadTrack(true);
  };

  /** Buka modal Lacak (tampilan panel) — ambil riwayat terbaru dari J&T (read-only). */
  const openTrackModal = () => {
    setTrackModal(true);
    loadTrack(true);
  };

  // Scroll halaman dikunci selama drawer terbuka supaya scrollbar halaman tidak menimpa
  // tepi kanan drawer.
  useEffect(() => {
    if (!open) return undefined;
    const { body, documentElement } = document;
    const gap = window.innerWidth - documentElement.clientWidth;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingRight;
    body.style.overflow = "hidden";
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
    };
  }, [open]);

  // ── Tampilan PANEL (ala mockup) ──
  if (isPanel && order) {
    const stage = orderStage(order);
    const panelKey =
      { belum_bayar: "bayar", belum_dipacking: "packing", sudah_dipacking: "siap", dikirim: "kirim", selesai: "selesai", dibatalkan: "batal" }[stage] || "batal";
    const banner =
      {
        belum_bayar: ["Menunggu pembayaran", "Pesanan akan dibatalkan otomatis jika belum dibayar dalam 24 jam."],
        belum_dipacking: ["Pesanan perlu dipacking", "Kemas pesanan, lalu buat resi supaya paket siap diserahkan ke kurir."],
        sudah_dipacking: ["Menunggu pickup", "Resi sudah dibuat — paket menunggu dijemput kurir J&T."],
        dikirim: ["Pesanan dalam perjalanan", "Paket sedang diantar oleh kurir ke alamat pembeli."],
        selesai: ["Pesanan selesai", "Pesanan telah diterima oleh pembeli."],
        dibatalkan: ["Pesanan dibatalkan", order.notes || "Pesanan dibatalkan."],
      }[stage] || ["Pesanan", ""];
    const stepLevel = { belum_bayar: 0, belum_dipacking: 1, sudah_dipacking: 2, dikirim: 3, selesai: 4 }[stage] ?? 0;
    const region = [order.shipping_kecamatan, order.kota, order.shipping_province, order.shipping_postal_code].filter(Boolean).join(", ");
    const canDelete = (!order.awb_no || order.status === "dibatalkan") && order.source !== "website";
    // Tombol "Cetak Resi" ikut pindah ke footer, jadi footer juga harus tampil walau
    // pesanan tidak punya aksi lain (mis. pesanan website yang sudah dikirim).
    const canPrint = Boolean(awb) && order.status !== "dibatalkan";

    return (
      <AnimatePresence>
        {open && order && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="ov" onClick={onClose} />
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "tween", duration: 0.22 }}
              className="dr"
              role="dialog"
              aria-label="Detail Transaksi"
            >
              <div className="dh">
                <div>
                  <small>{order.source_label}</small>
                  <h3>Detail Pesanan</h3>
                </div>
                <button type="button" className="x" onClick={onClose} aria-label="Tutup">
                  <X size={18} />
                </button>
              </div>

              <div className="db">
                <div className={`ban b-${panelKey}`}>
                  <div className="bt">
                    <div>
                      <b>{banner[0]}</b>
                      <p>{banner[1]}</p>
                    </div>
                    <span className={`bd s-${panelKey}`}>{ORDER_STAGE_LABEL[stage]}</span>
                  </div>
                  {stage !== "dibatalkan" ? (
                    <div className="stp">
                      {["Dibayar", "Dikemas", "Dikirim", "Selesai"].map((label, index) => (
                        <div key={label} className={index < stepLevel ? "d" : ""}>
                          <i />
                          <span>{label}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="sec2">
                  <div className="sh">
                    <Truck />
                    <b>Informasi Pengiriman</b>
                    {awb ? (
                      <a onClick={openTrackModal} role="button" tabIndex={0}>
                        Lihat ›
                      </a>
                    ) : null}
                  </div>
                  <div className="kv">
                    <span>Kurir</span>
                    <b style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                      <JntBadge label="J&T Express" />
                    </b>
                  </div>
                  <div className="kv">
                    <span>Layanan</span>
                    <b>
                      <span className="bd s-siap">{serviceTag}</span>
                    </b>
                  </div>
                  {/* Panel resi (nomor + salin + buat resi) — komponen bersama. Tombol cetak
                      dipindah ke footer drawer lewat ref supaya berdampingan dengan "Ubah". */}
                  <TransaksiResiPanel
                    ref={resiPanelRef}
                    order={order}
                    onResiCreated={onResiCreated}
                    hidePrintButton
                    latestTracking={lastScan}
                    trackingState={track.status}
                  />
                </div>

                {order.shipping_address ? (
                  <div className="sec2">
                    <div className="sh">
                      <MapPin />
                      <b>Alamat Pengiriman</b>
                    </div>
                    <p className="adr">
                      <b>{order.customer_name}</b> {order.customer_whatsapp ? <span>({order.customer_whatsapp})</span> : null}
                      <br />
                      {order.shipping_address}
                      {region ? (
                        <>
                          <br />
                          {region}
                        </>
                      ) : null}
                    </p>
                  </div>
                ) : null}

                <div className="sec2">
                  <div className="sh">
                    <ShoppingBag />
                    <b>SAMAQU Official</b>
                  </div>
                  {(order.items || []).map((item, index) => (
                    <div className="it" key={`${item.product_id}-${item.color}-${item.size}-${index}`}>
                      <div className="th">
                        <img src={item.product_image || NEUTRAL_ITEM_PHOTO} alt={item.product_name} loading="lazy" decoding="async" />
                      </div>
                      <div>
                        <b>{item.product_name}</b>
                        <small>
                          {isPaketItem(item)
                            ? [item.kain ? `Kain ${item.kain}` : null, variantName(item.color) || variantName(item.series) || null]
                                .filter(Boolean)
                                .join(" · ")
                            : [item.kain ? `Kain ${item.kain}` : null, item.series, item.color && item.color !== "default" ? item.color : null, item.size]
                                .filter(Boolean)
                                .join(" · ")}
                        </small>
                        <small>× {item.quantity}</small>
                      </div>
                      <b className="mono">Rp {formatRupiah(item.price * item.quantity)}</b>
                    </div>
                  ))}
                  {(order.items || []).length === 0 ? <p className="adr">Tidak ada produk tercatat.</p> : null}
                  <div className="rw">
                    <span>Subtotal Produk</span>
                    <span>Rp {formatRupiah(order.subtotal)}</span>
                  </div>
                  <div className="rw">
                    <span>Subtotal Pengiriman</span>
                    <span>Rp {formatRupiah(order.shipping_cost)}</span>
                  </div>
                  {order.discount > 0 ? (
                    <div className="rw">
                      <span>Voucher Toko</span>
                      <span style={{ color: "#2f9e5b" }}>- Rp {formatRupiah(order.discount)}</span>
                    </div>
                  ) : null}
                  <div className="rw t">
                    <span>Total Pesanan</span>
                    <span style={{ color: "var(--panel-accent, #c2255c)" }}>Rp {formatRupiah(order.total)}</span>
                  </div>
                </div>

                <div className="sec2">
                  <div className="sh">
                    <CreditCard />
                    <b>Metode Pembayaran</b>
                    <span style={{ marginLeft: "auto", color: "#6b4b5a", fontWeight: 600 }}>{paymentDetail}</span>
                  </div>
                </div>

                {order.notes ? <div className="note">Catatan pembeli: {order.notes}</div> : null}

                <div className="sec2">
                  <div className="kv">
                    <span>No. Pesanan</span>
                    <b>{order.order_number}</b>
                  </div>
                  <div className="kv">
                    <span>Waktu Pemesanan</span>
                    <b>{formatTanggalJamID(order.created_at)}</b>
                  </div>
                  <div className="kv">
                    <span>Waktu Pembayaran</span>
                    <b>{order.paid_at ? formatTanggalJamID(order.paid_at) : "-"}</b>
                  </div>
                </div>
              </div>

              {order.can_edit || order.can_cancel || canDelete || canPrint ? (
                <div className="df">
                  {canDelete ? (
                    <button type="button" className="b-danger" onClick={() => onDelete?.(order)}>
                      Hapus
                    </button>
                  ) : null}
                  {order.can_edit ? (
                    <button type="button" className="b2" onClick={() => onEdit?.(order)}>
                      Ubah
                    </button>
                  ) : null}
                  {canPrint ? (
                    <button type="button" className="b2" onClick={() => resiPanelRef.current?.print()}>
                      Cetak Resi
                    </button>
                  ) : null}
                  {order.can_cancel ? (
                    <button type="button" className="b1" onClick={() => onCancel?.(order)}>
                      Batalkan
                    </button>
                  ) : null}
                </div>
              ) : null}
            </motion.aside>

            {trackModal ? (
              <div
                className="md"
                onClick={(event) => {
                  if (event.target === event.currentTarget) setTrackModal(false);
                }}
              >
                <div className="mc">
                  <div className="dh">
                    <div>
                      <small>J&amp;T Express</small>
                      <h3>Lacak Pengiriman</h3>
                      <small>
                        No. Resi <b style={{ color: "#2a1a22" }}>{awb}</b>
                      </small>
                    </div>
                    <button type="button" className="x" onClick={() => setTrackModal(false)} aria-label="Tutup">
                      <X size={18} />
                    </button>
                  </div>
                  {track.status === "loading" ? (
                    <p style={{ padding: "20px 24px", color: "#8a7d83", fontSize: 13 }}>Memuat riwayat dari J&amp;T…</p>
                  ) : track.status === "error" ? (
                    <p style={{ padding: "20px 24px", color: "#d63340", fontSize: 13, fontWeight: 600 }}>{track.error}</p>
                  ) : historyRows.length === 0 ? (
                    <p style={{ padding: "20px 24px", color: "#8a7d83", fontSize: 13 }}>Belum ada riwayat dari J&amp;T.</p>
                  ) : (
                    <ul className="trk">
                      {historyRows.map((row, index) => (
                        <li key={`${row.dateTime}-${index}`} className={index === 0 ? "d" : ""}>
                          <b>{row.status}</b>
                          <small>{[row.location, formatTrackingTime(row.dateTime)].filter(Boolean).join(" · ")}</small>
                          {row.note ? <small className="full">Catatan: {row.note}</small> : null}
                          {row.receiver ? <small className="full">Diterima oleh: {row.receiver}</small> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : null}
          </>
        )}
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      {open && order && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998]"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.22 }}
            className="fixed inset-y-0 right-0 z-[9999] w-full sm:max-w-md bg-white dark:bg-[#1a1d28] shadow-2xl flex flex-col"
            role="dialog"
            aria-label="Detail transaksi"
          >
            <div className="flex items-start justify-between gap-3 px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center">
                  <Receipt size={19} className="text-slate-700 dark:text-slate-200" />
                </div>
                <div>
                  <h3 className="font-heading font-bold text-slate-900 dark:text-white">Detail Transaksi</h3>
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{order.order_number}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Tutup"
              >
                <X size={18} className="text-slate-500 dark:text-slate-400" />
              </button>
            </div>

            <div className="transaksi-body flex-1 overflow-y-auto px-5 py-4 space-y-3.5" style={{ scrollbarWidth: "none" }}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${status?.badge || ""}`}>
                  {status?.icon ? <status.icon size={12} /> : null}
                  {order.status_label}
                </span>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${source?.badge || ""}`}>
                  {source?.icon ? <source.icon size={14} /> : null}
                  {order.source_label}
                </span>
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                <Row label="Pelanggan" value={order.customer_name} />
                <Row label="Nomor HP" value={order.customer_whatsapp || "-"} />
                <Row label="Waktu dicatat" value={formatTanggalJamID(order.created_at)} />
                <Row label="No. Order" value={order.order_number} mono />
                <Row label="Metode pembayaran" value={paymentDetail} />
                <Row
                  label="Waktu pembayaran"
                  value={order.paid_at ? formatTanggalJamID(order.paid_at) : "-"}
                />
                {order.notes ? <Row label="Catatan" value={order.notes} /> : null}
              </div>

              {order.shipping_address ? (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                    Alamat Pengiriman
                  </p>
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 px-3.5 py-2.5">
                    <p className="text-[13px] font-semibold text-slate-900 dark:text-white leading-snug">{order.shipping_address}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {[order.shipping_kecamatan, order.kota, order.shipping_province, order.shipping_postal_code]
                        .filter(Boolean)
                        .join(", ") || "Kelengkapan alamat belum terisi"}
                    </p>
                  </div>
                </div>
              ) : null}

              {/* Pengiriman & resi J&T (murni tampilan + aksi resi) */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Pengiriman J&T
                </p>
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 px-3.5 py-3 space-y-2.5">
                  {/* Nomor resi + tombol cetak + tombol Buat Resi — komponen bersama dengan
                      panel "Transaksi tercatat" setelah menyimpan transaksi baru. */}
                  <TransaksiResiPanel
                    order={order}
                    onResiCreated={onResiCreated}
                    latestTracking={lastScan}
                    trackingState={track.status}
                  />

                  {/* Lacak Resi cuma relevan kalau resinya sudah ada */}
                  {awb ? (
                    <>

                      {/* Lacak Resi: riwayat asli J&T (teks & catatan apa adanya, tanpa parafrase) */}
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
                            {/* Ringkasan penerima — sama seperti yang tampil di dashboard admin. */}
                            {track.status === "done" && trackSummary?.receiver ? (
                              <p className="px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800">
                                Diterima oleh: {trackSummary.receiver}
                              </p>
                            ) : null}
                            {track.status === "loading" ? (
                              <p className="px-3 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                Memuat riwayat dari J&T…
                              </p>
                            ) : track.status === "error" ? (
                              <p className="px-3 py-2.5 text-xs font-semibold text-red-600 dark:text-red-400">{track.error}</p>
                            ) : trackRows.length === 0 ? (
                              <p className="px-3 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                Belum ada riwayat dari J&T.
                              </p>
                            ) : (
                              <ul className="max-h-[196px] overflow-y-auto no-scrollbar divide-y divide-slate-100 dark:divide-slate-800">
                                {trackRows.map((row, index) => (
                                  <li key={`${row.dateTime}-${index}`} className="px-3 py-2">
                                    <p
                                      className={`text-xs font-bold ${
                                        row.warning ? "text-amber-600 dark:text-amber-400" : "text-slate-800 dark:text-slate-100"
                                      }`}
                                    >
                                      {row.status}
                                    </p>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                      {[row.location, formatTrackingTime(row.dateTime)].filter(Boolean).join(" • ")}
                                    </p>
                                    {row.note ? (
                                      <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                        Catatan: {row.note}
                                      </p>
                                    ) : null}
                                    {row.driver ? (
                                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Kurir: {row.driver}</p>
                                    ) : null}
                                    {/* Nama penerima dari J&T apa adanya — mis. siapa yang menerima paket. */}
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
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                  Memuat…
                                </span>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Produk ({order.items?.length || 0} item)
                </p>
                <div className="space-y-1.5">
                  {(order.items || []).map((item, index) => (
                    <div
                      key={`${item.product_id}-${item.color}-${item.size}-${index}`}
                      className="flex gap-2.5 rounded-xl border border-slate-200 dark:border-slate-800 p-2.5"
                    >
                      <div className="w-12 h-14 shrink-0 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800">
                        <img
                          src={item.product_image || NEUTRAL_ITEM_PHOTO}
                          alt={item.product_name}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{item.product_name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {isPaketItem(item)
                            ? [item.kain ? `Kain ${item.kain}` : null, variantName(item.color) || variantName(item.series) || null].filter(Boolean).join(" · ")
                            : [
                                item.kain ? `Kain ${item.kain}` : null,
                                item.series,
                                item.color && item.color !== "default" ? item.color : null,
                                item.size,
                              ]
                                .filter(Boolean)
                                .join(" · ")}{" "}
                          × {item.quantity}
                        </p>
                        {item.weight ? (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Berat:{" "}
                            <b className="text-slate-700 dark:text-slate-200">
                              {item.weight.source === "missing" ? "-" : formatWeightExact(item.weight.grams)}
                            </b>
                            {item.weight.source !== "variant" ? (
                              <span className="font-bold text-amber-600 dark:text-amber-400">
                                {" "}
                                ·{" "}
                                {item.weight.source === "product"
                                  ? "berat memakai fallback produk"
                                  : "berat per ukuran belum diisi"}
                              </span>
                            ) : null}
                          </p>
                        ) : null}
                        <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                          Rp {formatRupiah(item.price * item.quantity)}
                        </p>
                        {item.customer_price && item.minimum_price ? (
                          <p className="text-xs font-semibold" style={{ color: "#B4552F" }}>
                            Min: Rp {formatRupiah(item.minimum_price)} · Dipilih: Rp {formatRupiah(item.customer_price)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {(order.items || []).length === 0 && (
                    <p className="text-sm text-slate-500 dark:text-slate-400">Tidak ada produk tercatat.</p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                <Row label="Subtotal produk" value={`Rp ${formatRupiah(order.subtotal)}`} />
                <Row label="Ongkir" value={`Rp ${formatRupiah(order.shipping_cost)}`} />
                {order.discount > 0 ? <Row label="Diskon" value={`- Rp ${formatRupiah(order.discount)}`} /> : null}
                <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <span className="text-sm font-bold text-slate-900 dark:text-white">Total</span>
                  <span className="text-base font-black font-heading text-slate-900 dark:text-white whitespace-nowrap">
                    Rp {formatRupiah(order.total)}
                  </span>
                </div>
              </div>
            </div>

            {(order.can_edit || order.can_cancel) && (
              <div className="shrink-0 flex gap-2 px-5 py-3.5 border-t border-slate-200 dark:border-slate-800">
                {order.can_edit && (
                  <button
                    onClick={() => onEdit(order)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl hover:bg-slate-800 dark:hover:bg-slate-100 transition-all"
                  >
                    <Pencil size={16} /> Ubah
                  </button>
                )}
                {order.can_cancel && (
                  <button
                    onClick={() => onCancel(order)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 font-bold rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                  >
                    <Ban size={16} /> Batalkan
                  </button>
                )}
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex items-start justify-between gap-3 px-3.5 py-2">
      <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
      <span className={`text-sm font-semibold text-slate-900 dark:text-white text-right ${mono ? "font-mono" : ""}`}>
        {value}
      </span>
    </div>
  );
}
