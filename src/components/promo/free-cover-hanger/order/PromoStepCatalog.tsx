"use client";

/**
 * Langkah 1 — katalog produk promo Free Cover Hanger.
 *
 * Tampilan diport dari mockup landing promo (`public/promo/ini html yg bener/Main.dc.html`):
 * hitam-putih, garis 1.5px, radius besar, judul Display, dan kartu bergaya "tile".
 *
 * Perilaku (filter kategori, overlay kunci, hitung mundur, buka detail) SAMA dengan
 * `open-order/StepCatalog.tsx` — file aslinya tidak diubah. Teksnya dibuat netral promo
 * (tidak menyebut "Open Order") karena halaman ini halaman promo.
 */

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Lock } from "lucide-react";
import { cloudinaryUrl } from "@/lib/cloudinary";
import { openOrderProductImage } from "@/lib/open-order-catalog";
import { openOrderProductPrice, type OpenOrderProduct } from "@/lib/open-order-offering";
import type { OpenOrderPhase } from "@/components/open-order/Countdown";
import Countdown from "@/components/open-order/Countdown";
import { nextWibMidnight, nextWibMidnightLabel } from "@/lib/promo/free-cover-hanger";
import type { PromoFchSettings } from "@/lib/promo/free-cover-hanger-settings";

const ALL = "semua";

/** Format harga kartu: "Rp 299.000" (id-ID, tanpa desimal). */
const rupiah = (value: number) => "Rp " + Math.round(value).toLocaleString("id-ID");

