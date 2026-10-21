"use client";

/**
 * Langkah 1 — daftar produk Open Order.
 *
 * Tampilan mengikuti mockup (grayscale): hero "CREATE YOUR PRICE / Open Order Samaqu",
 * kartu timer besar, lalu grid kartu produk — kartu putih radius 3xl, foto 3:4, badge
 * "Ready stock" di atas foto, dan overlay kunci saat event belum dibuka / sudah berakhir.
 *
 * Data produk tetap berasal dari katalog (lihat `src/lib/open-order-offering.ts`) — tidak
 * ditulis tangan. Filter kategori dipakai kalau memang ada lebih dari satu kategori.
 */

import { useMemo, useState } from "react";
import { ChevronRight, Lock } from "lucide-react";
import { cloudinaryUrl } from "@/lib/cloudinary";
import { openOrderProductImage } from "@/lib/open-order-catalog";
import {
  lowestOpenOrderPrice,
  openOrderProductPrice,
  type OpenOrderProduct,
} from "@/lib/open-order-offering";
import Countdown, { type OpenOrderPhase } from "./Countdown";

const ALL = "semua";
/** Ambang "stok menipis" — angka yang sama dengan kartu katalog. */
const LOW_STOCK_THRESHOLD = 3;

/** Format harga kartu katalog: "Rp 299.000". */
const rupiah = (value: number) => "Rp " + Math.round(value).toLocaleString("id-ID");

