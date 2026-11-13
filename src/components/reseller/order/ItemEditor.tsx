"use client";

import { Repeat, Trash2, TrendingUp } from "lucide-react";
import { rupiah } from "@/lib/reseller/format";
import RupiahInput from "../RupiahInput";
import ProductPhoto from "../ProductPhoto";
import type { OrderLine } from "./types";

/**
 * Blok satu item terpilih: produk, ukuran, jumlah, harga jual, untung.
 * Urutan dibuat searah mata: apa yang dibeli -> ukuran -> berapa banyak & harga -> untungnya.
 */
export default function ItemEditor({
  line,
  onChange,
  onVariant,
  onRemove,
  onReplace,
}: {
  line: OrderLine;
  onChange: (patch: Partial<OrderLine>) => void;
  onVariant: (patch: { color?: string; size?: string }) => void;
  onRemove: () => void;
  onReplace: () => void;
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
      <div className="ie-head">
        <ProductPhoto src={line.product.image} name={line.product.name} series={line.product.series} className="ie-photo" />
        <div className="ie-title">
          <div className="ie-name">{title}</div>
          <div className="ie-meta">
            Harga beli kamu <b>{rupiah(buy)}</b>
            <span>
              {" "}
              · katalog <s>{rupiah(line.product.price)}</s> (−{line.product.discount_percent}%)
            </span>
          </div>
        </div>
        <div className="ie-acts">
          <button type="button" className="ie-btn" onClick={onReplace}>
            <Repeat size={14} aria-hidden="true" />
            Ganti
          </button>
          <button type="button" className="iconbtn" aria-label={`Hapus ${title}`} onClick={onRemove}>
            <Trash2 size={15} />
          </button>
        </div>
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
        <div className="item-label">Pilih ukuran</div>
        <div className="size-pills" role="group" aria-label="Ukuran">
          {sizes.map((variant) => {
            const habis = variant.stock < 1;
            const active = line.size === variant.size;
            return (
              <button
                key={variant.size}
                type="button"
                className={`size-pill ${active ? "on" : ""} ${habis ? "off" : ""}`}
                disabled={habis}
                aria-pressed={active}
                onClick={() => onVariant({ size: variant.size })}
              >
                <span className="sz">{variant.size}</span>
                <span className="st">{habis ? "Habis" : `Stok ${variant.stock}`}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="ie-row">
        <div>
          <div className="item-label">Jumlah</div>
          <div className="qty qty-lg">
            <button
              type="button"
              aria-label="Kurangi jumlah"
              disabled={line.quantity <= 1}
              onClick={() => onChange({ quantity: Math.max(1, line.quantity - 1) })}
            >
              −
            </button>
            <span>{line.quantity}</span>
            <button
              type="button"
              aria-label="Tambah jumlah"
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
          <div className="min-hint">
            Minimal {rupiah(minSell)} · {line.product.min_sell_reason}
          </div>
        </div>
      </div>

      {!sellValid ? <p className="err">Harga jual di bawah batas minimal.</p> : null}

      <div className={`ie-profit ${profit > 0 ? "" : "flat"}`}>
        <TrendingUp size={16} aria-hidden="true" />
        <span>
          Untung <b>{rupiah(profit)}</b> / pcs
        </span>
        <small>{profitPct}% dari harga jual</small>
      </div>
    </div>
  );
}
