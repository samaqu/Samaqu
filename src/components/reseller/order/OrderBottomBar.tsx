"use client";

import { ChevronLeft, AlertTriangle, Loader2 } from "lucide-react";
import { rupiah } from "@/lib/reseller/format";

/** Bar bawah HP untuk Buat Pesanan: total, tombol kembali, dan satu tombol aksi utama. */
export default function OrderBottomBar({
  step,
  total,
  shortfall,
  disabled,
  reason,
  submitting,
  onBack,
  onNext,
  onSubmit,
}: {
  step: number;
  total: number;
  shortfall: number;
  disabled: boolean;
  reason: string;
  submitting: boolean;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
}) {
  const last = step >= 2;
  const label = last
    ? shortfall > 0
      ? `Bayar ${rupiah(shortfall)} & buat pesanan`
      : "Buat pesanan"
    : "Lanjut";

  return (
    <div className="order-bar">
      {disabled && reason ? (
        <p className="order-bar-hint">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>{reason}</span>
        </p>
      ) : null}
      <div className="order-bar-main">
        {step > 0 ? (
          <button type="button" className="order-bar-back" onClick={onBack} aria-label="Kembali ke langkah sebelumnya">
            <ChevronLeft size={20} />
          </button>
        ) : null}
        <div className="order-bar-total">
          <span>Total bayar</span>
          <b>{rupiah(total)}</b>
        </div>
        <button className="btn" type="button" disabled={disabled || submitting} onClick={last ? onSubmit : onNext}>
          {submitting ? <Loader2 size={16} /> : null}
          {label}
        </button>
      </div>
    </div>
  );
}
