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

/** Format harga kartu katalog: "Rp 299.000". */
const rupiah = (value: number) => "Rp " + Math.round(value).toLocaleString("id-ID");

export default function StepCatalog({
  products,
  period,
  phase,
  countdownTarget,
  startInfo,
  startInfoShort,
  endInfo,
  onRemind,
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
  /** Versi bulan singkat ("21 Okt 2026 · 10.00 WIB") — buat layar sempit. */
  startInfoShort?: string;
  /** "22 Okt 2026 · 23.59 WIB" — baris info saat event sudah berakhir. */
  endInfo?: string;
  /** Callback tombol pengingat / kabari periode berikutnya. */
  onRemind?: () => void;
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
          startInfoShort={startInfoShort}
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

      {/* Produk — MOBILE: grid 2x2 (ala marketplace). Desktop/tablet: kartu 340px yang
          dibungkus flex-wrap dan dipusatkan, sesuai mockup. Kalau cuma satu produk, kartu
          tetap dipusatkan (bukan nempel di kolom kiri). */}
      <section
        className={
          shown.length === 1
            ? "mt-12 flex flex-wrap justify-center gap-4 md:gap-6 [&>article]:w-full [&>article]:md:w-[340px]"
            : "mt-12 grid grid-cols-2 gap-3 md:flex md:flex-wrap md:justify-center md:gap-6 [&>article]:w-full [&>article]:md:w-[340px]"
        }
      >
        {shown.map((product) => {
          const label = product.kain ? `Kain ${product.kain}` : product.category;
          const totalStock = product.totalStock;
          const isSoldOut = totalStock === 0;
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
              className={`group oo-fade-up w-full cursor-pointer overflow-hidden bg-white shadow-sm transition-shadow duration-500 hover:shadow-xl ${
                shown.length === 1 ? "max-w-[340px] rounded-3xl" : "rounded-2xl md:rounded-3xl"
              }`}
              style={{ animationDelay: ".2s" }}
              onClick={() => onOpen(product, initialColor)}
            >
              <div className="relative aspect-[3/4] overflow-hidden bg-[#f5f5f4]">
                {mainImage && (
                  <img
                    src={cloudinaryUrl(mainImage, { width: 700 })}
                    alt={product.name}
                    loading="lazy"
                    /* `object-contain` → foto produk tampil UTUH (nggak terpotong), beda sama
                       kartu katalog yang pakai `object-cover`. */
                    className="h-full w-full object-contain p-1 transition-transform duration-700 group-hover:scale-[1.03]"
                    style={isSoldOut ? { filter: "grayscale(35%) brightness(.85)" } : undefined}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                )}

                {/* Badge "Sold Out" saja — tulisan stok ("Ready stock") nggak dipakai di sini. */}
                {isSoldOut && (
                  <span className="absolute left-2.5 top-2.5 rounded-full bg-neutral-950 px-2 py-0.5 text-[10px] font-semibold text-white md:left-4 md:top-4 md:px-3 md:py-1 md:text-xs">
                    Sold Out
                  </span>
                )}

                {/* Kunci — event BELUM dibuka / sudah berakhir: foto digelapkan + pill
                    "Segera dibuka" di tengahnya (biar jelas belum bisa dipesan).
                    Event SUDAH dibuka → tidak ada overlay sama sekali, fotonya cerah
                    persis seperti di halaman Katalog. */}
                {locked && (
                  <div className="oo-lock-overlay absolute inset-0 flex items-center justify-center bg-black/25">
                    <span
                      title={lockMessage}
                      className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-black shadow-md md:gap-2 md:px-4 md:py-2 md:text-sm"
                    >
                      <Lock size={12} strokeWidth={2.5} className="shrink-0 md:h-[14px] md:w-[14px]" />
                      {phase === "ended" ? "Sudah ditutup" : "Segera dibuka"}
                    </span>
                  </div>
                )}
              </div>

              <div className="p-3 md:p-6">
                <h3 className="text-sm font-bold leading-snug md:text-xl">
                  <span className="hover:underline">{product.name}</span>
                </h3>
                <p className="mt-1 text-[11px] leading-snug text-neutral-500 md:text-sm">
                  {label}
                  {seriesCount > 1 ? ` · ${seriesCount} series tersedia` : ""}
                </p>

                <p className="mt-2 text-[11px] text-neutral-500 md:mt-4 md:text-sm">Mulai</p>
                <p className="text-base font-extrabold md:text-2xl">{rupiah(openOrderProductPrice(product))}</p>

                {locked ? (
                  <button
                    type="button"
                    className="mt-3 w-full cursor-not-allowed rounded-xl border border-black/15 bg-white py-2 text-[11px] font-semibold text-neutral-500 transition hover:border-black hover:text-neutral-900 md:mt-5 md:rounded-2xl md:py-3.5 md:text-sm"
                  >
                    Lihat Detail
                  </button>
                ) : (
                  <span className="mt-3 flex w-full items-center justify-center gap-1 rounded-xl bg-black py-2 text-[11px] font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-lg md:mt-5 md:gap-1.5 md:rounded-2xl md:py-3.5 md:text-sm">
                    Lihat Detail <ChevronRight size={13} strokeWidth={2} className="md:h-[15px] md:w-[15px]" />
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
