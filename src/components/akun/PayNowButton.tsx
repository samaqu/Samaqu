"use client";

/**
 * Tombol "Bayar Sekarang" untuk pesanan yang belum dibayar.
 *
 * Satu logika untuk semua tempat (daftar pesanan, detail pesanan, halaman bayar), supaya
 * perilakunya tidak pernah beda antar layar:
 *
 *  - Pembayaran ONLINE (Mayar) → buka tautan bayar. Pakai `payment_url` yang tersimpan;
 *    kalau belum ada / kedaluwarsa, link dibuat ulang lewat `startOnlinePayment`.
 *  - Pembayaran MANUAL (transfer bank / QRIS / e-wallet / lain) → buka halaman instruksi
 *    pembayaran milik pesanan itu (`/akun/pesanan/<no>/bayar`), berisi rekening/QRIS,
 *    nominal, dan tombol konfirmasi WhatsApp.
 *
 * Hanya tampil untuk pesanan `pending` yang belum lunas — status dibaca dari data pesanan,
 * bukan dari teks label.
 */

import Link from "next/link";
import { useState } from "react";
import { startOnlinePayment } from "@/lib/mayar-client";
import { normalizeMethodType, type PaymentMethodType } from "@/lib/payment-methods";

/** Bentuk minimal data pesanan yang dibutuhkan tombol ini. */
export type PayableOrder = {
  order_number?: string | null;
  status?: string | null;
  total?: number | null;
  paid_at?: string | null;
  payment_url?: string | null;
  payment_provider?: string | null;
};

/** Pesanan masih boleh dibayar? Menunggu pembayaran dan belum lunas. */
export function isAwaitingPayment(order?: PayableOrder | null): boolean {
  if (!order) return false;
  if (order.paid_at) return false;
  return String(order.status || "").toLowerCase() === "pending";
}

/** Metode ini butuh halaman instruksi manual (bukan tautan bayar otomatis)? */
export function needsManualInstructions(methodType?: string | null): boolean {
  const type: PaymentMethodType = normalizeMethodType(methodType);
  return type !== "mayar";
}

export function PayNowButton({
  order,
  methodType,
  payHref,
  className,
  label = "Bayar Sekarang",
  onNavigate,
}: {
  order: PayableOrder;
  /** `payment_methods.method_type` dari metode yang dipilih customer. */
  methodType?: string | null;
  /** URL halaman instruksi pembayaran (dipakai untuk metode manual). */
  payHref: string;
  className?: string;
  label?: string;
  /** Dipanggil sebelum pindah halaman (mis. menutup drawer). */
  onNavigate?: () => void;
}) {
  const [opening, setOpening] = useState(false);

  if (!isAwaitingPayment(order)) return null;

  // Metode manual → cukup pindah ke halaman instruksi.
  if (needsManualInstructions(methodType)) {
    return (
      <Link
        href={payHref}
        onClick={() => onNavigate?.()}
        className={className}
        style={{ textDecoration: "none" }}
      >
        {label}
      </Link>
    );
  }

  async function openPayment() {
    setOpening(true);
    try {
      const url = order.payment_url || (await startOnlinePayment(String(order.order_number ?? "")));
      if (url) {
        onNavigate?.();
        window.location.href = url;
      }
    } finally {
      setOpening(false);
    }
  }

  return (
    <button type="button" onClick={openPayment} disabled={opening} className={className}>
      {opening ? "Membuka halaman bayar…" : label}
    </button>
  );
}
