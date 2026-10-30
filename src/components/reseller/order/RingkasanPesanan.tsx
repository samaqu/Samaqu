"use client";

import { Loader2 } from "lucide-react";
import type { ShippingOption } from "@/lib/reseller/client";
import { rupiah } from "@/lib/reseller/format";
import { Note } from "../ui";
import { lineProfit, lineSubtotal, type OrderLine } from "./types";

/** Ringkasan pesanan: subtotal, ongkir, saldo, kekurangan, estimasi untung. */
export default function RingkasanPesanan({
  lines,
  shipping,
  saldoTersedia,
  disabled,
  disabledReason,
  submitting,
  submitError,
  onSubmit,
}: {
  lines: OrderLine[];
  shipping: ShippingOption | null;
  saldoTersedia: number;
  disabled: boolean;
  disabledReason: string;
  submitting: boolean;
  submitError: string;
  onSubmit: () => void;
}) {
  const subtotal = lines.reduce((sum, line) => sum + lineSubtotal(line), 0);
  const shippingCost = shipping?.cost || 0;
  const total = subtotal + shippingCost;
  const deducted = Math.min(Math.max(saldoTersedia, 0), total);
  const shortfall = Math.max(0, total - deducted);
  const profit = lines.reduce((sum, line) => sum + lineProfit(line), 0);

  return (
    <>
      <div className="card review">
        <div className="card-h">
          <h2>Ringkasan</h2>
        </div>
        <div className="card-b">
          <div className="kv">
            <span>Harga beli produk</span>
            <b>{rupiah(subtotal)}</b>
          </div>
          <div className="kv">
            <span>Ongkir {shipping ? `(${shipping.service})` : ""}</span>
            <b>{shipping ? rupiah(shippingCost) : "—"}</b>
          </div>
          <div className="kv total">
            <span>Total bayar ke SAMAQU</span>
            <b>{rupiah(total)}</b>
          </div>
          <div className="kv" style={{ marginTop: 10 }}>
            <span>Saldo kamu</span>
            <b>{rupiah(saldoTersedia)}</b>
          </div>
          <div className="kv">
            <span>Dipotong dari saldo</span>
            <b style={{ color: "var(--rs-ok)" }}>{rupiah(deducted)}</b>
          </div>
          <div className="kv">
            <span>Estimasi untung</span>
            <b style={{ color: "var(--rs-ok)" }}>{rupiah(profit)}</b>
          </div>

          {shortfall > 0 ? (
            <div style={{ marginTop: 12 }}>
              <Note tone="warn">
                <b>Saldo kamu kurang {rupiah(shortfall)}.</b> Setelah pesanan dibuat, kamu langsung diarahkan ke
                halaman pembayaran kekurangan (QRIS atau transfer BSI). Pesanan diproses setelah admin mengecek
                pembayaran. Kalau tidak dibayar dalam 24 jam, pesanan otomatis dibatalkan dan saldo dikembalikan.
              </Note>
            </div>
          ) : null}

          {submitError ? (
            <div style={{ marginTop: 12 }}>
              <Note tone="err">{submitError}</Note>
            </div>
          ) : null}

          <button
            className="btn blk"
            type="button"
            style={{ marginTop: 14 }}
            disabled={disabled || submitting}
            onClick={onSubmit}
          >
            {submitting ? <Loader2 size={16} /> : null}
            Buat Pesanan
          </button>
          {disabled && disabledReason ? (
            <p className="hint" style={{ marginTop: 8, textAlign: "center" }}>
              {disabledReason}
            </p>
          ) : null}
        </div>
      </div>

      <div className="review-sticky">
        <div>
          <div className="small muted">Total bayar</div>
          <b style={{ fontSize: 17 }}>{rupiah(total)}</b>
        </div>
        <button className="btn" type="button" disabled={disabled || submitting} onClick={onSubmit}>
          {submitting ? <Loader2 size={16} /> : null}
          Buat Pesanan
        </button>
      </div>
    </>
  );
}