export default function StepCatalog({
  products,
  period,
  phase,
  countdownTarget,
  startInfo,
  endInfo,
  onRemind,
  onLockedAction,
  cartCount,
  onOpen,
  onViewCart,
}: {
  products: OpenOrderProduct[];
  /** Periode Open Order — dibaca dari store_settings (diatur di menu admin "Open Order"). */
  period: string;
  /** Fase event: belum dibuka / sedang berjalan / sudah berakhir. */
  phase: OpenOrderPhase;
  /** Batas hitung mundur (epoch ms) — `null` kalau jadwalnya belum diatur. */
  countdownTarget: number | null;
  /** "21 Oktober 2026 · 10.00 WIB" — baris info saat event belum dibuka. */
  startInfo?: string;
  /** "22 Okt 2026 · 23.59 WIB" — baris info saat event sudah berakhir. */
  endInfo?: string;
  /** Callback tombol pengingat / kabari periode berikutnya. */
  onRemind?: () => void;
  /** Callback saat tombol produk yang terkunci diklik (memunculkan toast). */
  onLockedAction?: () => void;
  cartCount: number;
  onOpen: (product: OpenOrderProduct, color: string) => void;
  onViewCart: () => void;
}) {
  const [category, setCategory] = useState<string>(ALL);

  const categories = useMemo(
    () => [...new Set(products.map((product) => product.category))].sort((a, b) => a.localeCompare(b)),
    [products]
  );
  // Satu kartu per PRODUK (bukan per warna/varian). Pengelompokan sudah dilakukan
  // `buildOpenOrderProducts` dengan kunci yang sama seperti halaman Katalog
  // (kategori + nama), jadi Kabak (Kabak 01/02/04/12) tampil sebagai satu kartu.
  const lowestPrice = useMemo(() => lowestOpenOrderPrice(products), [products]);
  const shown = useMemo(
    () => (category === ALL ? products : products.filter((product) => product.category === category)),
    [products, category],
  );

  // Event belum dibuka / sudah berakhir → produk dikunci (overlay + tombol nonaktif).
  const locked = phase !== "live";
  const lockMessage = phase === "ended" ? "Follow untuk info batch berikutnya" : "Belum dibuka";

  return (
    <div>
      {/* Hero */}
      <section className="oo-fade-up pb-10 pt-6 text-center">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[.3em] text-neutral-600">
          Create Your Price
        </p>
        <h1
          className="text-4xl sm:text-6xl"
          style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontWeight: 500 }}
        >
          Open Order Samaqu
        </h1>
        <p className="mt-3 text-neutral-500">Periode {period}</p>
        <p className="mx-auto mt-4 max-w-xl text-neutral-600">
          Pilih produk, atur ukuran dan harga, lalu kirim pesanan kamu. Admin akan mengonfirmasi lewat WhatsApp.
        </p>
      </section>

      {/* Timer */}
      <section className="oo-fade-up mx-auto max-w-2xl" style={{ animationDelay: ".1s" }}>
        <Countdown
          target={countdownTarget}
          phase={phase}
          variant="card"
          startInfo={startInfo}
          endInfo={endInfo}
          onRemind={onRemind}
        />
      </section>

      {/* Filter kategori */}
      {categories.length > 1 && (
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          {categories.map((name) => {
            const active = category === name;
            return (
              <button
                key={name}
                type="button"
                onClick={() => setCategory(name)}
                className={`rounded-full border px-4 py-2 text-xs font-medium transition ${
                  active
                    ? "border-neutral-950 bg-neutral-950 text-white"
                    : "border-black/15 bg-white text-neutral-700 hover:bg-neutral-100"
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>
      )}

      {/* Produk */}
      <section className="mt-12 flex flex-wrap justify-center gap-6 [&>article]:w-full [&>article]:sm:w-[340px]">
        {shown.map((product) => {
          const label = product.kain ? `Kain ${product.kain}` : product.category;
          const totalStock = product.totalStock;
          const isSoldOut = totalStock === 0;
          const isLowStock = totalStock > 0 && totalStock <= LOW_STOCK_THRESHOLD;
          const seriesCount = product.series.length;
          // Foto kartu = media bertipe GAMBAR (bukan video) dari varian; `product.image`
          // sendiri bisa berupa .mp4 sehingga `<img>` gagal dan kartu tampak kosong.
          const mainImage = openOrderProductImage(
            product,
            product.variants.find((variant) => variant.stock > 0)?.color ?? product.colors[0] ?? "",
          );
          // Warna awal saat "Lihat Detail": yang masih ada stok, kalau semua habis warnanya pertama.
          const initialColor =
            product.variants.find((variant) => variant.stock > 0)?.color ??
            product.colors[0] ??
            "";

          return (
            <article
              key={product.id}
              className="group oo-fade-up w-full max-w-[340px] cursor-pointer overflow-hidden rounded-3xl bg-white shadow-sm transition-shadow duration-500 hover:shadow-xl"
              style={{ animationDelay: ".2s" }}
              onClick={() => onOpen(product, initialColor)}
            >
              <div className="relative aspect-[3/4] overflow-hidden bg-neutral-100">
                {mainImage && (
                  <img
                    src={cloudinaryUrl(mainImage, { width: 700 })}
                    alt={product.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    style={isSoldOut ? { filter: "grayscale(35%) brightness(.85)" } : undefined}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                )}

                {/* Badge status stok */}
                {!isSoldOut && (
                  <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold backdrop-blur">
                    {isLowStock ? `Menipis — sisa ${totalStock}` : "Ready stock"}
                  </span>
                )}
                {isSoldOut && (
                  <span className="absolute left-4 top-4 rounded-full bg-neutral-950 px-3 py-1 text-xs font-semibold text-white">
                    Sold Out
                  </span>
                )}

                {/* Overlay kunci — event belum dibuka / sudah berakhir */}
                {locked && (
                  <div className="oo-lock-overlay absolute inset-0 flex items-center justify-center bg-black/25">
                    <span className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black">
                      <Lock size={14} strokeWidth={2.5} />
                      {lockMessage}
                    </span>
                  </div>
                )}
              </div>

              <div className="p-6">
                <h3 className="text-xl font-bold">
                  <span className="hover:underline">{product.name}</span>
                </h3>
                <p className="mt-1 text-sm text-neutral-500">
                  {label}
                  {seriesCount > 1 ? ` · ${seriesCount} series tersedia` : ""}
                </p>

                <p className="mt-4 text-sm text-neutral-500">Mulai</p>
                <p className="text-2xl font-extrabold">{rupiah(openOrderProductPrice(product))}</p>

                {locked ? (
                  <button
                    type="button"
                    onClick={() => onLockedAction?.()}
                    className="mt-5 w-full cursor-not-allowed rounded-2xl border border-black/15 bg-white py-3.5 font-semibold text-neutral-400 transition hover:border-black hover:text-neutral-900"
                  >
                    {phase === "ended" ? "Lihat Detail Produk" : "Belum Dibuka"}
                  </button>
                ) : (
                  <span className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-2xl bg-black py-3.5 font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-lg">
                    Lihat Detail <ChevronRight size={15} strokeWidth={2} />
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </section>

      {shown.length === 0 && (
        <p className="py-10 text-center text-sm text-neutral-500">Belum ada produk untuk kategori ini.</p>
      )}

      {/* Catatan harga */}
      {lowestPrice !== null && (
        <p className="mx-auto mt-10 max-w-2xl text-sm text-neutral-500">
          Harga di atas adalah harga Open Order periode ini. Kamu bisa menentukan harga sendiri (Create Your Price) di
          langkah berikutnya, mulai dari {rupiah(lowestPrice)}.
        </p>
      )}

      {cartCount > 0 && (
        <div className="mx-auto mt-8 max-w-2xl">
          <button
            type="button"
            onClick={onViewCart}
            className="w-full rounded-2xl bg-black py-3.5 font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            Lihat Pesanan ({cartCount})
          </button>
        </div>
      )}
    </div>
  );
}
