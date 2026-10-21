"use client";

/**
 * Langkah 1 — daftar produk Open Order.
 *
 * Kartunya dibuat **identik** dengan kartu produk di halaman Katalog
 * (`src/app/[locale]/(customer)/katalog/page.tsx` → `ProductCard`): kartu putih, judul serif,
 * baris kain, chip "N series tersedia", microcopy stok, harga "Mulai Rp …", dan tombol
 * "Lihat Detail". Bedanya cuma: klik kartu membuka langkah detail wizard (bukan `/katalog/<id>`),
 * dan tombol wishlist tidak ada (Open Order tidak punya wishlist).
 */

import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cloudinaryUrl } from "@/lib/cloudinary";
import { openOrderProductImage } from "@/lib/open-order-catalog";
import {
  lowestOpenOrderPrice,
  openOrderProductPrice,
  type OpenOrderProduct,
} from "@/lib/open-order-offering";
import Countdown from "./Countdown";
import { Chip, INK, MUTED, PrimaryButton } from "./ui";

const ALL = "semua";
/** Ambang "stok menipis" — angka yang sama dengan kartu katalog. */
const LOW_STOCK_THRESHOLD = 3;

/** Format harga kartu katalog: "Rp 329.000". */
const rupiah = (value: number) => "Rp " + Math.round(value).toLocaleString("id-ID");

