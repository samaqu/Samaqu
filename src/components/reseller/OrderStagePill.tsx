"use client";

import {
  ORDER_STAGE_LABEL,
  ORDER_STAGE_STYLE,
  type OrderStage,
} from "@/lib/order-flow";

/** Pill tahap pesanan — istilah & warna sama dengan daftar Transaksi admin. */
export default function OrderStagePill({ stage }: { stage: OrderStage }) {
  const style = ORDER_STAGE_STYLE[stage];
  return (
    <span
      className="order-stage-pill"
      style={{ background: style.bg, color: style.color, borderColor: style.border }}
    >
      {ORDER_STAGE_LABEL[stage]}
    </span>
  );
}
