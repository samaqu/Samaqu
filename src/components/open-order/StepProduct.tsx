"use client";

/**
 * Langkah 2 — detail produk. Tampilan mengikuti mockup (grayscale): galeri 4:5 dengan
 * thumbnail, judul serif besar, baris seri/ukuran berupa chip, kartu harga Create Your
 * Price, bar jumlah, dan CTA besar yang berubah sesuai fase event:
 * - `live`     → "TAMBAH KE PESANAN" (hitam),
 * - `upcoming` → tombol shimmer gelap berisi ikon kunci + "SEGERA DIBUKA" + hitung mundur,
 * - `ended`    → "OPEN ORDER DITUTUP" (abu, nonaktif).
 *
 * Data produk/warna/series/ukuran tetap berasal dari katalog (lihat `open-order-offering.ts`).
 */

import { useEffect, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { cloudinaryUrl } from "@/lib/cloudinary";
import { colorMap } from "@/lib/katalog-data";
import { openOrderGallery } from "@/lib/open-order-catalog";
import { OPEN_ORDER_SIZES } from "@/lib/open-order-config";
import {
  findOpenOrderProduct,
  openOrderColorLabel,
  openOrderVariantFor,
  type OpenOrderProduct,
} from "@/lib/open-order-offering";
import type { ProductDraft } from "./types";
import Countdown, { type OpenOrderPhase } from "./Countdown";

/** Format harga sama dengan halaman detail Katalog ("Rp 299.000"). */
const rupiah = (value: number) => "Rp " + Math.round(value).toLocaleString("id-ID");

/** Deskripsi cadangan per kategori — sama dengan `getDescription()` di halaman katalog. */
const DESCRIPTION_BY_CATEGORY: Record<string, string> = {
  Thobe:
    "Thobe premium dengan bahan pilihan yang adem dan nyaman. Potongan presisi, jahitan rapi, cocok untuk ibadah maupun acara istimewa. Tersedia dalam berbagai pilihan kain dan warna.",
  Kandora:
    "Kandora berkualitas dengan bahan ringan dan potongan yang elegan. Nyaman dipakai sehari-hari maupun untuk acara formal.",
  Koko:
    "Baju Koko dengan desain modern dan bahan premium. Nyaman untuk shalat maupun kegiatan sehari-hari.",
  Vest: "Vest elegan dengan potongan yang presisi. Cocok dipadukan dengan thobe atau koko untuk tampilan lebih berkelas.",
  Kabak: "Kabak premium dengan kualitas terbaik. Tersedia dalam berbagai pilihan.",
  "Cover & Hanger": "Cover dan hanger premium untuk menjaga busana tetap rapi dan terlindungi.",
};

/** Accordion info — sama seperti blok "Detail bahan / Panduan ukuran / Pengiriman" di katalog. */
function InfoAccordionItem({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="rounded-xl border border-black/5 bg-[#ebebe9]">
      <summary
        className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3.5 text-sm font-medium"
        onClick={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
        }}
      >
        {title}
        <ChevronDown size={14} strokeWidth={2} className="shrink-0" style={{ transform: open ? "rotate(180deg)" : "none" }} />
      </summary>
      {open && <p className="px-4 pb-4 text-sm text-neutral-600">{children}</p>}
    </details>
  );
}

