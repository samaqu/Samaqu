"use client";

/**
 * Langkah 3 — keranjang: ubah jumlah, hapus item, dan pilih Extra Cover & Hanger.
 */

import { Trash2 } from "lucide-react";
import { cloudinaryUrl } from "@/lib/cloudinary";
import { money, openOrderImage } from "@/lib/open-order-catalog";
import { OPEN_ORDER_ADDON } from "@/lib/open-order-config";
import { formatWeightExact } from "@/lib/shipping-weight";
import { findOpenOrderProduct, openOrderColorLabel, type OpenOrderProduct } from "@/lib/open-order-offering";
import type { CartLine } from "@/components/open-order/types";
import { Counter, FIELD_BG, GhostButton, LINE, MUTED, PrimaryButton, SummaryRow } from "@/components/open-order/ui";

/**
 * Kartu Extra Cover & Hanger — mengikuti gaya katalog utama: kartu cream dengan spine emas
 * tipis di tepi kiri, nama serif espresso, dan cap centang emas yang terisi saat dipilih.
 * Ditulis sebagai CSS scoped, bukan token bersama di `ui.tsx`, supaya ornamen ini hanya
 * dipakai di bagian tersebut. Perilaku tombolnya tidak berubah (toggle pilih/batal).
 */
const ADDON_CSS = `
.oo-addon{box-sizing:border-box;position:relative;display:flex;align-items:center;justify-content:space-between;gap:14px;width:100%;overflow:hidden;padding:15px 16px 15px 19px;background:linear-gradient(180deg,#FBF9F5,var(--cream-bright));color:var(--espresso);border:1px solid rgba(0,0,0,.45);border-radius:14px;box-shadow:0 1px 2px rgba(0,0,0,.04),0 12px 28px -24px rgba(0,0,0,.55);font-family:var(--font-inter),system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer;text-align:left;transition:border-color .25s ease,box-shadow .25s ease,background-color .25s ease}
.oo-addon::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:linear-gradient(180deg,var(--gold-light),var(--gold-deep));transform:scaleY(.4);transform-origin:center;transition:transform .4s cubic-bezier(.22,.8,.3,1)}
.oo-addon:hover{border-color:rgba(0,0,0,.6);box-shadow:0 2px 5px rgba(0,0,0,.05),0 18px 36px -26px rgba(0,0,0,.6)}
.oo-addon:hover::before,.oo-addon.is-on::before{transform:scaleY(1)}
.oo-addon:active{background:#F3EDE3}
.oo-addon:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
.oo-addon-copy{min-width:0;display:flex;flex-direction:column;gap:4px}
.oo-addon-name{font-size:13.5px;line-height:1.25;font-weight:600;color:var(--espresso)}
.oo-addon-caption{font-size:9px;line-height:1;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--gold-deep)}
.oo-addon-right{flex:none;display:flex;align-items:center;gap:12px}
.oo-addon-price{font-size:14px;line-height:1;font-weight:600;color:var(--espresso);font-variant-numeric:tabular-nums;white-space:nowrap}
.oo-addon-seal{display:grid;place-items:center;width:24px;height:24px;border-radius:999px;border:1px solid rgba(0,0,0,.55);color:transparent;transition:background-color .25s ease,border-color .25s ease,color .25s ease,transform .25s ease}
.oo-addon.is-on{border-color:rgba(150,116,47,.7);background:linear-gradient(180deg,#FCF8F0,#F6EEE0);box-shadow:0 2px 6px rgba(0,0,0,.06),0 18px 36px -26px rgba(0,0,0,.6)}
.oo-addon.is-on .oo-addon-seal{background:var(--gold-deep);border-color:var(--gold-deep);color:#FBF7EF;transform:scale(1.04)}
.oo-addon.is-out{cursor:not-allowed;opacity:.55}
.oo-addon.is-out:hover{border-color:rgba(0,0,0,.45);box-shadow:0 1px 2px rgba(0,0,0,.04),0 12px 28px -24px rgba(0,0,0,.55)}
.oo-addon.is-out::before{transform:scaleY(.4)}
.oo-addon-out{font-size:9px;line-height:1;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#b3261e}
`;

export function lineName(line: CartLine, products: OpenOrderProduct[]): string {
  return findOpenOrderProduct(products, line.productId)?.name ?? line.productId;
}

export function lineImage(line: CartLine, products: OpenOrderProduct[]): string {
  const product = findOpenOrderProduct(products, line.productId);
  return product ? openOrderImage(product, line.color, line.series) : "";
}

/** Nama warna untuk tampilan (Thobe: dari nama produk, mis. "Navy"). */
export function lineColorLabel(line: CartLine, products: OpenOrderProduct[]): string {
  const product = findOpenOrderProduct(products, line.productId);
  return product ? openOrderColorLabel(product, line.color) : line.color;
}

