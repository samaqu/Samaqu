"use client";

/**
 * Detail transaksi (panel samping) untuk menu Transaksi.
 *
 * Isinya sengaja hanya data yang benar-benar tercatat: info pelanggan, daftar item,
 * ongkir/diskon, total, sumber, status, dan waktu dicatat. Snapshot HPP hanya
 * ditampilkan kalau server mengirimkannya (Owner).
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Ban, CreditCard, MapPin, Pencil, Receipt, ShoppingBag, Trash2, Truck, X } from "lucide-react";
import { NEUTRAL_ITEM_PHOTO } from "@/lib/order-photo";
import { isPaketItem, variantName } from "@/lib/item-label";
import { ORDER_STAGE_LABEL, orderStage } from "@/lib/order-flow";
import CopyButton from "@/components/ui/CopyButton";
import { usePaymentMethodName } from "@/lib/use-payment-methods";
import { paymentChannelLabel } from "@/lib/payment-channel";
import { supabase } from "@/lib/supabase";
import { formatWeightExact } from "@/lib/shipping-weight";
import { waNumber } from "@/lib/whatsapp";
import { formatTrackingTime, sortHistoryDesc, trackingRow, trackingSummary } from "@/lib/jnt/track-status";
import { jntServiceTag } from "@/lib/jnt/layanan";
import JntBadge from "@/components/JntBadge";
import { SOURCE_STYLES, STATUS_STYLES, formatRupiah, formatTanggalJamID } from "@/components/ops/transaksi/transaksi-format";
import TransaksiResiPanel from "@/components/ops/transaksi/TransaksiResiPanel";
import PanelDetailPesanan, { PanelDetailShell, PanelLacakModal, jamWIB } from "@/components/ops/transaksi/PanelDetailPesanan";

export default function TransaksiDetailDrawer({ open, order, variant = "ops", owner = "panel", onClose, onEdit, onCancel, onDelete, onResiCreated }) {
  const isPanel = variant === "panel";
  // Tema tampilan baru: panel admin (default) memakai warna pastel, dashboard ops memakai
  // mono hitam-putih supaya sama dengan /admin. Ditentukan pemanggil, bukan ditebak.
  const tema = owner === "ops" ? "mono" : "warna";
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState("");
  const status = order ? STATUS_STYLES[order.status] : null;
  const source = order ? SOURCE_STYLES[order.source_key || order.source] : null;

  // Salin nomor (resi / pesanan) di tampilan panel — hanya umpan balik "Tersalin" sesaat.
  const [copied, setCopied] = useState("");
  const salin = async (jenis, nilai) => {
    if (!nilai) return;
    try {
      await navigator.clipboard.writeText(nilai);
      setCopied(jenis);
      window.setTimeout(() => setCopied(""), 1600);
    } catch {
      /* clipboard bisa diblokir browser */
    }
  };
  const copyResi = () => salin("resi", order?.awb_no || "");
  const copyNomor = () => salin("nomor", order?.order_number || "");

  // Nama metode pembayaran: `orders.payment_method` bisa berupa id ke tabel `payment_methods`
  // (pesanan baru) atau string lama ('bank'/'qris'/'cod'/'cash'). Hook ini yang menerjemahkannya.
  const { name: paymentName } = usePaymentMethodName(order?.payment_method);
  // Rincian channel gateway (mis. Mayar → "QRIS" / "BNI Virtual Account"), kalau sudah tercatat.
  const channelLabel = paymentChannelLabel(order?.payment_channel);
  const paymentDetail = paymentName
    ? `${paymentName}${channelLabel ? ` · ${channelLabel}` : ""}`
    : channelLabel || "-";

  const awb = order?.awb_no || "";
  const totalItemWeight = (order?.items || []).reduce((sum, item) => {
    const grams = Number(item?.weight?.grams) || 0;
    if (!grams || item?.weight?.source === "missing") return sum;
    return sum + grams * (Number(item?.quantity) || 1);
  }, 0);
  const totalWeight = Number(order?.weight) > 0 ? Number(order.weight) : totalItemWeight;

  async function changeStatus(next) {
    if (!order || statusBusy || next === order.status) return;
    if (next === "dibatalkan") {
      onCancel?.(order);
      return;
    }
    setStatusBusy(true);
    setStatusError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({ orderNumber: order.order_number, status: next }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Gagal memperbarui status");
      await onResiCreated?.({ status: next, updated_at: new Date().toISOString() });
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Gagal memperbarui status");
    } finally {
      setStatusBusy(false);
    }
  }
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

  // ── Tampilan PANEL (ala marketplace) ──
  // Semua data & aksi di blok ini SAMA dengan tampilan lama; yang berubah hanya markah/gayanya.
  if (isPanel && order) {
    const stage = orderStage(order);
    const panelWa = waNumber(order.customer_whatsapp || "");
    const canHubungiPanel = /^628[1-9][0-9]{6,10}$/.test(panelWa);
    const canDelete = (!order.awb_no || order.status === "dibatalkan") && order.source !== "website";
    const canPrint = Boolean(awb) && order.status !== "dibatalkan";
    const isSelesai = order.status === "selesai" || order.shipping_status === "selesai";
    const customerWa = waNumber(order.customer_whatsapp || "");
    const canHubungiCustomer = /^628[1-9][0-9]{6,10}$/.test(customerWa);
    const region = [order.shipping_kecamatan, order.kota, order.shipping_province, order.shipping_postal_code].filter(Boolean).join(", ");

    // Resi kosong: keterangan yang sesuai tahap.
    const resiKosong =
      stage === "belum_bayar"
        ? "Menunggu pembayaran"
        : stage === "dibatalkan"
          ? "Resi tidak tersedia"
          : "Resi belum dibuat";

    const itemsTampilan = (order.items || []).map((item, index) => {
      // Chip varian: kain & series berwarna biru, ukuran/qty netral (seperti mockup).
      const kain = item.kain ? { teks: `Kain ${item.kain}`, jenis: "kain" } : null;
      const series = variantName(item.series) ? { teks: variantName(item.series), jenis: "kain" } : null;
      const ukuranQty = { teks: `${item.size || ""}${item.size ? " · " : ""}x${item.quantity}`, jenis: "netral" };
      const chips = isPaketItem(item)
        ? [kain, variantName(item.color) ? { teks: variantName(item.color), jenis: "kain" } : null, ukuranQty]
        : [
            kain,
            series,
            variantName(item.color) ? { teks: variantName(item.color), jenis: "kain" } : null,
            ukuranQty,
          ];
      return {
        key: `${item.product_id}-${item.color}-${item.size}-${index}`,
        nama: item.product_name,
        chips: chips.filter(Boolean),
        harga: `Rp ${formatRupiah(item.price * item.quantity)}`,
        foto: item.product_image || NEUTRAL_ITEM_PHOTO,
      };
    });

    // Alasan tombol Ubah mati. Server hanya mengirim `can_edit` (tanpa alasannya), jadi
    // diturunkan dari status yang terlihat. Hanya dipakai untuk pesan; keputusan tetap
    // milik `can_edit` dari server.
    const editLockedReason = !order.can_edit
      ? order.status === "dikirim" || order.status === "selesai"
        ? "Pesanan sudah dikirim, item tidak bisa diubah lagi."
        : order.shipping_status === "dikirim" || order.shipping_status === "selesai"
          ? "Paket sudah berjalan, item tidak bisa diubah lagi."
          : order.status === "dibatalkan"
            ? "Pesanan sudah dibatalkan."
            : "Item pesanan ini terkunci (stok tidak tercatat sistem atau pengiriman sudah dimulai)."
      : "";

    // Footer: bahaya (Batalkan) → sekunder (Ubah) → utama paling lebar, sesuai mockup.
    const aksi = [];
    if (order.can_cancel) aksi.push({ key: "batal", label: "Batalkan", jenis: "bahaya", onClick: () => onCancel?.(order) });
    if (order.can_edit) aksi.push({ key: "ubah", label: "Ubah", jenis: "sekunder", onClick: () => onEdit?.(order) });
    // Pesanan yang lolos cek status dasar tapi kunci karena stok/pengiriman: tampilkan
    // tombolnya dalam keadaan mati + alasan, supaya tidak terlihat seperti tombol hilang.
    else if (order.edit_warning || editLockedReason) {
      aksi.push({
        key: "ubah-terkunci",
        label: "Ubah",
        jenis: "sekunder",
        disabled: true,
        hint: editLockedReason,
        onClick: () => {},
      });
    }
    // Proses: pending → diproses, sama dengan chip status di /admin. Ditaruh sebagai aksi
    // utama kalau belum ada aksi utama lain (mis. pesanan belum bayar tanpa tombol bayar).
    const bisaProses =
      order.status === "pending" || (order.status === "diproses" && order.shipping_status !== "dikirim");
    if (bisaProses && order.status !== stage) {
      aksi.push({
        key: "proses",
        label: statusBusy ? "Memproses…" : "Proses Pesanan",
        jenis: "sekunder",
        disabled: statusBusy,
        onClick: () => changeStatus("diproses"),
      });
    }
    if (isSelesai) {
      aksi.push({
        key: "hubungi",
        label: "Hubungi Customer",
        jenis: "utama",
        disabled: !canHubungiCustomer,
        onClick: () => {
          if (canHubungiCustomer) window.open(`https://wa.me/${customerWa}`, "_blank", "noopener,noreferrer");
        },
      });
    } else if (canPrint) {
      aksi.push({ key: "cetak", label: "Cetak Resi", jenis: "utama", onClick: () => resiPanelRef.current?.print() });
    } else if (order.status !== "dibatalkan") {
      // Resi belum ada: tombol tetap ditampilkan (mati) supaya admin tidak mengira fiturnya
      // hilang — alasannya muncul sebagai tooltip.
      aksi.push({
        key: "cetak",
        label: "Cetak Resi",
        jenis: "utama",
        disabled: true,
        hint: "Resi belum dibuat. Terbitkan resi dulu (Atur Pesanan / input resi HBO).",
        onClick: () => {},
      });
    }
    if (canDelete) aksi.push({ key: "hapus", label: "Hapus", jenis: "sekunder", onClick: () => onDelete?.(order) });

    // Pop-up Lacak: pakai komponen bersama (sama dengan /admin), bukan markup lokal lagi.
    const lacakModal = (
      <PanelLacakModal
        open={trackModal}
        onClose={() => setTrackModal(false)}
        resi={awb}
        loading={track.status === "loading"}
        error={track.status === "error" ? track.error : ""}
        riwayat={historyRows.map((row, index) => ({
          key: `${row.dateTime}-${index}`,
          status: row.status,
          meta: [row.location, formatTrackingTime(row.dateTime)].filter(Boolean).join(" · "),
          note: row.note,
          receiver: row.receiver,
          terbaru: index === 0,
        }))}
      />
    );

    // Khusus belum bayar: aksi utama "Ingatkan Bayar" (WhatsApp berisi nomor pesanan & total).
    if (stage === "belum_bayar" && canHubungiPanel) {
      const pesan = `Halo Kak, pesanan ${order.order_number} di SAMAQU sudah masuk. Totalnya Rp ${formatRupiah(order.total)}. Yuk diselesaikan pembayarannya supaya bisa segera kami proses. Terima kasih!`;
      aksi.push({
        key: "ingatkan",
        label: "Ingatkan Bayar",
        jenis: "utama",
        onClick: () => window.open(`https://wa.me/${panelWa}?text=${encodeURIComponent(pesan)}`, "_blank", "noopener,noreferrer"),
      });
    }

    return (
      <PanelDetailShell open={open} onClose={onClose} tema={tema}>
        <PanelDetailPesanan
          tema={tema}
          sumber={order.source_label}
          tahap={stage}
          createdAt={order.created_at}
          onClose={onClose}
          nama={order.customer_name}
          telepon={order.customer_whatsapp || ""}
          alamat={[order.shipping_address, region].filter(Boolean).join(", ")}
          kurir="J&T Express"
          layanan={jntServiceTag(track.serviceCode || order.shipping_method).replace(/^Service\s+/i, "")}
          resi={awb}
          resiKosong={resiKosong}
          onLacak={openTrackModal}
          onSalinResi={copyResi}
          resiTersalin={copied === "resi"}
          berat={totalWeight > 0 ? formatWeightExact(totalWeight) : "-"}
          statusKirim={lastScan?.status}
          statusKirimMeta={
            lastScan ? [lastScan.location, lastScan.dateTime ? formatTrackingTime(lastScan.dateTime) : ""].filter(Boolean).join(" · ") : ""
          }
          items={itemsTampilan}
          subtotal={order.subtotal}
          ongkir={order.shipping_cost}
          diskon={order.discount}
          total={order.total}
          metodeBayar={paymentDetail}
          waktuPesan={jamWIB(order.created_at)}
          waktuBayar={order.paid_at ? jamWIB(order.paid_at) : null}
          nomorPesanan={order.order_number}
          onSalinNomor={copyNomor}
          nomorTersalin={copied === "nomor"}
          onChat={() => {
            if (canHubungiCustomer) window.open(`https://wa.me/${customerWa}`, "_blank", "noopener,noreferrer");
          }}
          aksi={aksi}
          ekstra={
            /* Hanya dikirim kalau memang ada isinya — fragment kosong membuat kartu putih
               kosong menggantung di atas footer. */
            order.items_edited_after_resi || order.notes || statusError || (editLockedReason && order.status !== "dibatalkan") ? (
              <>
                {order.items_edited_after_resi && awb ? (
                  <div className="dp-warning" role="status">
                    Item diubah setelah resi terbit. Cetak ulang label dan beri tahu tim packing. Label lama jangan dipakai.
                    Nomor resi tetap <b>{awb}</b>.
                  </div>
                ) : null}
                {order.notes ? <p className="dp-catatan">Catatan pembeli: {order.notes}</p> : null}
                {editLockedReason && order.status !== "dibatalkan" ? (
                  <p className="dp-catatan">Ubah terkunci: {editLockedReason}</p>
                ) : null}
                {statusError ? <p className="dp-error">{statusError}</p> : null}
              </>
            ) : null
          }
        >
          {/* Panel resi asli: buat resi, resi HBO, tandai dikirim, cetak (logic lama, tidak diubah).
              `compact` karena nomor resi sudah tampil di blok resi bergradasi. */}
          <TransaksiResiPanel
            ref={resiPanelRef}
            order={order}
            onResiCreated={onResiCreated}
            hidePrintButton
            compact
            latestTracking={lastScan}
            trackingState={track.status}
          />
        </PanelDetailPesanan>
        {lacakModal}
      </PanelDetailShell>
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
            <div className="flex shrink-0 items-start justify-between gap-3 px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
              <div className="flex min-w-0 items-center gap-3">
                <div className="w-10 h-10 shrink-0 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center">
                  <Receipt size={19} className="text-slate-700 dark:text-slate-200" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-heading font-bold text-slate-900 dark:text-white truncate">Detail Transaksi</h3>
                  <p className="inline-flex min-w-0 items-center gap-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                    <span className="truncate">{order.order_number}</span>
                    <CopyButton value={order.order_number} label="nomor pesanan" />
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="shrink-0 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Tutup"
              >
                <X size={18} className="text-slate-500 dark:text-slate-400" />
              </button>
            </div>

            <div className="transaksi-body flex-1 overflow-y-auto px-5 py-4 space-y-3.5" style={{ scrollbarWidth: "none" }}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${status?.badge || ""}`}>
                  {status?.icon ? <status.icon size={12} /> : null}
                  {ORDER_STAGE_LABEL[orderStage(order)]}
                </span>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${source?.badge || ""}`}>
                  {source?.icon ? <source.icon size={14} /> : null}
                  {order.source_label}
                </span>
              </div>

              {order.status !== "dibatalkan" ? (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                    Atur Status Pesanan
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: "pending", label: "Belum Bayar" },
                      { value: "diproses", label: "Lunas" },
                      { value: "selesai", label: "Selesai" },
                      { value: "dibatalkan", label: "Batalkan" },
                    ].map((option) => {
                      const active = order.status === option.value;
                      const danger = option.value === "dibatalkan";
                      return (
                        <button
                          key={option.value}
                          type="button"
                          disabled={statusBusy || active}
                          onClick={() => changeStatus(option.value)}
                          className={`rounded-xl border px-3 py-2 text-xs font-bold transition-colors disabled:opacity-50 ${
                            active
                              ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
                              : danger
                                ? "border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-900/20"
                                : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  {statusError ? (
                    <p className="mt-2 text-[11px] font-semibold text-red-600 dark:text-red-400">{statusError}</p>
                  ) : null}
                </div>
              ) : null}

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                <Row label="Pelanggan" value={order.customer_name} />
                <Row label="Nomor HP" value={order.customer_whatsapp || "-"} />
                <Row label="Waktu dicatat" value={formatTanggalJamID(order.created_at)} />
                <Row label="No. Order" value={order.order_number} mono />
                <Row label="Berat kirim" value={totalWeight > 0 ? formatWeightExact(totalWeight) : "-"} />
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

            {(order.can_edit || order.can_cancel || canHubungiPanel || canDeletePanel) && (
              <div className="shrink-0 flex flex-wrap gap-2 px-5 py-3.5 border-t border-slate-200 dark:border-slate-800">
                {canDeletePanel && (
                  <button
                    type="button"
                    onClick={() => onDelete(order)}
                    className="flex-1 min-w-[calc(50%-0.25rem)] flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 font-bold rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                  >
                    <Trash2 size={16} /> Hapus
                  </button>
                )}
                {order.can_edit && (
                  <button
                    onClick={() => onEdit(order)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl hover:bg-slate-800 dark:hover:bg-slate-100 transition-all"
                  >
                    <Pencil size={16} /> Ubah
                  </button>
                )}
                {canHubungiPanel && (
                  <button
                    type="button"
                    onClick={() => window.open(`https://wa.me/${panelWa}`, "_blank", "noopener,noreferrer")}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                  >
                    Hubungi
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

function PackagingWarning({ warning }) {
  if (!warning) return null;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-semibold text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
      Stok komponen kemasan sempat kurang saat pesanan dikemas. Cek stok komponen di menu Produksi.
    </div>
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
