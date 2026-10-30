"use client";

import { Loader2 } from "lucide-react";
import type { ShippingOption } from "@/lib/reseller/client";
import { rupiah } from "@/lib/reseller/format";
import { Note } from "../ui";
import { lineProfit, lineSubtotal, type OrderLine } from "./types";

function serviceShort(code: string | undefined): string {
  return String(code || "").toUpperCase() === "ECO" ? "ECO" : "EZ";
}

/** Ringkasan pesanan: indikator lengkap, rincian, saldo, untung, CTA. */
export default function RingkasanPesanan({
  lines,
  shipping,
  saldoTersedia,
  complete,
  disabled,
  disabledReason,
  submitting,
  submitError,
  onSubmit,
  showCta = true,
}: {
  lines: OrderLine[];
  shipping: ShippingOption | null;
  saldoTersedia: number;
  complete: { products: boolean; recipient: boolean; shipping: boolean };
  disabled: boolean;
  disabledReason: string;
  submitting: boolean;
  submitError: string;
  onSubmit: () => void;
  showCta?: boolean;
}) {
  const subtotal = lines.reduce((sum, line) => sum + lineSubtotal(line), 0);
  const shippingCost = shipping?.cost || 0;
  const total = subtotal + shippingCost;
  const deducted = Math.min(Math.max(saldoTersedia, 0), total);
  const shortfall = Math.max(0, total - deducted);
  const profit = lines.reduce((sum, line) => sum + lineProfit(line), 0);
  const done = [complete.products, complete.recipient, complete.shipping].filter(Boolean).length;
  const ctaText = shortfall > 0 ? `Bayar ${rupiah(shortfall)} & buat pesanan` : "Buat pesanan";

  return (
    <div className="card review">
      <div className="card-h">
        <h2>Ringkasan</h2>
        <span className="small muted">{done} dari 3 lengkap</span>
      </div>
      <div className="card-b">
        <div className="rd-segments" aria-hidden="true">
          {[
            ["Produk", complete.products],
            ["Penerima", complete.recipient],
            ["Kirim", complete.shipping],
          ].map(([label, ok]) => (
            <div key={String(label)} className={`rd-seg ${ok ? "ok" : ""}`}>
              <span />
              <small>{label}</small>
            </div>
          ))}
        </div>

        <div className="rd-lines">
          {lines.length === 0 ? <p className="small muted">Belum ada produk dipilih.</p> : null}
          {lines.map((line) => (
            <div className="rd-line" key={line.uid}>
              <span>
                {line.product.series
                  ? `${line.product.name} — ${line.product.series}`
                  : line.product.name}
                <small>
                  {line.size || "Ukuran belum dipilih"} × {line.quantity}
                </small>
              </span>
              <b>{rupiah(lineSubtotal(line))}</b>
            </div>
          ))}
        </div>

        <div className="kv" style={{ marginTop: 8 }}>
          <span>Ongkir {shipping ? `(${serviceShort(shipping.serviceCode)})` : ""}</span>
          <b>{shipping ? rupiah(shippingCost) : "—"}</b>
        </div>
        <div className="kv total">
          <span>Total bayar</span>
          <b>{rupiah(total)}</b>
        </div>
        <div className="kv" style={{ marginTop: 8 }}>
          <span>Saldo kamu</span>
          <b>{rupiah(saldoTersedia)}</b>
        </div>
        <div className="kv">
          <span>Estimasi untung</span>
          <b style={{ color: "var(--rs-ok)" }}>{rupiah(profit)}</b>
        </div>

        {shortfall > 0 ? (
          <div style={{ marginTop: 10 }}>
            <Note tone="warn">
              <b>Saldo kurang {rupiah(shortfall)}.</b> Setelah pesanan dibuat, kamu diarahkan ke
              pembayaran kekurangan (QRIS/BSI).
            </Note>
          </div>
        ) : null}

        {submitError ? (
          <div style={{ marginTop: 10 }}>
            <Note tone="err">{submitError}</Note>
          </div>
        ) : null}

        {showCta ? (
          <>
            <button
              className="btn blk"
              type="button"
              style={{ marginTop: 14 }}
              disabled={disabled || submitting}
              onClick={onSubmit}
            >
              {submitting ? <Loader2 size={16} /> : null}
              {ctaText}
            </button>
            {disabled && disabledReason ? (
              <p className="hint" style={{ marginTop: 8, textAlign: "center" }}>
                {disabledReason}
              </p>
            ) : null}
            <p className="hint rd-note">
              Kalau tidak dibayar 24 jam, pesanan batal otomatis dan saldo dikembalikan.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
