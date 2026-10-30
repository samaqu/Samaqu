"use client";

import Link from "next/link";
import { CheckCircle } from "lucide-react";
import { orderStatus, rupiah } from "@/lib/reseller/format";
import { StatusBadge } from "../ui";

/**
 * Panel sukses setelah pesanan dibuat LUNAS DARI SALDO (saldo cukup).
 * Pesanan dengan kekurangan langsung diarahkan ke halaman bayar kekurangan,
 * jadi panel ini tidak menangani upload bukti lagi.
 */
export default function OrderSuccess({
  result,
  onNew,
}: {
  result: {
    orderNumber: string;
    total: number;
    balanceDeduction: number;
    status: string;
  };
  onNew: () => void;
}) {
  const status = orderStatus(result.status);

  return (
    <div className="submitted-wrap">
      <div className="card submitted-card">
        <div className="submitted-check" aria-hidden="true">
          <CheckCircle size={34} />
        </div>
        <h1>Pesanan berhasil dibuat</h1>
        <p className="submitted-sub">
          Pembayaran dari saldo berhasil. Simpan nomor pesanan ini untuk pelacakan.
        </p>

        <div className="submitted-summary">
          <div className="kv">
            <span>Nomor pesanan</span>
            <b>{result.orderNumber}</b>
          </div>
          <div className="kv">
            <span>Status</span>
            <StatusBadge status={status} />
          </div>
          <div className="kv">
            <span>Total</span>
            <b>{rupiah(result.total)}</b>
          </div>
          <div className="kv">
            <span>Dipotong dari saldo</span>
            <b style={{ color: "var(--rs-ok)" }}>{rupiah(result.balanceDeduction)}</b>
          </div>
        </div>

        <div className="submitted-actions">
          <Link className="btn" href={`/reseller/pesanan/${encodeURIComponent(result.orderNumber)}`}>
            Lihat pesanan
          </Link>
          <button className="btn ghost" type="button" onClick={onNew}>
            Buat pesanan lagi
          </button>
        </div>
      </div>
    </div>
  );
}