export default function StepCatalog({
  products,
  period,
  deadline,
  countdownLabel,
  countdownCaption,
  countdownTone,
  locked,
  cartCount,
  onOpen,
  onViewCart,
}: {
  products: OpenOrderProduct[];
  /** Periode Open Order — dibaca dari store_settings (diatur di menu admin "Open Order"). */
  period: string;
  /** Batas hitung mundur (epoch ms) — `null` kalau tanggalnya belum diatur. */
  deadline: number | null;
  /** Label hitung mundur — "Berakhir dalam" (dibuka) atau "Buka dalam" (belum dibuka). */
  countdownLabel?: string;
  /** Keterangan singkat di bawah label hitung mundur. */
  countdownCaption?: string;
  /** Warna titik di depan label: `live` (hijau) atau `soon` (amber). */
  countdownTone?: "live" | "soon";
  /** Pemesanan terkunci (jendela belum dibuka) — tombol tambah pesanan dimatikan. */
  locked?: boolean;
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

  return (
    <div>
      {/* Judul & periode */}
      <div className="text-center">
        <p className="text-[11px] font-medium uppercase tracking-[0.28em]" style={{ color: "var(--gold)" }}>
          Create Your Price
        </p>
        <h1
          className="mt-2 text-[1.7rem] font-semibold leading-tight sm:text-[2.2rem]"
          style={{ fontFamily: "var(--font-cormorant), Georgia, serif", color: "var(--espresso)" }}
        >
          Open Order <span style={{ color: "var(--gold)" }}>Samaqu</span>
        </h1>
        <p className="mt-1.5 text-[13px]" style={{ color: INK }}>
          Periode {period}
        </p>
        {/* Hitung mundur ala marketplace — countdown murni tampilan, tidak menutup wizard. */}
        <Countdown
          deadline={deadline}
          label={countdownLabel}
          caption={countdownCaption}
          tone={countdownTone}
        />
        <p className="mx-auto mt-3 max-w-xl text-[13px] leading-relaxed" style={{ color: MUTED }}>
          Pilih produk, atur ukuran dan harga, lalu kirim pesanan kamu. Admin akan mengonfirmasi lewat WhatsApp.
        </p>
      </div>

      {/* Filter kategori */}
      {categories.length > 1 && (
        <div className="mt-7 flex flex-wrap items-center gap-2">
          <Chip active={category === ALL} onClick={() => setCategory(ALL)}>
            Semua
          </Chip>
          {categories.map((name) => (
            <Chip key={name} active={category === name} onClick={() => setCategory(name)}>
              {name}
            </Chip>
          ))}
        </div>
      )}

      {/* Grid produk — kartu sama seperti halaman katalog.
          Kalau cuma satu produk yang tampil, kartunya DIPUSAT (bukan nempel di kolom
          kiri) — kalau tetap pakai grid, satu-satunya kartu terlihat "yatim" di sisi kiri
          dan halaman terasa kosong. */}
      <div
        className={
          shown.length === 1
            ? "mt-6 flex justify-center"
            : "mt-6 grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5 lg:gap-6"
        }
      >
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
            <button
              key={product.id}
              type="button"
              onClick={() => onOpen(product, initialColor)}
              className={`group relative flex flex-col items-stretch h-full rounded-2xl overflow-hidden cursor-pointer text-left ${
                shown.length === 1 ? "w-[260px] max-w-full shrink-0 sm:w-[280px] md:w-[300px] lg:w-[280px]" : ""
              }`}
              // `align-items: stretch` WAJIB: <button> punya `align-items` default dari UA
              // stylesheet, dan di WebKit (iOS Safari) nilainya bukan stretch — akibatnya
              // container foto nggak melebar, `aspect-ratio` jadi tinggi 0, dan fotonya
              // ILANG di iPhone (di Chrome kebetulan jalan). Lebar kartu juga pakai px
              // tetap (bukan %) supaya sizing-nya deterministik di semua browser.
              style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,.1)", alignItems: "stretch" }}
            >
              {/* Foto */}
              <div
                className="relative w-full overflow-hidden"
                style={{ background: "#e5e5e5", aspectRatio: "3 / 4" }}
              >
                <div
                  className="absolute inset-0 transition-transform duration-700 group-hover:scale-[1.04]"
                  style={{ background: "linear-gradient(135deg,rgba(232,223,209,.6),rgba(0,0,0,.25))" }}
                />
                {mainImage && (
                  <img
                    src={cloudinaryUrl(mainImage, { width: 700 })}
                    alt={product.name}
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                    style={isSoldOut ? { filter: "grayscale(35%) brightness(.85)" } : undefined}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                )}
                {isSoldOut && <div className="absolute inset-0 pointer-events-none" style={{ background: "rgba(0,0,0,.18)" }} />}
                {isSoldOut && (
                  <span
                    className="absolute top-3 right-3 px-2.5 py-1 text-[10px] tracking-[0.12em] uppercase font-ui font-semibold rounded-full z-10"
                    style={{ background: "#000000", color: "white" }}
                  >
                    Sold Out
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="p-3.5 md:p-4 flex flex-col flex-1 w-full">
                <h3
                  className="text-[14px] md:text-[16px] font-semibold leading-snug line-clamp-1"
                  style={{ fontFamily: "var(--font-cormorant), Georgia, serif", color: "#000000" }}
                >
                  {product.name}
                </h3>
                <p className="mt-1 text-[11.5px] font-ui" style={{ color: "#000000" }}>
                  {label}
                </p>

                {/* Jumlah series — slot tinggi tetap, sama seperti kartu katalog */}
                <div className="mt-1.5 min-h-[22px]">
                  {seriesCount > 1 && (
                    <p className="inline-flex items-center gap-1.5 text-[10.5px] font-ui" style={{ color: "rgba(0,0,0,.55)" }}>
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full"
                        style={{ background: "rgba(0,0,0,.05)", border: "1px solid rgba(0,0,0,.15)" }}
                      >
                        <svg
                          width="11"
                          height="11"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="shrink-0"
                          style={{ color: "#000000" }}
                        >
                          <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                          <path d="m3.3 7 8.7 5 8.7-5" />
                          <path d="M12 22V12" />
                        </svg>
                        {seriesCount} series tersedia
                      </span>
                    </p>
                  )}
                </div>

                {/* Stok */}
                {!isSoldOut && (
                  <p className="mt-1 text-[10.5px] font-ui line-clamp-1" style={{ color: isLowStock ? "#b45309" : "#6b8a5e" }}>
                    {isLowStock ? `Menipis — sisa ${totalStock}` : "Ready stock"}
                  </p>
                )}

                {/* Harga */}
                <p className="mt-1 text-[12.5px] font-ui" style={{ color: "rgba(0,0,0,.55)" }}>
                  Mulai{" "}
                  <span className="font-medium" style={{ color: "#000000" }}>
                    {rupiah(openOrderProductPrice(product))}
                  </span>
                </p>

                <span className="mt-auto pt-3 w-full rounded-lg border border-[#000000] px-3 py-2.5 text-[12.5px] text-[#000000] font-ui font-medium flex items-center justify-center gap-1.5 transition-all duration-200 group-hover:bg-[#000000] group-hover:text-white">
                  Lihat Detail <ChevronRight size={14} strokeWidth={2} />
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {shown.length === 0 && (
        <p className="py-10 text-center text-[13px]" style={{ color: MUTED }}>
          Belum ada produk untuk kategori ini.
        </p>
      )}

      {/* Catatan harga */}
      {lowestPrice !== null && (
        <p className="mt-8 text-[11.5px] leading-relaxed" style={{ color: MUTED }}>
          Harga di atas adalah harga Open Order periode ini. Kamu bisa menentukan harga sendiri (Create Your Price) di
          langkah berikutnya — mulai dari {rupiah(lowestPrice)}.
        </p>
      )}

      {cartCount > 0 && (
        <div className="mt-5">
          <PrimaryButton onClick={onViewCart}>{`Lihat Pesanan (${cartCount})`}</PrimaryButton>
        </div>
      )}
    </div>
  );
}
