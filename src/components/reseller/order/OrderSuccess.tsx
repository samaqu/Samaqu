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
    <div className="card" style={{ maxWidth: 620 }}>
      <div className="card-b stack">
        <div className="row">
          <CheckCircle size={26} style={{ color: "var(--rs-ok)" }} />
          <div>
            <h2 className="bold" style={{ fontSize: 18 }}>
              Pesanan berhasil dibuat
            </h2>
            <p className="small muted">Simpan nomor pesanan ini untuk pelacakan.</p>
          </div>
        </div>

        <div className="kv-list">
          <div className="it">
            <span className="muted">Nomor pesanan</span>
            <b className="bold">{result.orderNumber}</b>
          </div>
          <div className="it">
            <span className="muted">Status</span>
            <StatusBadge status={status} />
          </div>
          <div className="it">
            <span className="muted">Total</span>
            <b className="bold">{rupiah(result.total)}</b>
          </div>
          <div className="it">
            <span className="muted">Dipotong dari saldo</span>
            <b className="bold" style={{ color: "var(--rs-ok)" }}>
              {rupiah(result.balanceDeduction)}
            </b>
          </div>
        </div>

        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
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
