"use client";

import { Trash2 } from "lucide-react";
import { rupiah } from "@/lib/reseller/format";
import RupiahInput from "../RupiahInput";
import ProductPhoto from "../ProductPhoto";
import type { OrderLine } from "./types";

/** Blok satu item terpilih: varian, ukuran, qty, harga jual, untung. */
export default function ItemEditor({
  line,
  onChange,
  onVariant,
  onRemove,
}: {
  line: OrderLine;
  onChange: (patch: Partial<OrderLine>) => void;
  onVariant: (patch: { color?: string; size?: string }) => void;
  onRemove: () => void;
}) {
  const buy = line.product.buy_price;
  const minSell = line.product.min_sell_price;
  const sell = Math.round(line.sellPrice || 0);
  const sellValid = Number.isFinite(line.sellPrice) && line.sellPrice >= minSell;
  const profit = sell - buy;
  const profitPct = sell > 0 ? Math.round((profit / sell) * 100) : 0;

  const colors = [...new Set(line.product.variants.map((variant) => variant.color))];
  const sizes = line.product.variants.filter((variant) => variant.color === line.color);
  const title = line.product.series ? `${line.product.name} — ${line.product.series}` : line.product.name;

  return (
    <div className="item-editor">
      <div className="item-head">
        <ProductPhoto src={line.product.image} name={line.product.name} series={line.product.series} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="bold" style={{ fontSize: 13.5 }}>
            {title}
          </div>
          <div className="small muted">
            <span className="price-strike">{rupiah(line.product.price)}</span> · beli{" "}
            <b style={{ color: "var(--rs-ink)" }}>{rupiah(buy)}</b> (−{line.product.discount_percent}%)
          </div>
        </div>
        <button type="button" className="iconbtn" aria-label={`Hapus ${title}`} onClick={onRemove}>
          <Trash2 size={15} />
        </button>
      </div>

      {colors.length > 1 ? (
        <div>
          <div className="item-label">Warna</div>
          <div className="chips">
            {colors.map((color) => (
              <button
                key={color}
                type="button"
                className={`chip ${line.color === color ? "on" : ""}`}
                onClick={() => onVariant({ color })}
              >
                {color}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <div className="item-label">Ukuran</div>
        <div className="size-grid">
          {sizes.map((variant) => {
            const habis = variant.stock < 1;
            const active = line.size === variant.size;
            return (
              <button
                key={variant.size}
                type="button"
                className={`size-box ${active ? "on" : ""} ${habis ? "off" : ""}`}
                disabled={habis}
                aria-pressed={active}
                onClick={() => onVariant({ size: variant.size })}
              >
                <span className="sz">{variant.size}</span>
                <span className="st">{habis ? "Habis" : `${variant.stock}`}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="item-bottom">
        <div>
          <div className="item-label">Jumlah</div>
          <div className="qty qty-lg">
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
        <div>
          <div className="item-label">Harga jual ke customer</div>
          <RupiahInput
            value={line.sellPrice}
            placeholder={String(minSell)}
            invalid={!sellValid}
            onChange={(value) => onChange({ sellPrice: value })}
          />
          {!sellValid ? <span className="err">Minimal {rupiah(minSell)}</span> : null}
        </div>
        <div className={`profit-chip ${profit > 0 ? "" : "flat"}`}>
          <span>Untung / pcs</span>
          <b>
            {rupiah(profit)} · {profitPct}%
          </b>
        </div>
      </div>
    </div>
  );
}
