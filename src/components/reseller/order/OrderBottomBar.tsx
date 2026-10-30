"use client";

import { Loader2 } from "lucide-react";
import { rupiah } from "@/lib/reseller/format";

/** Bar bawah mobile untuk Buat Pesanan: total + satu tombol aksi. */
export default function OrderBottomBar({
  step,
  total,
  shortfall,
  disabled,
  reason,
  submitting,
  onNext,
  onSubmit,
}: {
  step: number;
  total: number;
  shortfall: number;
  disabled: boolean;
  reason: string;
  submitting: boolean;
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
      {disabled && reason ? <p className="order-bar-hint">{reason}</p> : null}
      <div className="order-bar-main">
        <div>
          <div className="small muted">Total bayar</div>
          <b style={{ fontSize: 17 }}>{rupiah(total)}</b>
        </div>
        <button
          className="btn"
          type="button"
          disabled={disabled || submitting}
          onClick={last ? onSubmit : onNext}
        >
          {submitting ? <Loader2 size={16} /> : null}
          {label}
        </button>
      </div>
    </div>
  );
}
