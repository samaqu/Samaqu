"use client";

import { Trash2 } from "lucide-react";
import { rupiah } from "@/lib/reseller/format";
import RupiahInput from "../RupiahInput";
import type { OrderLine } from "./types";

/** Satu baris produk di pesanan: harga katalog/beli/min jual, harga jual, untung per pcs. */
export default function BarisProduk({
  line,
  onChange,
  onRemove,
}: {
  line: OrderLine;
  onChange: (patch: Partial<OrderLine>) => void;
  onRemove: () => void;
}) {
  const buy = line.product.buy_price;
  const minSell = line.product.min_sell_price;
  const sellValid = Number.isFinite(line.sellPrice) && line.sellPrice >= minSell;
  const profit = Math.round(line.sellPrice || 0) - buy;

  return (
    <div className="line-item">
      <div className="head">
        {line.product.image ? (
          <img src={line.product.image} alt={line.product.name} />
        ) : (
          <span style={{ width: 56, height: 70, borderRadius: 9, background: "var(--rs-soft)", flex: "none" }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="bold" style={{ fontSize: 13.5 }}>
            {line.product.name}
            {line.product.series ? ` — ${line.product.series}` : ""}
          </div>
          <div className="small muted" style={{ marginTop: 2 }}>
            {line.color} · {line.size} · stok {line.stock}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <span className="small bold">Qty</span>
            <div className="qty">
              <button
                type="button"
                disabled={line.quantity <= 1}
                onClick={() => onChange({ quantity: Math.max(1, line.quantity - 1) })}
              >
                −
              </button>
              <span>{line.quantity}</span>
              <button
                type="button"
                disabled={line.quantity >= line.stock}
                onClick={() => onChange({ quantity: Math.min(line.stock, line.quantity + 1) })}
              >
                +
              </button>
            </div>
          </div>
        </div>
        <button
          type="button"
          className="iconbtn"
          aria-label="Hapus produk"
          style={{ width: 34, height: 34 }}
          onClick={onRemove}
        >
          <Trash2 size={15} />
        </button>
      </div>

      <div className="price-grid">
        <div className="price-cell">
          <small>Harga katalog</small>
          <b className="price-strike">{rupiah(line.product.price)}</b>
        </div>
        <div className="price-cell">
          <small>Harga beli kamu (−{line.product.discount_percent}%)</small>
          <b>{rupiah(buy)}</b>
        </div>
        <div className="price-cell">
          <small>Minimum jual</small>
          <b>{rupiah(minSell)}</b>
        </div>
      </div>

      <div className="grid2" style={{ gap: 10 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Harga jual ke customer</label>
          <RupiahInput
            value={line.sellPrice}
            placeholder={String(minSell)}
            invalid={!sellValid}
            onChange={(value) => onChange({ sellPrice: value })}
          />
          {!sellValid ? <span className="err">Harga jual minimal {rupiah(minSell)}</span> : null}
        </div>
        <div className="price-cell" style={{ alignSelf: "end" }}>
          <small>Untung / pcs</small>
          <b style={{ color: profit > 0 ? "var(--rs-ok)" : "var(--rs-ink)" }}>{rupiah(profit)}</b>
        </div>
      </div>
    </div>
  );
}