export default function PromoStepCatalog({
  products,
  phase,
  countdownTarget,
  startInfo,
  endInfo,
  onRemind,
  cartCount,
  onOpen,
  onViewCart,
  promo,
  bonus,
}: {
  products: OpenOrderProduct[];
  /** Fase event: belum dibuka / sedang berjalan / sudah berakhir. */
  phase: OpenOrderPhase;
  /** Batas hitung mundur (epoch ms) — `null` kalau jadwalnya belum diatur. */
  countdownTarget: number | null;
  /** "21 Oktober 2026 · 10.00 WIB" — baris info saat event belum dibuka/berakhir. */
  startInfo?: string;
  /** Versi bulan singkat untuk layar sempit. */
  startInfoShort?: string;
  endInfo?: string;
  onRemind?: () => void;
  cartCount: number;
  onOpen: (product: OpenOrderProduct, color: string) => void;
  onViewCart: () => void;
  /** Judul, eyebrow, deskripsi katalog — dari pengaturan admin. */
  promo: Pick<PromoFchSettings, "eyebrow" | "title" | "description">;
  /** Bar sisa bonus dari pengaturan promo admin. `null`/kosong = tidak ditampilkan. */
  bonus?: { left: number; total: number; note: string } | null;
}) {
  const [category, setCategory] = useState<string>(ALL);

  /**
   * Target timer: tengah malam WIB berikutnya.
   *
   * `null` sebelum mount supaya SSR dan klien tidak berbeda jam (hydration aman). Setelah
   * mount dihitung dari jam perangkat, lalu **diperbarui otomatis** tiap kali tengah malam
   * lewat — jadi halaman yang dibiarkan terbuka semalaman tetap menghitung ulang.
   */
  const [midnight, setMidnight] = useState<{ target: number; label: string } | null>(null);

  useEffect(() => {
    const sync = () => {
      const now = Date.now();
      setMidnight({ target: nextWibMidnight(now), label: nextWibMidnightLabel(now) });
    };
    sync();
    const timer = setInterval(sync, 60_000);
    return () => clearInterval(timer);
  }, []);

  const categories = useMemo(() => {
    const list = [...new Set(products.map((product) => product.category).filter(Boolean))];
    return list.sort((a, b) => a.localeCompare(b));
  }, [products]);

  // Satu kartu per PRODUK (bukan per warna/varian). Pengelompokan sudah dilakukan
  // `buildOpenOrderProducts` dengan kunci yang sama seperti halaman Katalog.
  const shown = useMemo(
    () => (category === ALL ? products : products.filter((product) => product.category === category)),
    [products, category],
  );

  const locked = phase !== "live";
  const lockMessage =
    phase === "ended" ? "Program sudah selesai, tunggu batch berikutnya" : "Program belum dibuka";

  const quotaPct =
    bonus && bonus.total > 0 ? Math.max(0, Math.min(100, Math.round((bonus.left / bonus.total) * 100))) : 0;

  return (
    <div>
      {/* Hero katalog */}
      <section className="fch-order-wrap fch-hero-2">
        <p className="fch-eyebrow">{promo.eyebrow}</p>
        <h1 className="fch-disp fch-title-xl" style={{ fontWeight: 900 }}>
          {promo.title}
        </h1>
        <p className="fch-lead">{promo.description}</p>

        {/* Sisa bonus — angkanya dari pengaturan admin. */}
        {bonus ? (
          <>
            <div className="fch-quota-line">
              <span>
                <span
                  className="fch-live"
                  style={{ width: 8, height: 8, borderRadius: "50%", background: "#000000", display: "inline-block" }}
                />
                Sisa bonus
              </span>
              <span>
                <b>{bonus.left}</b>
                <em> dari {bonus.total}</em>
              </span>
            </div>
            <div className="fch-quota-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={quotaPct}>
              <i style={{ width: `${quotaPct}%` }} />
            </div>
            <p className="fch-lead" style={{ marginTop: 12, fontSize: 14 }}>
              {bonus.note}
            </p>
          </>
        ) : null}
      </section>

      {/* Timer — siklus 24 jam yang reset tiap tengah malam WIB. */}
      <section className="fch-order-wrap" style={{ paddingTop: 24, paddingBottom: 8 }}>
        <Countdown
          target={midnight?.target ?? null}
          phase="live"
          variant="card"
          endInfo={midnight?.label}
        />

        {/* Pesan status jendela — dulu teksnya generik "Open Order". */}
        {phase !== "live" ? (
          <p style={{ margin: "16px 0 0", fontSize: 14, fontWeight: 600 }}>
            {phase === "ended"
              ? `Program sudah selesai${endInfo ? ` ${endInfo}` : ""}. Follow untuk info batch berikutnya.`
              : `Program dibuka ${startInfo || "segera"}. Katalog tetap bisa dilihat.`}
          </p>
        ) : null}
        {onRemind && phase !== "live" ? (
          <button
            type="button"
            onClick={onRemind}
            className="fch-chip"
            style={{ marginTop: 12, height: 44 }}
          >
            {phase === "ended" ? "Kabari periode berikutnya" : "Ingatkan saya"}
          </button>
        ) : null}
      </section>

      <section className="fch-order-wrap fch-body">
        {/* Filter kategori */}
        {categories.length > 1 ? (
          <div className="fch-chips">
            <button
              type="button"
              className="fch-chip"
              data-active={category === ALL}
              onClick={() => setCategory(ALL)}
            >
              Semua
              <em>{products.length}</em>
            </button>
            {categories.map((name) => {
              const count = products.filter((product) => product.category === name).length;
              return (
                <button
                  key={name}
                  type="button"
                  className="fch-chip"
                  data-active={category === name}
                  onClick={() => setCategory(name)}
                >
                  {name}
                  <em>{count}</em>
                </button>
              );
            })}
          </div>
        ) : null}

        <p className="fch-count">
          <span>
            Menampilkan <b>{shown.length}</b>
            {category === ALL ? " produk promo" : ` produk ${category}`}
            {shown.length !== products.length ? ` dari ${products.length}` : ""}
          </span>
          {locked ? <span>{phase === "ended" ? "Program selesai" : "Belum dibuka"}</span> : null}
        </p>

        {/* Produk */}
        {shown.length > 0 ? (
          <div className="fch-grid">
            {shown.map((product) => {
              const label = product.kain ? `Kain ${product.kain}` : product.category;
              const seriesCount = product.series.length;
              const isSoldOut = product.totalStock === 0;
              // Foto kartu = media bertipe GAMBAR dari varian (product.image bisa .mp4).
              const mainImage = openOrderProductImage(
                product,
                product.variants.find((variant) => variant.stock > 0)?.color ?? product.colors[0] ?? "",
              );
              const initialColor =
                product.variants.find((variant) => variant.stock > 0)?.color ?? product.colors[0] ?? "";

              return (
                <button
                  key={product.id}
                  type="button"
                  className="fch-card"
                  data-locked={locked || isSoldOut}
                  disabled={locked || isSoldOut}
                  aria-label={`Lihat ${product.name}`}
                  onClick={() => onOpen(product, initialColor)}
                >
                  <div className="fch-card-media">
                    {mainImage ? (
                      <img
                        src={cloudinaryUrl(mainImage, { width: 700 })}
                        alt={product.name}
                        loading="lazy"
                        style={isSoldOut ? { filter: "grayscale(100%) opacity(.7)" } : undefined}
                        onError={(event) => {
                          (event.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : null}

                    {isSoldOut ? <span className="fch-card-flag">Sold out</span> : null}

                    {locked ? (
                      <div className="fch-card-lock">
                        <span title={lockMessage}>
                          <Lock size={13} strokeWidth={2.5} />
                          {phase === "ended" ? "Sudah ditutup" : "Segera dibuka"}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  <div className="fch-card-body">
                    <h3 className="fch-card-name">{product.name}</h3>
                    <p className="fch-card-sub">
                      {label}
                      {seriesCount > 1 ? ` · ${seriesCount} series` : ""}
                    </p>

                    <div className="fch-card-price">
                      <small>Mulai</small>
                      <strong>{rupiah(openOrderProductPrice(product))}</strong>
                    </div>

                    <span className="fch-card-cta">
                      {isSoldOut ? "Habis" : locked ? "Belum dibuka" : "Lihat Detail"}
                      {!isSoldOut && !locked ? <ChevronRight size={14} strokeWidth={2.2} /> : null}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="fch-empty">
            <b>Belum ada produk</b>
            <span>
              {category === ALL
                ? "Produk promo belum disiapkan. Coba cek lagi nanti."
                : `Belum ada produk untuk kategori ${category}.`}
            </span>
          </div>
        )}

        {cartCount > 0 ? (
          <div className="fch-cart-bar">
            <span>
              {cartCount} item di pesananmu
            </span>
            <button type="button" onClick={onViewCart}>
              Lihat Pesanan <ChevronRight size={16} strokeWidth={2.2} />
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