export default function PromoStepCart({
  lines,
  products,
  subtotal,
  extraCover,
  onToggleExtra,
  addonAvailable,
  itemsWeight,
  addonWeight,
  totalWeight,
  onQuantity,
  onRemove,
  onContinue,
  onShopMore,
}: {
  lines: CartLine[];
  products: OpenOrderProduct[];
  subtotal: number;
  extraCover: boolean;
  onToggleExtra: (next: boolean) => void;
  /** false = stok varian katalog habis → kartu add-on tampil "Habis" dan tidak bisa dipilih. */
  addonAvailable: boolean;
  /** Berat barang saja (gram) — tanpa add-on. */
  itemsWeight: number;
  /** Berat add-on Cover & Hanger (gram) bila dipilih. */
  addonWeight: number;
  /** Total berat kirim (gram) — barang + add-on, minimum 300 g (dipakai hitungan ongkir). */
  totalWeight: number;
  onQuantity: (key: number, quantity: number) => void;
  onRemove: (key: number) => void;
  onContinue: () => void;
  onShopMore: () => void;
}) {
  if (lines.length === 0) {
    return (
      <div className="py-10 text-center">
        <p className="text-[14px] font-semibold">Keranjang masih kosong</p>
        <p className="mt-2 text-[12.5px]" style={{ color: MUTED }}>
          Pilih produk Open Order dulu untuk membuat pesanan.
        </p>
        <div className="mx-auto mt-6 max-w-xs">
          <PrimaryButton onClick={onShopMore}>Lihat Produk</PrimaryButton>
        </div>
      </div>
    );
  }

  const totalQty = lines.reduce((sum, line) => sum + line.quantity, 0);
  // Promo: Cover Hanger BUKAN add-on berbayar — selalu ikut, harga Rp0.
  const addonTotal = 0;
  const total = subtotal + addonTotal;

  return (
    <div>
      <div className="space-y-3">
        {lines.map((line) => {
          const image = lineImage(line, products);
          return (
            <div key={line.key} className="flex gap-4 rounded-2xl p-4" style={{ border: `1px solid ${LINE}`, background: FIELD_BG }}>
              <div className="h-20 w-16 shrink-0 overflow-hidden rounded-xl" style={{ background: "#e5e5e5" }}>
                {image && (
                  <img src={cloudinaryUrl(image, { width: 300 })} alt={lineName(line, products)} className="h-full w-full object-cover" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-semibold">{lineName(line, products)}</p>
                    <p className="mt-0.5 text-[11.5px]" style={{ color: MUTED }}>
                      {[lineColorLabel(line, products), line.size, line.series ? `Series ${line.series}` : ""].filter(Boolean).join(" · ")}
                    </p>
                    <p className="mt-1 text-[12.5px] tabular-nums" style={{ color: MUTED }}>
                      {money(line.price)} / pcs
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(line.key)}
                    aria-label={`Hapus ${lineName(line, products)}`}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors duration-200 hover:bg-white"
                    style={{ color: MUTED }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <Counter value={line.quantity} onChange={(quantity) => onQuantity(line.key, quantity)} />
                  <span className="text-[14px] font-semibold tabular-nums">{money(line.price * line.quantity)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── BONUS COVER HANGER ──
          Bukan pilihan berbayar seperti Open Order: selalu ikut, harga Rp0, dan dibuat
          menonjol (kartu hitam penuh) supaya orang melihat nilai yang mereka dapat. */}
      <div
        className="mt-4 flex items-center justify-between gap-4 rounded-2xl px-5 py-4"
        style={{ background: "#000000", color: "#FFFFFF" }}
      >
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: "#BDBDB8" }}>
            {addonAvailable ? "Bonus pelanggan baru" : "Bonus sedang habis"}
          </p>
          <p className="mt-1 text-[14.5px] font-bold leading-snug">Cover Hanger SAMAQU</p>
          <p className="mt-1 text-[11.5px]" style={{ color: "#C8C8C3" }}>
            {addonAvailable ? "Masuk otomatis di pesanan ini." : "Stok bonus habis — pesanan tetap bisa dilanjutkan."}
          </p>
        </div>
        <div className="flex shrink-0 items-baseline gap-2">
          {addonAvailable ? (
            <span className="text-[12px] line-through" style={{ color: "#8A8A85" }}>
              {money(OPEN_ORDER_ADDON.price)}
            </span>
          ) : null}
          <span className="text-[18px] font-extrabold">{addonAvailable ? "GRATIS" : "—"}</span>
        </div>
      </div>

      {/* Ringkasan */}
      <div className="mt-6 rounded-2xl p-5" style={{ background: FIELD_BG, border: "1px solid rgba(0,0,0,.25)" }}>
        <div className="space-y-2.5">
          <SummaryRow label={`Subtotal (${totalQty} produk)`} value={money(subtotal)} />
          {addonAvailable ? <SummaryRow label="Cover Hanger (bonus)" value="Rp0" /> : null}
        </div>
        <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${LINE}` }}>
          <SummaryRow label="Total" value={money(total)} strong />
        </div>
        <div className="mt-3 space-y-2.5 pt-3" style={{ borderTop: `1px solid ${LINE}` }}>
          {/* `itemsWeight` SUDAH termasuk berat Cover Hanger (berat varian katalognya),
              jadi baris "Berat produk" memakai sisa setelah bonus — tidak dihitung dua kali. */}
          <SummaryRow label="Berat produk" value={formatWeightExact(Math.max(0, itemsWeight - addonWeight))} />
          <SummaryRow label="Cover Hanger (bonus)" value={`+${formatWeightExact(addonWeight)}`} />
          <SummaryRow label="Total berat" value={formatWeightExact(totalWeight)} strong />
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed" style={{ color: MUTED }}>
          Ongkir dihitung otomatis dari kecamatan tujuan di langkah berikutnya.
        </p>
      </div>

      <div className="mt-5 space-y-3">
        <PrimaryButton onClick={onContinue}>Lanjut ke Data Pemesanan</PrimaryButton>
        <GhostButton onClick={onShopMore}>Lanjut belanja produk lain</GhostButton>
      </div>
    </div>
  );
}
