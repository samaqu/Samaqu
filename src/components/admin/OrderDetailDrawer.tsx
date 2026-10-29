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
import OrderDetailContent, { AdminDetailOrder } from "@/components/admin/OrderDetailContent";
import { PanelDetailShell } from "@/components/ops/transaksi/PanelDetailPesanan";
import { useBodyScrollLock } from "@/lib/use-scroll-lock";

export default function OrderDetailDrawer({
  order,
  onClose,
  onStatusChange,
  onCancelJnt,
  onDelete,
  onArrangeOrder,
  onSynced,
  tema = "mono",
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
  /** `mono` = hitam-putih (bawaan /admin). `warna` = pastel seperti panel admin. */
  tema?: "warna" | "mono";
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
            {/* Tampilan sama dengan drawer panel admin; tema mono untuk /admin.
                Semua logic & aksi tetap di OrderDetailContent. */}
            <PanelDetailShell open onClose={onClose} tema={tema} embed>
              <OrderDetailContent
                order={order}
                onClose={onClose}
                tampilan="baru"
                tema={tema}
                onStatusChange={onStatusChange}
                onCancelJnt={onCancelJnt}
                onDelete={onDelete}
                onArrangeOrder={onArrangeOrder}
                onSynced={onSynced}
              />
            </PanelDetailShell>

            {/* z-index 50: ConfirmModal (Hapus Pesanan / Batalkan J&T) memakai z-50 dan
                dirender setelah drawer, jadi konfirmasinya tetap muncul di atas. */}
            <style>{ODR_CSS}</style>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* Kerangka drawer: overlay + panel geser. Isinya PanelDetailShell (gaya drawer panel admin).
   z-index 50: ConfirmModal memakai z-50 dan dirender setelah drawer. */
const ODR_CSS = `
.odr-overlay{position:fixed;inset:0;z-index:50;display:flex;justify-content:flex-end}
.odr-panel{width:100%;height:100%;display:flex;flex-direction:column;min-width:0}
.odr-panel.is-mono{background:#fff}
`;
