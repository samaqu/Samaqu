"use client";

/**
 * Panel resi J&T untuk menu Transaksi (ops) — dipakai di DUA tempat supaya perilakunya sama persis:
 *  1. drawer Detail Transaksi (section "Pengiriman J&T"), dan
 *  2. panel "Transaksi tercatat" setelah menyimpan transaksi baru.
 *
 * Isinya: tampilan nomor resi (bisa disalin) + status kirim + tombol cetak dua ukuran, dan tombol
 * "Buat Resi" dengan pra-cek + dialog konfirmasi bila resinya belum ada.
 *
 * Yang SENGAJA tidak dilakukan:
 *  - tidak membuat resi otomatis: pembuatan resi selalu lewat klik eksplisit + konfirmasi,
 *    karena ini aksi sungguhan ke J&T (kurir menjemput, resinya tidak bisa dibatalkan dari sini);
 *  - tidak ada retry otomatis; satu kali klik = satu kali panggil.
 *
 * Endpoint yang dipakai semuanya sudah ada: `Resi.check` (pra-cek baca-saja) dan
 * `Transaction.createResi` (route admin `PATCH /api/admin/orders` aksi `createJnt`, apa adanya).
 */

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Clipboard, ClipboardCheck, Truck } from "lucide-react";
import { base44 } from "@/lib/ops-api";
import { formatWeightExact } from "@/lib/shipping-weight";
import { formatRupiah } from "@/components/ops/transaksi/transaksi-format";
import { formatTrackingTime } from "@/lib/jnt/track-status";
import { jntServiceCodeFromShippingMethod } from "@/lib/jnt/layanan";

/** Label status kirim yang dipakai layar (nilainya dari `orders.shipping_status`). */
const SHIPPING_STATUS_LABEL = { menunggu_pickup: "Menunggu pickup", dikirim: "Dikirim", selesai: "Selesai" };

/** Pesan khusus dari route createJnt: resi sudah terbit di J&T tapi gagal dicatat di sistem. */
const RESI_ISSUED_NOT_SAVED = "Resi J&T terbit tapi gagal disimpan";

/** Ukuran label terakhir yang dipakai admin — biar tidak memilih lagi tiap kali mencetak. */
const LABEL_SIZE_KEY = "samaqu:ops-label-size";

function readLabelSize() {
  try {
    const stored = window.localStorage.getItem(LABEL_SIZE_KEY);
    return stored === "78x100" || stored === "100x150" ? stored : "100x150";
  } catch {
    return "100x150";
  }
}

