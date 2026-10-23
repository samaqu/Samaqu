"use client";

/**
 * Detail pesanan admin sebagai drawer yang meluncur dari kanan — pola yang sama dengan
 * `ProductDetailDrawer`, supaya kedua panel admin (detail produk & detail pesanan) seragam.
 *
 * Header (nomor pesanan + tanggal + tombol tutup) hidup di sini sekali, jadi kedua dashboard
 * admin (`/admin` dan `/[locale]/admin`) tidak menyalin markup modal-nya lagi. Nomor pesanan
 * memakai font UI admin (bukan serif) supaya seragam dengan isi struk di bawahnya; tanggalnya
 * mengikuti format panjang `id-ID` yang dulu ada di header modal.
 *
 * Isinya tetap `OrderDetailContent` — susunan & gaya struk yang sama dengan halaman detail
 * pesanan customer. Di bawah 768px drawer memakai lebar penuh; di atasnya 520px (sama
 * rampingnya dengan `ProductDetailDrawer`/`CustomerDetailDrawer`).
 *
 * Dulu panelnya 640px sementara lembar struk di dalamnya hanya 600px terpusat — sisa 20px di
 * kiri-kanan bikin drawer terasa lebar & tampak seperti dua lapis krem yang bertumpuk. Sekarang
 * drawer-nya sendiri yang jadi "kertas"-nya: panel lebih sempit, struknya mengisi lebar penuh
 * (lihat blok ≥768px di `OD_CSS` pada `OrderDetailContent`).
 */

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import OrderDetailContent, { AdminDetailOrder } from "@/components/admin/OrderDetailContent";
import { useBodyScrollLock } from "@/lib/use-scroll-lock";
import { orderSourceLabel } from "@/lib/transaksi";

export default function OrderDetailDrawer({
  order,
  onClose,
  onStatusChange,
  onCancelJnt,
  onDelete,
  onArrangeOrder,
  onSynced,
}: {
  order: AdminDetailOrder | null;
  onClose: () => void;
  onStatusChange: (status: string) => void;
  onCancelJnt?: () => void;
  onDelete: () => void;
  /** "Atur Pesanan" — buat resi J&T untuk pesanan yang belum punya resi. */
  onArrangeOrder?: () => Promise<void> | void;
  /** Setelah tracking J&T disinkronkan (server) — dipakai memperbarui daftar/drawer. */
  onSynced?: (patch: {
    status?: string;
    shipping_status?: string | null;
    awb_no?: string;
    shipping_method?: string;
  }) => void;
}) {
  useEffect(() => {
    if (!order) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [order, onClose]);

  // Halaman di belakang panel ikut dikunci selama drawer terbuka — kalau tidak, halaman dan
  // drawer sama-sama punya scrollbar (dua scrollbar di layar).
  useBodyScrollLock(!!order);

  return (
    <AnimatePresence>
      {order && (
        <motion.div
          key="order-detail-drawer"
          className="odr-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            className="odr-panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="odr-head">
              <div className="odr-head-txt">
                <p className="odr-source">{orderSourceLabel(order)}</p>
                <h2 className="odr-title">Detail Pesanan</h2>
              </div>
              <button onClick={onClose} className="odr-x" aria-label="Tutup">
                <X size={18} />
              </button>
            </header>

            <div className="odr-body drawer-scroll">
              <OrderDetailContent
                order={order}
                onStatusChange={onStatusChange}
                onCancelJnt={onCancelJnt}
                onDelete={onDelete}
                onArrangeOrder={onArrangeOrder}
                onSynced={onSynced}
              />
            </div>

            {/* Gaya drawer ditulis sebagai <style> biasa (pola sama dengan PD_CSS/RINCIAN_CSS):
                `style jsx global` dengan isi variabel tidak punya id statis, jadi styled-jsx
                membuang CSS ini dan drawer-nya tampil tanpa gaya.
                z-index 50 (bukan 60): ConfirmModal (Hapus Pesanan / Batalkan J&T) memakai
                z-50 dan dirender setelah drawer, jadi konfirmasinya tetap muncul di atas. */}
            <style>{ODR_CSS}</style>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const ODR_CSS = `
.odr-overlay{position:fixed;inset:0;z-index:50;display:flex;justify-content:flex-end;background:rgba(42,33,27,.42);backdrop-filter:blur(3px)}
/* Panel = kertasnya sendiri (krem terang yang sama dengan lembar struk), jadi isi struk duduk
   langsung di atasnya tanpa kartu krem kedua di dalamnya. 520px: cukup untuk baris produk &
   linimasa, tapi tidak lagi menutupi hampir seluruh layar tablet seperti versi 640px. */
.odr-panel{width:min(448px,100vw);max-width:100%;height:100%;display:flex;flex-direction:column;background:#fff;box-shadow:-24px 0 60px -24px rgba(42,33,27,.35)}
.odr-head{flex:none;display:flex;align-items:flex-start;gap:12px;padding:16px 20px;border-bottom:1px solid rgba(42,33,27,.09);min-width:0}
.odr-head-txt{min-width:0}
.odr-source{margin:0;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted,#9a9a98)}
/* Nomor pesanan memakai font UI admin yang sama dengan isi struk (dulu serif Cormorant) supaya seragam. */
.odr-title{margin:0;font-size:1.05rem;font-weight:800;letter-spacing:-.01em;color:var(--espresso,#1c1c1c);font-family:var(--font-inter),system-ui,sans-serif;overflow-wrap:anywhere}
.odr-date{margin:4px 0 0;font-size:.75rem;font-weight:500;color:var(--text-muted,#9a9a98);overflow-wrap:anywhere}
.odr-x{margin-left:auto;flex:none;padding:6px;border-radius:8px;border:1px solid transparent;background:transparent;color:var(--text-muted,#9a9a98);cursor:pointer}
.odr-x:hover{background:rgba(42,33,27,.06);color:var(--espresso,#1c1c1c)}
.odr-body{flex:1;min-height:0;min-width:0;overflow-y:auto;overflow-x:hidden;padding:16px 20px}
/* Layout ini disamakan dengan drawer ops: panel langsung di body. */
.odr-body .od-root{box-sizing:border-box;max-width:100%;padding:0}
.odr-body .panel-tx .ban{padding-left:18px;padding-right:18px}

/* Mobile: drawer memakai lebar penuh dan header lebih rapat. */
@media (max-width:767.98px){
 .odr-panel{width:100vw;max-width:100vw;border-radius:0;background:#fff}
 .odr-head{padding:14px 16px}
 .odr-body{overflow-x:hidden;padding:14px 16px}
 .odr-body .od-root{padding:0}
}
`;