export default function StepProduct({
  draft,
  products,
  phase,
  countdownTarget,
  endInfo,
  onChange,
  onAdd,
}: {
  draft: ProductDraft;
  products: OpenOrderProduct[];
  /** Fase event — menentukan tampilan CTA. */
  phase: OpenOrderPhase;
  /** Batas hitung mundur (epoch ms) — dipakai di dalam tombol terkunci. */
  countdownTarget: number | null;
  /** "22 Okt 2026 · 23.59 WIB" — dipakai saat event sudah berakhir. */
  endInfo?: string;
  onChange: (patch: Partial<ProductDraft>) => void;
  onAdd: (line: ProductDraft) => void;
}) {
  const product = findOpenOrderProduct(products, draft.productId);
  const series = product?.series.find((option) => option.name === draft.series) ?? null;
  const variant = product ? openOrderVariantFor(product, draft.color, series?.name ?? null) : undefined;

  // Ukuran dari varian warna/series terpilih; daftar statis cuma cadangan (data varian kosong).
  const sizes = variant && variant.sizes.length > 0 ? variant.sizes : [...OPEN_ORDER_SIZES];
  const cypEnabled = product?.cypEnabled ?? false;
  const minimum = series?.price ?? product?.minimumPrice ?? 0;

  const [price, setPrice] = useState(draft.price);
  const [photo, setPhoto] = useState(0);
  // Video: tampilkan poster + tombol play dulu (sama seperti halaman katalog), supaya
  // tidak ada kotak hitam saat frame video belum ter-paint.
  const [playing, setPlaying] = useState(false);

  const gallery = product ? openOrderGallery(product, draft.color, series?.name ?? null) : [];
  const activePhoto = Math.min(photo, Math.max(gallery.length - 1, 0));
  const currentMedia = gallery[activePhoto] ?? null;
  /** Foto yang dipakai sebagai cover video — foto pertama di galeri. */
  const videoPoster = gallery.find((item) => item.type === "image")?.src || product?.image || "";

  // Produk/warna/series berganti → harga & foto ikut menyesuaikan.
  useEffect(() => {
    setPrice(draft.price);
    setPhoto(0);
    setPlaying(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.productId, draft.color, series?.name]);

  // Ukuran terpilih harus tetap ada di varian yang baru.
  useEffect(() => {
    if (sizes.includes(draft.size)) return;
    onChange({ size: sizes.includes("M") ? "M" : sizes[0] ?? "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.productId, draft.color, series?.name, sizes.join("|")]);

  if (!product) return null;

  const colorLabel = openOrderColorLabel(product, draft.color);
  const finalPrice = cypEnabled ? (price >= minimum ? price : minimum) : minimum;
  const priceTooLow = cypEnabled && price < minimum;
  const lineTotal = finalPrice * draft.quantity;
  const description = product.description || DESCRIPTION_BY_CATEGORY[product.category] || "";

  function handlePriceInput(raw: string) {
    const digits = raw.replace(/[^0-9]/g, "");
    const value = digits ? parseInt(digits, 10) : 0;
    setPrice(value);
    if (value >= minimum) onChange({ price: value });
  }

  function handleAdd() {
    if (priceTooLow || phase !== "live") return;
    onAdd({ ...draft, price: finalPrice, series: series?.name ?? "" });
  }

  const locked = phase !== "live";

  return (
    <div className="grid grid-cols-1 gap-8 py-8 lg:grid-cols-[1fr_1.15fr] lg:gap-12">
      {/* ── Galeri ── */}
      <section>
        <div className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-[#e9e9e7]">
          {currentMedia?.type === "video" ? (
            playing ? (
              <video
                key={currentMedia.src}
                src={currentMedia.src}
                loop
                muted
                autoPlay
                playsInline
                preload="auto"
                onClick={() => setPlaying(false)}
                className="h-full w-full cursor-pointer object-contain"
              />
            ) : (
              <>
                {videoPoster && (
                  <img
                    src={cloudinaryUrl(videoPoster, { width: 1200 })}
                    alt={product.name}
                    className="h-full w-full object-contain"
                  />
                )}
                <button
                  type="button"
                  onClick={() => setPlaying(true)}
                  aria-label="Putar video"
                  className="absolute inset-0 z-10 flex items-center justify-center"
                  style={{ background: "rgba(0,0,0,.08)" }}
                >
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-white shadow-lg transition-transform hover:scale-110">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </span>
                </button>
              </>
            )
          ) : currentMedia ? (
            <img
              key={currentMedia.src}
              src={cloudinaryUrl(currentMedia.src, { width: 1200 })}
              alt={product.name}
              loading="lazy"
              className="h-full w-full object-contain transition-opacity duration-300"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : null}

          {gallery.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => setPhoto((i) => (i - 1 + gallery.length) % gallery.length)}
                aria-label="Foto sebelumnya"
                className="absolute left-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow"
              >
                <ChevronLeft size={14} strokeWidth={2.5} />
              </button>
              <button
                type="button"
                onClick={() => setPhoto((i) => (i + 1) % gallery.length)}
                aria-label="Foto berikutnya"
                className="absolute right-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow"
              >
                <ChevronRight size={14} strokeWidth={2.5} />
              </button>
            </>
          )}
        </div>

        {/* Thumbnail */}
        {gallery.length > 1 && (
          <div className="mt-3 grid grid-cols-4 gap-2.5">
            {gallery.map((item, i) => (
              <button
                key={item.src}
                type="button"
                onClick={() => setPhoto(i)}
                aria-label={`Foto ${i + 1}`}
                className={`aspect-[4/5] overflow-hidden rounded-xl bg-[#e9e9e7] transition ${
                  i === activePhoto ? "ring-2 ring-black" : "ring-1 ring-black/10"
                }`}
              >
                {item.type === "video" ? (
                  <span className="relative block h-full w-full">
                    <img src={cloudinaryUrl(videoPoster, { width: 300 })} alt="" className="h-full w-full object-contain" loading="lazy" />
                    <span className="absolute inset-0 grid place-items-center" style={{ background: "rgba(0,0,0,.28)" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff" aria-hidden>
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </span>
                  </span>
                ) : (
                  <img
                    src={cloudinaryUrl(item.src, { width: 300 })}
                    alt=""
                    className="h-full w-full object-contain"
                    loading="lazy"
                  />
                )}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ── Info ── */}
      <section>
        <p className="text-[11px] font-semibold uppercase tracking-[.25em] text-neutral-500">Detail Produk</p>
        <h1
          className="mt-2 text-4xl leading-tight sm:text-[44px]"
          style={{ fontFamily: "var(--font-cormorant), Georgia, serif" }}
        >
          {product.name}
          {product.kain ? ` — Kain ${product.kain}` : series ? ` — ${series.name}` : colorLabel ? ` — ${colorLabel}` : ""}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {product.kain && (
            <>
              Jenis kain <b className="font-medium text-neutral-800">{product.kain}</b> ·{" "}
            </>
          )}
          {product.category}
          {product.weight ? ` · ${product.weight >= 1000 ? (product.weight / 1000).toFixed(1) + " kg" : product.weight + " g"}` : ""}
        </p>

        {/* Timer — disembunyikan saat event belum dibuka (timer-nya sudah ada di dalam CTA). */}
        {phase !== "upcoming" && (
          <div className="mt-5">
            <Countdown target={countdownTarget} phase={phase} variant="pill" endInfo={endInfo} />
          </div>
        )}

        {/* Series */}
        {product.series.length > 0 && (
          <>
            <p className="mt-7 text-[11px] font-semibold uppercase tracking-[.2em]">Pilih Series</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {product.series.map((option) => {
                const active = option.name === series?.name;
                return (
                  <button
                    key={option.name}
                    type="button"
                    onClick={() => onChange({ series: option.name, price: option.price })}
                    className={`rounded-lg border px-3.5 py-2 text-xs transition ${
                      active ? "border-neutral-950 bg-neutral-950 text-white" : "border-black/15 bg-white text-neutral-800 hover:bg-neutral-100"
                    }`}
                  >
                    <b className="font-semibold">{option.name}</b>
                    <span className="ml-1.5 opacity-70">mulai dari {rupiah(option.price)}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Warna */}
        {product.colors.length > 0 && product.colors.some((c) => c && c !== "default") && (
          <>
            <p className="mt-6 text-[11px] font-semibold uppercase tracking-[.2em]">Pilih Warna</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {product.colors.map((color) => {
                const variant = openOrderVariantFor(product, color);
                const stock = variant?.stock ?? 0;
                const habis = stock === 0;
                const active = color === draft.color;
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => onChange({ color })}
                    disabled={habis}
                    title={habis ? "Stok habis" : `Stok ${stock}`}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition disabled:cursor-not-allowed ${
                      active ? "border-neutral-950 bg-neutral-950 text-white" : "border-black/15 bg-white text-neutral-800 hover:bg-neutral-100"
                    }`}
                    style={{ opacity: habis && !active ? 0.5 : 1 }}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: colorMap[color] || "#ccc", border: "1px solid rgba(0,0,0,.1)" }}
                    />
                    {openOrderColorLabel(product, color)}
                    <span className={`text-[10px] font-semibold tabular-nums ${habis ? "text-red-600" : active ? "text-white/80" : "text-neutral-500"}`}>
                      {habis ? "Habis" : stock}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Ukuran */}
        <p className="mt-6 text-[11px] font-semibold uppercase tracking-[.2em]">Pilih Ukuran</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {sizes.map((size) => {
            const active = size === draft.size;
            return (
              <button
                key={size}
                type="button"
                onClick={() => onChange({ size })}
                className={`h-9 min-w-[44px] rounded-lg border px-3 text-xs font-medium transition ${
                  active ? "border-neutral-950 bg-neutral-950 text-white" : "border-black/15 bg-white text-neutral-800 hover:bg-neutral-100"
                }`}
              >
                {size}
              </button>
            );
          })}
        </div>

        {/* Harga */}
        <div className="mt-6 rounded-2xl border border-black/10 bg-white p-5">
          <p className="text-[11px] uppercase tracking-[.2em] text-neutral-500">
            {cypEnabled ? "Harga Minimum" : "Harga"}
          </p>
          <p className="mt-1 text-xl font-bold">{rupiah(minimum)}</p>
          {cypEnabled && (
            <>
              <p className="mt-1 text-xs text-neutral-500">
                Create Your Price — pilih harga terbaikmu{series ? ` untuk series ${series.name}` : ""}.
              </p>
              <label className="mt-3 flex items-center gap-2 rounded-xl border border-black/15 px-4 py-3 transition focus-within:border-black">
                <span className="text-sm text-neutral-500">Rp</span>
                <input
                  value={price ? price.toLocaleString("id-ID") : ""}
                  onChange={(e) => handlePriceInput(e.target.value)}
                  inputMode="numeric"
                  aria-label="Harga pilihanmu"
                  placeholder={minimum.toLocaleString("id-ID")}
                  className="flex-1 bg-transparent font-semibold outline-none"
                />
              </label>
              {priceTooLow && (
                <p className="mt-2 text-[11.5px] leading-relaxed text-red-600">
                  Harga minimum{series ? ` untuk series ${series.name}` : ""} adalah {rupiah(minimum)}.
                </p>
              )}
            </>
          )}
        </div>

        {description && <p className="mt-6 text-sm leading-relaxed text-neutral-700">{description}</p>}

        {/* Jumlah */}
        <div className="mt-6 flex items-center justify-between border-t border-black/10 pt-5">
          <span className="text-[11px] font-semibold uppercase tracking-[.2em]">Jumlah</span>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => onChange({ quantity: Math.max(1, draft.quantity - 1) })}
              className="grid h-8 w-8 place-items-center rounded-lg border border-black/15 bg-white transition hover:bg-neutral-100"
              aria-label="Kurangi jumlah"
            >
              <Minus size={13} />
            </button>
            <span className="w-4 text-center font-semibold">{draft.quantity}</span>
            <button
              type="button"
              onClick={() => onChange({ quantity: draft.quantity + 1 })}
              className="grid h-8 w-8 place-items-center rounded-lg border border-black/15 bg-white transition hover:bg-neutral-100"
              aria-label="Tambah jumlah"
            >
              <Plus size={13} />
            </button>
          </div>
        </div>

        {/* Total */}
        <div className="mt-5 flex items-center justify-between border-t border-black/10 pt-5">
          <span className="text-[11px] font-semibold uppercase tracking-[.2em]">
            Total ({draft.quantity} pcs)
          </span>
          <span className="text-2xl font-bold">{rupiah(lineTotal)}</span>
        </div>

        {/* CTA — berubah sesuai fase event */}
        <div className="relative mt-5 h-[58px]">
          {phase === "live" ? (
            <button
              type="button"
              onClick={handleAdd}
              disabled={priceTooLow}
              className="absolute inset-0 w-full rounded-xl text-sm font-semibold uppercase tracking-[.15em] transition-all duration-500 hover:-translate-y-0.5 hover:shadow-xl active:scale-[.99] disabled:opacity-40"
              style={{ background: "#000000", color: "#fff" }}
            >
              Tambah ke Pesanan
            </button>
          ) : phase === "upcoming" ? (
            <>
              <div className="oo-shimmer absolute inset-0 flex cursor-not-allowed items-center justify-center rounded-xl text-white">
                <Countdown target={countdownTarget} phase={phase} variant="inline" />
              </div>
              <p className="mt-2 h-4 text-center text-xs text-neutral-500">
                Tombol pesanan aktif otomatis saat Open Order dimulai.
              </p>
            </>
          ) : (
            <>
              <div className="absolute inset-0 flex cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-neutral-200 text-sm font-semibold uppercase tracking-[.15em] text-neutral-500">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M5.6 5.6l12.8 12.8" />
                </svg>
                Open Order Ditutup
              </div>
              <p className="mt-2 h-4 text-center text-xs text-neutral-500">
                Periode ini sudah berakhir. <span className="font-medium text-neutral-800 underline">Kabari saya periode berikutnya</span>
              </p>
            </>
          )}
        </div>

        {/* Info tambahan */}
        <div className="mt-6 space-y-2.5">
          <InfoAccordionItem title="Detail bahan & perawatan">
            Kain premium dengan sirkulasi udara baik, tidak menerawang, dan jatuh rapi. Cuci dengan air dingin, setrika suhu sedang, jangan pakai pemutih.
          </InfoAccordionItem>
          <InfoAccordionItem title="Panduan ukuran">
            Tersedia ukuran XS–XXL. Ukur lingkar dada dan panjang badan, lalu sesuaikan dengan tabel ukuran. Ragu? Chat kami via WhatsApp.
          </InfoAccordionItem>
          <InfoAccordionItem title="Pengiriman & pengembalian">
            Dikirim 1–2 hari kerja setelah pembayaran. Salah ukuran bisa ditukar maksimal 7 hari setelah barang diterima.
          </InfoAccordionItem>
        </div>
      </section>
    </div>
  );
}
