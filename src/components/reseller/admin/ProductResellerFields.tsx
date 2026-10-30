"use client";

import { resellerBuyPrice } from "@/lib/reseller/pricing";

/**
 * Field reseller di form produk (dipakai ProductForm, bukan menu terpisah):
 * diskon reseller per produk + harga minimum untuk semua produk.
 *
 * - Diskon kosong = produk TIDAK dijual ke reseller. 0–100.
 * - "Harga minimum" di sini hanya tampil untuk produk non-CYP; produk CYP
 *   sudah punya field Harga Minimum di blok Create Your Price (state sama).
 * - Peringatan kuning = harga minimum di bawah harga beli reseller
 *   (peringatan saja, tetap bisa disimpan).
 */
export default function ProductResellerFields({
  catalogPrice,
  minimumPrice,
  onMinimumPriceChange,
  showMinimumField,
  discount,
  onDiscountChange,
}: {
  /** Harga katalog acuan (harga dasar / harga series aktif). */
  catalogPrice: number;
  minimumPrice: string;
  onMinimumPriceChange: (value: string) => void;
  /** true = tampilkan field Harga Minimum di sini (produk non-CYP). */
  showMinimumField: boolean;
  /** Persen diskon sebagai string; "" = tidak dijual ke reseller. */
  discount: string;
  onDiscountChange: (value: string) => void;
}) {
  const percent = discount.trim() === "" ? null : Math.min(100, Math.max(0, parseFloat(discount) || 0));
  const buyPrice = resellerBuyPrice({
    price: catalogPrice || 0,
    reseller_discount_percent: percent ?? 0,
  });
  const minimum = parseInt(minimumPrice) || 0;
  const belowBuy = minimum > 0 && buyPrice > 0 && minimum < buyPrice;
  const soldToReseller = percent !== null;

  return (
    <div className="pf-panel">
      <p className="text-sm font-semibold mb-3" style={{ color: "var(--espresso)" }}>
        Reseller
      </p>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="pf-label">Diskon reseller (%)</label>
          <input
            type="text"
            inputMode="numeric"
            value={discount}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^\d.]/g, "");
              if (raw === "") return onDiscountChange("");
              const value = Math.min(100, Math.max(0, parseFloat(raw) || 0));
              onDiscountChange(String(value));
            }}
            className="pf-input"
            placeholder="Kosong = tidak dijual ke reseller"
          />
          <p className="pf-hint">0–100%. Kosongkan kalau produk ini tidak dijual ke reseller.</p>
        </div>
        {showMinimumField ? (
          <div>
            <label className="pf-label">Harga Minimum (Rp)</label>
            <input
              type="text"
              inputMode="numeric"
              value={minimumPrice}
              onChange={(e) => onMinimumPriceChange(e.target.value.replace(/\D/g, ""))}
              className="pf-input"
              placeholder="Batas bawah harga jual reseller"
            />
            <p className="pf-hint">Berlaku untuk semua produk (bukan hanya CYP).</p>
          </div>
        ) : null}
      </div>

      {soldToReseller ? (
        <p className="pf-hint mt-3">
          Harga beli reseller: <b>Rp{buyPrice.toLocaleString("id-ID")}</b>
          {catalogPrice > 0 ? ` (dari Rp${catalogPrice.toLocaleString("id-ID")})` : ""}
        </p>
      ) : null}

      {belowBuy ? (
        <p
          className="mt-2 px-3 py-2 rounded-xl text-[12px] font-semibold"
          style={{ background: "#fffbeb", border: "1px solid #f1d9a7", color: "#7c4a03" }}
        >
          Harga minimum di bawah harga beli reseller. Reseller tidak akan bisa jual di bawah Rp
          {buyPrice.toLocaleString("id-ID")}.
        </p>
      ) : null}
    </div>
  );
}