const TransaksiResiPanel = forwardRef(function TransaksiResiPanel(
  { order, onResiCreated, hidePrintButton = false, latestTracking = null, trackingState = "idle" },
  ref,
) {
  const [resiCheck, setResiCheck] = useState(null);
  const [resiChecking, setResiChecking] = useState(false);
  const [resiBusy, setResiBusy] = useState(false);
  const [resiError, setResiError] = useState("");
  const [resiIssuedWarning, setResiIssuedWarning] = useState(false);
  /** Pengaman klik tak sengaja: wajib dicentang sebelum resi benar-benar dibuat. */
  const [siapKirim, setSiapKirim] = useState(false);
  const [copied, setCopied] = useState(false);
  /** Resi yang baru saja dibuat dari panel ini (langsung tampil tanpa menunggu muat ulang). */
  const [createdAwb, setCreatedAwb] = useState("");
  const [labelSize, setLabelSize] = useState(readLabelSize);
  /** Ukuran yang sedang dikonfirmasi untuk dicetak ("" = dialog cetak tertutup). */
  const [printSize, setPrintSize] = useState("");
  /** Kunci proses per transaksi: klik beruntun / Enter berulang tidak mengirim dua panggilan. */
  const resiLock = useRef(false);
  /**
   * Resi manual (HBO): pesanannya sudah dibuat admin di J&T VIP, jadi nomor resinya diketik di
   * sini. Form dibuka otomatis kalau layanan tersimpan memang HBO.
   */
  const [manualOpen, setManualOpen] = useState(false);
  const [manualAwb, setManualAwb] = useState("");
  const [manualShipped, setManualShipped] = useState("belum");
  const [manualBusy, setManualBusy] = useState(false);
  const [packagingPreview, setPackagingPreview] = useState(null);
  const [packagingQty, setPackagingQty] = useState({});
  const [packagingLoading, setPackagingLoading] = useState(false);
  const [packagingWarning, setPackagingWarning] = useState(false);
  const [manualError, setManualError] = useState("");
  const [shippingBusy, setShippingBusy] = useState(false);

  const awb = createdAwb || order?.awb_no || "";
  const cancelled = order?.status === "dibatalkan";
  /** Resi sudah di-void di J&T (`orders.jnt_void_status`) — labelnya tidak boleh dicetak lagi. */
  const voided = cancelled || order?.jnt_void_status === "voided";
  /** Baris kecil di bawah status: lokasi + waktu scan terakhir dari J&T. */
  const trackingMeta = latestTracking
    ? [latestTracking.location, formatTrackingTime(latestTracking.dateTime)].filter(Boolean).join(" · ")
    : "";

  // Panel admin menaruh tombol "Cetak Resi" di footer drawer (sebelah "Ubah"). Aksinya
  // dipanggil dari luar lewat ref, supaya dialog pilih ukuran tetap satu sumber di sini.
  useImperativeHandle(ref, () => ({
    print: () => {
      if (awb && !voided) setPrintSize(labelSize);
    },
  }), [awb, voided, labelSize]);

  if (!order) return null;

  const shippingStatus = createdAwb ? "menunggu_pickup" : order.shipping_status || "";
  /** Layanan tersimpan — HBO = pesanan dibuat manual di J&T VIP, resinya diinput admin. */
  const isHbo = jntServiceCodeFromShippingMethod(order.shipping_method) === "HBO";
  /** Pesanan sudah diterima: resi final, opsi ganti/input resi manual ditutup. */
  const resiFinal = cancelled || order.status === "selesai" || shippingStatus === "selesai";
  const manualFormOpen = !resiFinal && (manualOpen || (isHbo && !awb));
  const bisaTandaiDikirim =
    !!awb &&
    !cancelled &&
    order.status !== "dikirim" &&
    order.status !== "selesai" &&
    shippingStatus !== "dikirim" &&
    shippingStatus !== "selesai";

  /** Paket kemasan default dari resep; harga hanya ada kalau pemanggil Owner. */
  const loadPackaging = async () => {
    if (!order.order_number) return;
    setPackagingLoading(true);
    setPackagingPreview(null);
    setPackagingWarning(false);
    try {
      const data = await base44.entities.Transaction.packaging(order.order_number);
      setPackagingPreview(data);
      setPackagingQty(
        Object.fromEntries(
          (data?.items || []).map((item) => [item.component_id, String(item.qty)]),
        ),
      );
    } catch {
      setPackagingPreview(null);
    } finally {
      setPackagingLoading(false);
    }
  };

  const getPackagingPayload = () => {
    if (!packagingPreview || packagingPreview.already_packaged) return undefined;
    return {
      items: (packagingPreview.items || [])
        .map((item) => ({
          component_id: item.component_id,
          qty: Number(packagingQty[item.component_id] ?? item.qty),
        }))
        .filter((item) => Number.isFinite(item.qty) && item.qty > 0),
    };
  };

  useEffect(() => {
    if (!manualFormOpen) return;
    loadPackaging();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualFormOpen, order.order_number]);

  /** Langkah 1: pra-cek baca-saja (server memeriksa alamat, nomor, kode area J&T, berat). */
  const openResiConfirm = async () => {
    if (resiLock.current || resiChecking) return;
    resiLock.current = true;
    setResiChecking(true);
    setResiError("");
    setResiIssuedWarning(false);
    // Selalu mulai dari belum dicentang — pengaman dari klik tak sengaja.
    setSiapKirim(false);
    setResiCheck(null);
    void loadPackaging();
    try {
      const result = await base44.entities.Resi.check(order.order_number);
      setResiCheck(result);
    } catch (error) {
      setResiError(error instanceof Error ? error.message : "Gagal memeriksa data resi. Coba lagi.");
    } finally {
      setResiChecking(false);
      resiLock.current = false;
    }
  };

  const closeResiConfirm = () => {
    if (resiBusy) return;
    setResiCheck(null);
    setResiError("");
    setSiapKirim(false);
  };

  /** Langkah 2: panggil pembuatan resi (aksi sungguhan ke J&T). Tidak ada retry otomatis. */
  const submitResi = async () => {
    if (resiLock.current || resiBusy) return;
    resiLock.current = true;
    setResiBusy(true);
    setResiError("");
    try {
      const result = await base44.entities.Transaction.createResi(order.order_number, getPackagingPayload());
      const awbNo = result?.awbNo || "";
      setPackagingWarning(Boolean(result?.packagingWarning));
      setCreatedAwb(awbNo);
      setResiBusy(false);
      setResiCheck(null);
      resiLock.current = false;
      onResiCreated?.({
        awb_no: awbNo,
        shipping_status: result?.shippingStatus || "menunggu_pickup",
        ...(result?.serviceCode ? { shipping_method: `J&T ${result.serviceCode}` } : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal membuat resi. Coba lagi.";
      setResiBusy(false);
      resiLock.current = false;
      // Kondisi khusus: resi sudah terbit di J&T tapi gagal dicatat → JANGAN tawarkan coba lagi.
      if (message.includes(RESI_ISSUED_NOT_SAVED)) {
        setResiCheck(null);
        setResiIssuedWarning(true);
        onResiCreated?.(null, true);
        return;
      }
      setResiError(message);
    }
  };

  const copyAwb = async () => {
    if (!awb) return;
    try {
      await navigator.clipboard.writeText(awb);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  /** Buka halaman label yang sudah ada; ukuran terakhir diingat supaya cetak berikutnya cepat. */
  const openLabel = (size) => {
    try {
      window.localStorage.setItem(LABEL_SIZE_KEY, size);
    } catch {
      /* localStorage bisa diblokir — abaikan, cetak tetap jalan */
    }
    setLabelSize(size);
    // Panel admin (admin.samaqu.id → /panel-admin/*) punya halaman label sendiri. Kalau dipaksa
    // "/admin/label", host admin me-rewrite-nya jadi /panel-admin/admin/label → 404.
    const labelBase = window.location.pathname.startsWith("/panel-admin") ? "/panel-admin/label" : "/admin/label";
    window.open(`${labelBase}/${order.order_number}?size=${size}`, "_blank", "noopener,noreferrer");
  };

  const sizeLabel = (size) => (size === "78x100" ? "Cetak 78 × 100 mm" : "Cetak 100 × 150 mm");

  /** Simpan nomor resi yang dibuat manual di J&T VIP (HBO). Bisa dipakai untuk mengedit resi. */
  const submitManualResi = async () => {
    if (manualBusy) return;
    const resi = manualAwb.trim();
    setManualError("");
    if (!resi) {
      setManualError("Nomor resi wajib diisi.");
      return;
    }
    setManualBusy(true);
    try {
      const result = await base44.entities.Transaction.createManualResi(
        order.order_number,
        resi,
        manualShipped === "sudah",
        getPackagingPayload(),
      );
      const awbNo = result?.awbNo || resi;
      setPackagingWarning(Boolean(result?.packagingWarning));
      setCreatedAwb(awbNo);
      setManualOpen(false);
      onResiCreated?.({
        awb_no: awbNo,
        shipping_status: result?.shippingStatus || (manualShipped === "sudah" ? "dikirim" : "menunggu_pickup"),
        ...(result?.status ? { status: result.status } : {}),
        shipping_method: "J&T HBO",
      });
    } catch (error) {
      setManualError(error instanceof Error ? error.message : "Gagal menyimpan nomor resi. Coba lagi.");
    } finally {
      setManualBusy(false);
    }
  };

  /** "Tandai Dikirim" untuk resi HBO yang sebelumnya belum dijemput. */
  const tandaiDikirim = async () => {
    if (shippingBusy) return;
    setShippingBusy(true);
    setManualError("");
    try {
      const result = await base44.entities.Transaction.markShipped(order.order_number);
      onResiCreated?.({
        awb_no: result?.awbNo || awb,
        shipping_status: "dikirim",
        ...(result?.status ? { status: result.status } : {}),
      });
    } catch (error) {
      setManualError(error instanceof Error ? error.message : "Gagal menandai dikirim. Coba lagi.");
    } finally {
      setShippingBusy(false);
    }
  };

  const inputClass =
    "mt-1 w-full px-3 py-2 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-900 dark:text-white focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none disabled:opacity-60";

  const packagingForm = (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Paket kemasan
        </p>
        {packagingPreview?.already_packaged ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            Sudah dikemas
          </span>
        ) : null}
      </div>

      {packagingLoading ? (
        <p className="mt-2 text-[11px] font-semibold text-slate-400">Memuat paket kemasan…</p>
      ) : !packagingPreview ? (
        <p className="mt-2 text-[11px] font-semibold text-slate-400">
          Paket default akan dihitung server saat resi dibuat.
        </p>
      ) : (packagingPreview.items || []).length === 0 ? (
        <p className="mt-2 text-[11px] font-semibold text-slate-400">
          Tidak ada komponen kemasan di resep kategori ini.
        </p>
      ) : (
        <>
          <div className="mt-2 space-y-1.5">
            {(packagingPreview.items || [])
              .map((item) => {
                const qty = Number(packagingQty[item.component_id] ?? item.qty) || 0;
                const shortage = item.stock != null && qty > Number(item.stock);
                return (
                  <div key={item.component_id} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-bold text-slate-700 dark:text-slate-200">
                        {item.component_name}
                      </p>
                      <p className={`text-[9.5px] font-semibold ${shortage ? "text-amber-600 dark:text-amber-400" : "text-slate-400"}`}>
                        {item.stock != null ? `stok ${item.stock} ${item.unit_use || ""}` : item.unit_use || ""}
                        {shortage ? " · akan minus" : ""}
                        {item.real_price != null ? ` · Rp ${formatRupiah(item.real_price)}` : ""}
                      </p>
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={packagingQty[item.component_id] ?? item.qty}
                      onChange={(event) =>
                        setPackagingQty((current) => ({
                          ...current,
                          [item.component_id]: event.target.value,
                        }))
                      }
                      disabled={packagingPreview.already_packaged}
                      className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-xs font-bold text-slate-800 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                );
              })}
          </div>
        </>
      )}
    </div>
  );

  const manualForm = (
    <div className="space-y-2.5">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
        Pesanan HBO dibuat manual di J&amp;T VIP, masukkan nomor resi di sini.
      </p>
      <label className="block">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Nomor Resi HBO
        </span>
        <input
          type="text"
          value={manualAwb}
          onChange={(event) => setManualAwb(event.target.value)}
          placeholder="Mis. JP1234567890"
          disabled={manualBusy}
          className={`${inputClass} font-mono`}
        />
      </label>
      <label className="block">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Status paket
        </span>
        <select
          value={manualShipped}
          onChange={(event) => setManualShipped(event.target.value)}
          disabled={manualBusy}
          className={inputClass}
        >
          <option value="belum">Baru dibuat, belum dijemput</option>
          <option value="sudah">Sudah dikirim</option>
        </select>
      </label>
      {packagingForm}
      {manualError ? <p className="text-xs font-semibold text-red-600 dark:text-red-400">{manualError}</p> : null}
      <div className="flex gap-2">
        {awb ? (
          <button
            type="button"
            onClick={() => {
              setManualOpen(false);
              setManualError("");
            }}
            disabled={manualBusy}
            className="flex-1 px-3 py-2.5 border-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-sm hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 transition-all"
          >
            Batal
          </button>
        ) : null}
        <button
          type="button"
          onClick={submitManualResi}
          disabled={manualBusy}
          className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl text-sm hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-60 transition-all"
        >
          <Truck size={15} /> {manualBusy ? "Menyimpan…" : "Simpan Resi"}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {packagingWarning ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
          Kemasan belum tercatat sempurna (stok minus atau gagal simpan). Resi tetap dibuat. Cek menu Produksi.
        </div>
      ) : null}

      {awb ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Nomor Resi</p>
              <p className="text-sm font-black font-mono text-slate-900 dark:text-white truncate">{awb}</p>
            </div>
            <button
              type="button"
              onClick={copyAwb}
              className={`shrink-0 inline-flex items-center justify-center p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${
                copied ? "text-emerald-600 dark:text-emerald-400" : "text-slate-600 dark:text-slate-300"
              }`}
              aria-label={copied ? "Nomor resi tersalin" : "Salin nomor resi"}
              title={copied ? "Tersalin" : "Salin nomor resi"}
            >
              {copied ? <ClipboardCheck size={15} /> : <Clipboard size={15} />}
            </button>
          </div>

          {/* Pesanan yang sudah dibatalkan: `shipping_status` lama masih "menunggu_pickup"
              (jalur pembatalan tidak mengubah kolom itu), jadi ditampilkan "Dibatalkan". */}
          {cancelled ? (
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Status: <b className="text-red-600 dark:text-red-400">Dibatalkan</b>
            </p>
          ) : latestTracking ? (
            /* Status J&T ditampilkan APA ADANYA (tanpa label karangan) + scan terakhirnya. */
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Status terbaru:{" "}
                <b className="text-slate-700 dark:text-slate-200">{latestTracking.status}</b>
              </p>
              {trackingMeta ? (
                <p className="mt-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">{trackingMeta}</p>
              ) : null}
            </div>
          ) : shippingStatus || trackingState === "loading" ? (
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Status kirim:{" "}
              <b className="text-slate-700 dark:text-slate-200">
                {trackingState === "loading" ? "memuat…" : SHIPPING_STATUS_LABEL[shippingStatus] || shippingStatus}
              </b>
            </p>
          ) : null}

          {!voided && !hidePrintButton ? (
            /* Satu tombol saja (alurnya sama dengan "Buat Resi" / "Atur Pesanan"): klik → popup
               → pilih ukuran label → halaman label dibuka di tab baru. */
            <button
              type="button"
              onClick={() => setPrintSize(labelSize)}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 border-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
            >
              Cetak Resi
            </button>
          ) : null}

          {/* Resi HBO: dibuat manual di J&T VIP — admin bisa mengedit nomornya dan menandai
              paket sudah dikirim (notifikasi menyusul lewat jalur yang sama dengan EZ/ECO). */}
          {!resiFinal ? (
            manualOpen ? (
              manualForm
            ) : (
              <button
                type="button"
                onClick={() => {
                  setManualOpen(true);
                  setManualAwb(awb);
                  setManualError("");
                  // Pesanan yang paketnya sudah jalan jangan dimundurkan saat resinya diedit.
                  setManualShipped(shippingStatus === "dikirim" || shippingStatus === "selesai" ? "sudah" : "belum");
                }}
                className="w-full text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors"
              >
                {isHbo ? "Ubah nomor resi" : "Ganti ke resi HBO (input manual)"}
              </button>
            )
          ) : null}

          {!manualOpen && manualError ? (
            <p className="text-xs font-semibold text-red-600 dark:text-red-400">{manualError}</p>
          ) : null}

          {bisaTandaiDikirim ? (
            <button
              type="button"
              onClick={tandaiDikirim}
              disabled={shippingBusy}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl text-sm hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-60 transition-all"
            >
              <Truck size={15} /> {shippingBusy ? "Memproses…" : "Tandai Dikirim"}
            </button>
          ) : null}
        </>
      ) : cancelled ? (
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          Pesanan ini sudah dibatalkan, jadi resi tidak dibuat dari sini.
        </p>
      ) : manualFormOpen ? (
        manualForm
      ) : order.status === "diproses" ? (
        <>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Belum ada resi J&T. Nomor resi dibuat di J&T dan kurir akan menjemput paket.
          </p>
          <button
            type="button"
            onClick={openResiConfirm}
            disabled={resiChecking}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl text-sm hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-60 transition-all"
          >
            <Truck size={15} /> {resiChecking ? "Memeriksa data…" : "Buat Resi"}
          </button>
          {/* Pesanan HBO tidak dibuat lewat API J&T — resinya diinput dari J&T VIP. */}
          <button
            type="button"
            onClick={() => {
              setManualOpen(true);
              setManualAwb("");
              setManualError("");
            }}
            className="w-full text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors"
          >
            Input resi manual (HBO)
          </button>
        </>
      ) : (
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          Resi untuk pesanan ini dibuat lewat alur pesanan, bukan dari menu Transaksi.
        </p>
      )}

      {resiError && !resiCheck ? (
        <p className="text-xs font-semibold text-red-600 dark:text-red-400">{resiError}</p>
      ) : null}

      {resiIssuedWarning ? (
        <div className="rounded-lg border-2 border-amber-300 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5">
          <p className="text-xs font-black text-amber-800 dark:text-amber-200">
            Resi sudah terbit di J&T tetapi belum tercatat di sistem.
          </p>
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-200 mt-1">
            JANGAN klik Buat Resi lagi. Muat ulang halaman untuk melihat apakah resi sudah tercatat, dan hubungi admin
            sistem bila belum.
          </p>
        </div>
      ) : null}

      {/* Konfirmasi "Buat Resi": hasil pra-cek + peringatan sebelum memanggil J&T */}
      <AnimatePresence>
        {resiCheck && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-5"
            onClick={closeResiConfirm}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="w-full max-w-md max-h-full overflow-y-auto no-scrollbar rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1d28] p-5 shadow-xl"
              onClick={(event) => event.stopPropagation()}
            >
              <h4 className="font-heading font-bold text-slate-900 dark:text-white">Buat resi J&T?</h4>

              <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                <div className="px-3.5 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Penerima</p>
                  <p className="font-bold text-slate-900 dark:text-white">{resiCheck.receiver?.name || "-"}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{resiCheck.receiver?.phone || "-"}</p>
                </div>
                <div className="px-3.5 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Alamat</p>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 leading-snug">
                    {resiCheck.receiver?.address || "-"}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {[resiCheck.receiver?.kecamatan, resiCheck.receiver?.city, resiCheck.receiver?.postal_code]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </div>
                <div className="px-3.5 py-2 flex items-center justify-between gap-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Berat estimasi</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{formatWeightExact(resiCheck.weight_grams)}</p>
                </div>
              </div>

              <div className="mt-3">{packagingForm}</div>

              <ul className="mt-3 space-y-1.5">
                {(resiCheck.checks || []).map((check) => (
                  <li key={check.key} className="flex items-start gap-2 text-xs">
                    <span className={check.ok ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
                      {check.ok ? "✓" : "!"}
                    </span>
                    <span className="min-w-0">
                      <span className={`font-bold ${check.ok ? "text-slate-700 dark:text-slate-200" : "text-amber-700 dark:text-amber-300"}`}>
                        {check.label}
                      </span>
                      {!check.ok && check.detail ? (
                        <span className="block font-semibold text-amber-700 dark:text-amber-300">{check.detail}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>

              <p className="mt-3 flex items-start gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-300">
                <AlertCircle size={14} className="mt-px shrink-0" />
                <span>Ini membuat order sungguhan di J&T dan kurir akan menjemput. Pastikan alamat dan ongkir sudah benar.</span>
              </p>

              {/* Pengaman aksi tak sengaja: tombol "Buat Resi" baru aktif setelah ini dicentang. */}
              <label className="mt-3 flex items-start gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={siapKirim}
                  onChange={(event) => setSiapKirim(event.target.checked)}
                  disabled={resiBusy}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-slate-900 dark:accent-white"
                />
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Barang sudah ready dan siap diserahkan ke kurir.
                </span>
              </label>

              {resiError ? <p className="mt-2 text-xs font-semibold text-red-600 dark:text-red-400">{resiError}</p> : null}

              <div className="flex gap-2 mt-4">
                <button
                  type="button"
                  onClick={closeResiConfirm}
                  disabled={resiBusy}
                  className="flex-1 px-4 py-2.5 border-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 transition-all"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={submitResi}
                  disabled={resiBusy || !resiCheck.ok || !siapKirim}
                  className="flex-1 px-4 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-60 transition-all"
                >
                  {resiBusy ? "Membuat resi…" : "Buat Resi"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Konfirmasi cetak resi — alurnya sengaja SAMA dengan "Buat Resi": pilih dulu, baru cetak. */}
      <AnimatePresence>
        {printSize ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-5"
            onClick={() => setPrintSize("")}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="w-full max-w-md max-h-full overflow-y-auto no-scrollbar rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1d28] p-5 shadow-xl"
              onClick={(event) => event.stopPropagation()}
            >
              <h4 className="font-heading font-bold text-slate-900 dark:text-white">Cetak label J&T?</h4>

              {/* Irama dialog sengaja sama dengan dialog "Buat resi J&T?": info di atas,
                  peringatan kecil, lalu dua tombol di bawah. */}
              <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                <div className="px-3.5 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Penerima</p>
                  <p className="font-bold text-slate-900 dark:text-white">{order.customer_name || "-"}</p>
                </div>
                <div className="px-3.5 py-2 flex items-center justify-between gap-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Nomor Resi</p>
                  <p className="font-mono text-xs font-bold text-slate-900 dark:text-white">{awb || "-"}</p>
                </div>
                <div className="px-3.5 py-2 flex items-center justify-between gap-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">No. Order</p>
                  <p className="font-mono text-xs font-bold text-slate-900 dark:text-white">{order.order_number}</p>
                </div>
              </div>

              <p className="mt-3 flex items-start gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-300">
                <AlertCircle size={14} className="mt-px shrink-0" />
                <span>
                  Halaman label dibuka di tab baru — tinggal tekan "Cetak Label" di sana. Tombol kanan memakai ukuran
                  terakhir: {printSize === "78x100" ? "78 × 100 mm" : "100 × 150 mm"}.
                </span>
              </p>

              <div className="flex gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setPrintSize("")}
                  className="flex-1 px-4 py-2.5 border-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const size = printSize;
                    setPrintSize("");
                    openLabel(size);
                  }}
                  className="flex-1 px-4 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl hover:bg-slate-800 dark:hover:bg-slate-100 transition-all"
                >
                  {sizeLabel(printSize)}
                </button>
              </div>

              {/* Ukuran lain tetap bisa dipilih (sekali klik, tanpa menutup dialog dulu). */}
              <button
                type="button"
                onClick={() => setPrintSize(printSize === "78x100" ? "100x150" : "78x100")}
                className="mt-2 w-full text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors"
              >
                Pakai ukuran lain: {sizeLabel(printSize === "78x100" ? "100x150" : "78x100")}
              </button>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
});

export default TransaksiResiPanel;
