"use client";

/**
 * Langkah 3 — keranjang: ubah jumlah, hapus item, dan pilih Extra Cover & Hanger.
 */

import { useState } from "react";
import Image from "next/image";
import { Trash2 } from "lucide-react";
import { money, openOrderImage } from "@/lib/open-order-catalog";
import { OPEN_ORDER_ADDON } from "@/lib/open-order-config";
import { formatWeightExact } from "@/lib/shipping-weight";
import { findOpenOrderProduct, openOrderColorLabel, type OpenOrderProduct } from "@/lib/open-order-offering";
import type { CartLine } from "./types";
import { Counter, FIELD_BG, GhostButton, LINE, MUTED, PrimaryButton, SummaryRow } from "./ui";

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

/**
 * Foto produk di alur Open Order (keranjang, ringkasan, langkah detail).
 *
 * Semua foto lewat `next/image` supaya diminta dari domain sendiri (`/_next/image`) —
 * tidak bergantung pada jangkauan host R2 dari perangkat customer. Kalau gambarnya tidak
 * ada atau gagal dimuat, yang tampil placeholder abu + nama produk, bukan kotak kosong.
 * Parent WAJIB `relative` (komponen ini memakai `fill`).
 */
export function ProductPhoto({
  src,
  name,
  alt,
  sizes,
  priority = false,
  className = "object-cover",
}: {
  src: string;
  name: string;
  /** Teks alternatif lengkap; kalau kosong memakai nama produk. */
  alt?: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className="absolute inset-0 grid place-items-center bg-[#f5f5f4] p-1 text-center">
        <span className="line-clamp-3 text-[9px] font-medium leading-tight text-neutral-500">{name}</span>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt ?? name}
      fill
      sizes={sizes}
      /* Next 16 hanya mengizinkan quality bawaan config (75). */
      quality={75}
      priority={priority}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}

/** Nama warna untuk tampilan (Thobe: dari nama produk, mis. "Navy"). */
export function lineColorLabel(line: CartLine, products: OpenOrderProduct[]): string {
  const product = findOpenOrderProduct(products, line.productId);
  return product ? openOrderColorLabel(product, line.color) : line.color;
}

export default function StepCart({
  lines,
  products,
  subtotal,
  extraCover,
  onToggleExtra,
  addonAvailable,
  addonCover,
  addonCoverOptions,
  onSelectAddonCover,
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
  /** Jenis cover yang dipakai (sudah termasuk pilihan awal otomatis). */
  addonCover: string;
  /** Pilihan yang bisa diklik customer, dengan status stok masing-masing. */
  addonCoverOptions: { color: string; label: string; available: boolean; lowStock: boolean; stock: number | null }[];
  onSelectAddonCover: (color: string) => void;
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
  const addonTotal = extraCover ? OPEN_ORDER_ADDON.price : 0;
  const total = subtotal + addonTotal;

  return (
    <div>
      <div className="space-y-3">
        {lines.map((line) => {
          const image = lineImage(line, products);
          return (
            <div key={line.key} className="flex gap-4 rounded-2xl p-4" style={{ border: `1px solid ${LINE}`, background: FIELD_BG }}>
              <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-xl" style={{ background: "#e5e5e5" }}>
                <ProductPhoto src={image} name={lineName(line, products)} sizes="80px" />
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

      {/* Extra Cover & Hanger — kartu cream premium bergaya katalog. */}
      <style>{ADDON_CSS}</style>
      <button
        type="button"
        onClick={() => addonAvailable && onToggleExtra(!extraCover)}
        aria-pressed={extraCover}
        aria-disabled={!addonAvailable}
        disabled={!addonAvailable}
        className={`oo-addon mt-4${extraCover ? " is-on" : ""}${addonAvailable ? "" : " is-out"}`}
      >
        <span className="oo-addon-copy">
          <span className="oo-addon-name">{OPEN_ORDER_ADDON.name}</span>
          <span className="oo-addon-caption">
            {addonAvailable ? "Opsional · per pesanan" : <span className="oo-addon-out">Habis</span>}
          </span>
        </span>
        <span className="oo-addon-right">
          <span className="oo-addon-price">+{money(OPEN_ORDER_ADDON.price)}</span>
          <span className="oo-addon-seal" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
        </span>
      </button>

      {/* Pilihan jenis cover — hanya muncul setelah add-on dipilih. Pilihan awal sudah
          terisi otomatis dari isi pesanan, customer boleh menggantinya. */}
      {extraCover && (
        <div className="mt-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: MUTED }}>
            Pilih jenis cover
          </p>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Jenis cover">
            {addonCoverOptions.map((option) => {
              const active = option.color === addonCover;
              return (
                <button
                  key={option.color}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={!option.available}
                  onClick={() => onSelectAddonCover(option.color)}
                  className="rounded-xl px-3 py-2.5 text-left text-[12px] font-semibold transition disabled:opacity-40"
                  style={{
                    background: active ? "#000" : "#fff",
                    color: active ? "#fff" : "#000",
                    border: `1.5px solid ${active ? "#000" : "rgba(0,0,0,.25)"}`,
                  }}
                >
                  <span className="block leading-tight">{option.label}</span>
                  <span className="mt-0.5 block text-[10.5px] font-medium opacity-70">
                    {/* Customer hanya melihat STATUS, bukan jumlah stok. */}
                    {option.available ? (option.lowStock ? "Stok terbatas" : "Tersedia") : "Habis"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Ringkasan */}
      <div className="mt-6 rounded-2xl p-5" style={{ background: FIELD_BG, border: "1px solid rgba(0,0,0,.25)" }}>
        <div className="space-y-2.5">
          <SummaryRow label={`Subtotal (${totalQty} produk)`} value={money(subtotal)} />
          {extraCover && <SummaryRow label={OPEN_ORDER_ADDON.name} value={money(addonTotal)} />}
        </div>
        <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${LINE}` }}>
          <SummaryRow label="Total" value={money(total)} strong />
        </div>
        <div className="mt-3 space-y-2.5 pt-3" style={{ borderTop: `1px solid ${LINE}` }}>
          {/* `itemsWeight` sudah termasuk add-on (berat varian katalognya), jadi baris "Berat
              produk" memakai sisa setelah add-on — tidak ada berat yang dihitung dua kali. */}
          <SummaryRow label="Berat produk" value={formatWeightExact(Math.max(0, itemsWeight - (extraCover ? addonWeight : 0)))} />
          {extraCover && (
            <SummaryRow label={OPEN_ORDER_ADDON.name} value={`+${formatWeightExact(addonWeight)}`} />
          )}
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
