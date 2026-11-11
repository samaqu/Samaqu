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
import Image from "next/image";
import { ArrowUpRight, ChevronRight, Lock } from "lucide-react";
import { InstagramGlyph } from "./icons";
import { cloudinaryUrl } from "@/lib/cloudinary";
import { openOrderProductImage } from "@/lib/open-order-catalog";
import { openOrderProductPrice, type OpenOrderProduct } from "@/lib/open-order-offering";
import Countdown, { type OpenOrderPhase } from "./Countdown";

const ALL = "semua";

/** Format harga kartu katalog: "Rp 299.000". */
const rupiah = (value: number) => "Rp " + Math.round(value).toLocaleString("id-ID");

/**
 * Foto kartu produk.
 *
 * Dirender lewat `next/image` supaya URL-nya keluar dari domain sendiri (`/_next/image`)
 * — tidak bergantung pada jangkauan domain R2 dari perangkat customer — dan otomatis
 * mengecilkan berkas sesuai lebar kartu. Kalau gambarnya tidak ada atau gagal dimuat,
 * kartu menampilkan placeholder abu + nama produk, bukan kotak kosong tanpa keterangan.
 */
function ProductCardImage({
  src,
  name,
  soldOut,
  eager,
  highPriority,
}: {
  src: string;
  name: string;
  soldOut: boolean;
  eager: boolean;
  highPriority: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className="absolute inset-0 grid place-items-center bg-[#f5f5f4] p-3 text-center md:p-4">
        <span className="text-[11px] font-medium leading-snug text-neutral-500 md:text-sm">{name}</span>
      </div>
    );
  }

  return (
    <Image
      src={cloudinaryUrl(src, { width: 700 })}
      alt={name}
      fill
      sizes="(max-width: 768px) 50vw, 340px"
      /* Next 16 hanya mengizinkan quality bawaan config (75) — lihat laporan. */
      quality={75}
      priority={highPriority}
      loading={eager ? "eager" : "lazy"}
      className="object-contain p-1 transition-transform duration-700 group-hover:scale-[1.03]"
      style={soldOut ? { filter: "grayscale(35%) brightness(.85)" } : undefined}
      onError={() => setFailed(true)}
    />
  );
}

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
  const shown = useMemo(
    () => (category === ALL ? products : products.filter((product) => product.category === category)),
    [products, category],
  );

  // Event belum dibuka / sudah berakhir → produk dikunci (overlay + tombol nonaktif).
  const locked = phase !== "live";
  const lockMessage = phase === "ended" ? "Follow untuk info batch berikutnya" : "Belum dibuka";

  return (
    <div>
      {/* Hero — mengikuti mockup pemilik.
          Judul dua baris: "Create Your" lalu "Price" yang latarnya menyapu hitam dari kiri
          lalu teksnya jadi putih (`oo-title-sweep`). Huruf memakai Inter Tight (display
          mockup), ukuran clamp() supaya aman dari HP sampai desktop.
          Dipakai di SEMUA fase (buka maupun tutup). */}
      <section className="pb-10 pt-8 text-center sm:pt-14">
        <h1
          className="oo-title-in mx-auto font-extrabold leading-[.92] tracking-[-.045em] text-neutral-950"
          style={{
            fontFamily: "var(--font-inter-tight), var(--font-inter), system-ui, sans-serif",
            fontSize: "clamp(2.6rem, 12vw, 6.5rem)",
            maxWidth: "12ch",
          }}
        >
          <span className="block">Create Your</span>
          <span className="relative mt-2 inline-block px-3 pb-1 sm:px-4" style={{ animationDelay: ".1s" }}>
            {/* Kotak hitam: menyapu dari kiri (scaleX) — sekali jalan, bukan berulang. */}
            <span className="oo-title-sweep absolute inset-0 rounded-xl bg-neutral-950 sm:rounded-2xl" />
            <span className="relative" style={{ color: "#fff" }}>
              Price
            </span>
          </span>
        </h1>

        <p
          className="oo-fade-up mx-auto mt-5 max-w-xl px-1 text-[15px] font-semibold text-neutral-900 sm:mt-6 sm:text-lg"
          style={{ animationDelay: ".15s" }}
        >
          Produk Pilihan, Hadir Bergantian.
        </p>
        <p
          className="oo-fade-up mx-auto mt-3 max-w-[22rem] px-1 text-sm leading-relaxed text-neutral-600 sm:max-w-md sm:text-base"
          style={{ animationDelay: ".25s" }}
        >
          Temukan produk pilihan Samaqu yang hadir bergantian di halaman Open Order. Nikmati
          kesempatan mendapatkannya dengan harga minimum.
        </p>

        {/* Kartu Follow Instagram (versi mockup). Tampil di SEMUA fase. */}
        <a
          href="https://instagram.com/samaqu.id"
          target="_blank"
          rel="noopener noreferrer"
          className="oo-fade-up group mx-auto mt-7 flex max-w-xl items-center gap-3 rounded-[20px] border border-black/[.06] bg-white p-3 text-left shadow-[0_8px_30px_rgba(0,0,0,.06)] transition-shadow hover:shadow-[0_10px_36px_rgba(0,0,0,.1)] sm:mt-8 sm:gap-4 sm:p-4"
          style={{ animationDelay: ".35s" }}
        >
          <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-neutral-950 text-white">
            <InstagramGlyph size={20} />
            <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-neutral-950 bg-white" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block whitespace-nowrap text-[11px] font-semibold tracking-[.18em] text-neutral-500">
              INFO BATCH BARU
            </span>
            <span className="mt-0.5 block text-sm font-semibold text-neutral-950 sm:text-[15px]">
              Follow Instagram @samaqu.id
            </span>
            <span className="block text-xs text-neutral-600 sm:text-sm">
              untuk mengetahui produk apa yang akan hadir berikutnya.
            </span>
          </span>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/15 transition group-hover:bg-neutral-950 group-hover:text-white">
            <ArrowUpRight size={14} strokeWidth={2.2} />
          </span>
        </a>
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
        {shown.map((product, index) => {
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
                {/* `object-contain` → foto produk tampil UTUH (nggak terpotong), beda sama
                    kartu katalog yang pakai `object-cover`. */}
                <ProductCardImage
                  src={mainImage}
                  name={product.name}
                  soldOut={isSoldOut}
                  /* 6 kartu pertama dimuat langsung; 2 teratas dapat fetch priority tinggi. */
                  eager={index < 6}
                  highPriority={index < 2}
                />

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

      {/* Penjelasan Create Your Price.
          Muncul selama ada produk yang tampil — sama seperti catatan harga sebelumnya, tapi
          tanpa menyebut angka. Alasan: harga terendah berbeda per kategori/series, jadi satu
          angka di bawah katalog justru menyesatkan. */}
      {products.length > 0 && (
        <div className="mx-auto mt-10 max-w-2xl text-center">
          <h2 className="text-[15px] font-semibold text-neutral-900 sm:text-base">
            Bagaimana Create Your Price Bekerja?
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-[13.5px] leading-relaxed text-neutral-600 sm:text-sm">
            Harga yang tertera merupakan batas minimum setiap produk. Kamu bisa menentukan harga sendiri pada langkah
            pemesanan berikutnya, sesuai kemampuan dan ketentuan yang berlaku.
          </p>
        </div>
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
