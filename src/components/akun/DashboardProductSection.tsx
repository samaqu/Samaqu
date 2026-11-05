"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getCatalogProducts } from "@/lib/db";
import { cloudinaryUrl } from "@/lib/cloudinary";
import { supabase } from "@/lib/supabase";
import { useSafeLocale } from "@/lib/safe-i18n";
import { useWishlist } from "@/lib/use-wishlist";
import { catalogPrice, groupCatalogProducts, type CatalogProduct } from "@/lib/catalog-group";
import type { Product } from "@/lib/katalog-data";

// Ambang "stok terbatas" — 5 atau kurang, SAMA dengan halaman katalog & detail produk.
// Customer hanya melihat label, tidak pernah angka stoknya.
const LOW_STOCK = 5;
const BADGE_LABEL: Record<string, string> = {
  terlaris: "Terlaris",
  rekomendasi: "Rekomendasi",
  new: "New",
};

function ProductCard({
  product,
  stock,
  wishlist,
  locale,
}: {
  product: CatalogProduct;
  stock: number | null;
  wishlist: ReturnType<typeof useWishlist>;
  locale: string;
}) {
  const soldOut = stock === 0;
  const lowStock = stock !== null && stock > 0 && stock <= LOW_STOCK;
  const image = product.media?.find((media) => media.type === "image")?.src || product.image;
  const badge = product.badge_type ? BADGE_LABEL[product.badge_type] : "";
  const href = `/${locale}/katalog/${product.id}`;

  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-2xl border border-[#E7E3DE] bg-white shadow-[0_2px_10px_rgba(0,0,0,.035)] transition hover:shadow-[0_8px_22px_rgba(0,0,0,.08)] active:scale-[.99]"
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-[#F1EFEC]">
        <img
          src={cloudinaryUrl(image, { width: 500 })}
          alt={product.name}
          loading="lazy"
          decoding="async"
          className={`h-full w-full object-cover transition duration-500 group-hover:scale-[1.03] ${soldOut ? "grayscale-[35%] brightness-90" : ""}`}
          onError={(event) => {
            (event.target as HTMLImageElement).style.display = "none";
          }}
        />

        {wishlist.isLoggedIn ? (
          <button
            type="button"
            aria-label={wishlist.isWishlisted(product.id) ? "Hapus dari wishlist" : "Tambah ke wishlist"}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              wishlist.toggle(product.id);
            }}
            className="absolute left-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-full border border-white/60 bg-white/90 shadow-sm backdrop-blur transition hover:scale-105"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill={wishlist.isWishlisted(product.id) ? "#e74c3c" : "none"}
              stroke={wishlist.isWishlisted(product.id) ? "#e74c3c" : "#000000"}
              strokeWidth="1.8"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>
        ) : null}

        {soldOut ? (
          <span className="absolute right-2.5 top-2.5 rounded-full bg-black px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-[0.1em] text-white">
            Habis
          </span>
        ) : badge ? (
          <span className="absolute right-2.5 top-2.5 rounded-full border border-black/10 bg-white/95 px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-[0.08em] text-black">
            {badge}
          </span>
        ) : null}

        {lowStock ? (
          <span className="absolute bottom-2.5 left-2.5 rounded-full bg-amber-50/95 px-2 py-1 text-[10px] font-bold text-amber-700">
            Stok terbatas
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-3">
        <p className="line-clamp-2 text-[12.5px] font-bold leading-snug text-black">{product.name}</p>
        <p className="mt-0.5 line-clamp-1 text-[10.5px] text-[#8b9793]">
          {product.jenis_kain?.name ? `Kain ${product.jenis_kain.name}` : product.kain ? `Kain ${product.kain}` : product.category}
        </p>
        <p className="mt-auto pt-1.5 text-[13px] font-extrabold text-black">
          Rp {catalogPrice(product).toLocaleString("id-ID")}
        </p>
      </div>
    </Link>
  );
}

/**
 * Section katalog di dashboard customer. Sumbernya sama dengan /katalog:
 * `getCatalogProducts()` (hanya produk is_published) + grouping per produk utama.
 */
export default function DashboardProductSection() {
  const locale = useSafeLocale();
  const wishlist = useWishlist();
  const [products, setProducts] = useState<Product[]>([]);
  const [stockByProduct, setStockByProduct] = useState<Record<string, number>>({});
  // Query stok GAGAL ≠ semua produk habis. Tanpa ini setiap kartu tampil "Sold Out".
  const [stockError, setStockError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const data = await getCatalogProducts();
        if (!alive) return;
        setProducts(data);

        if (data.length > 0) {
          // VIEW `product_variant_stock`: pakai `effective_stock` (mencakup stok sharing &
          // stok komponen) dan lewati varian yang tidak boleh dijual.
          const { data: rows, error: stockErr } = await supabase
            .from("product_variant_stock")
            .select("product_id, effective_stock, is_sellable")
            .in("product_id", data.map((product) => product.id));
          if (!alive) return;
          // Query gagal JANGAN membuat semua produk tampak "Sold Out".
          if (stockErr) {
            console.error("[dashboard-produk] gagal memuat stok varian:", stockErr.message, stockErr.details ?? "");
            setStockError(true);
            return;
          }
          setStockError(false);
          const map: Record<string, number> = {};
          (rows || []).forEach((row: { product_id: string; effective_stock: number | null; is_sellable: boolean | null }) => {
            if (row.is_sellable === false) return;
            map[row.product_id] = (map[row.product_id] || 0) + (Number(row.effective_stock) || 0);
          });
          setStockByProduct(map);
        }
      } catch (error) {
        console.error("[dashboard-produk] gagal memuat katalog:", error);
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => { alive = false; };
  }, []);

  const { items, memberIdsByRep } = useMemo(() => groupCatalogProducts(products), [products]);
  const visibleProducts = items.slice(0, 4);

  const groupStock = useMemo(() => {
    const map: Record<string, number> = {};
    for (const product of items) {
      const memberIds = memberIdsByRep[product.id] || [product.id];
      const hasStockData = memberIds.some((id) => id in stockByProduct);
      map[product.id] = hasStockData
        ? memberIds.reduce((sum, id) => sum + (stockByProduct[id] || 0), 0)
        : -1;
    }
    return map;
  }, [items, memberIdsByRep, stockByProduct]);

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-extrabold text-black">Produk SAMAQU</h2>
          <p className="mt-0.5 text-[11.5px] text-[#8b9793]">Temukan produk favoritmu</p>
        </div>
        <Link
          href={`/${locale}/katalog`}
          className="shrink-0 rounded-full border border-black px-3 py-1.5 text-[10.5px] font-bold text-black transition hover:bg-black hover:text-white"
        >
          Lihat Semua Produk
        </Link>
      </div>

      {stockError && (
        <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11.5px] font-semibold text-amber-900">
          Stok belum termuat. Muat ulang halaman — jangan mengira produk habis.
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-[#E7E3DE] bg-white">
              <div className="aspect-[3/4] animate-pulse bg-[#EFECE8]" />
              <div className="space-y-2 p-3">
                <div className="h-3 w-4/5 animate-pulse rounded bg-[#EFECE8]" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-[#EFECE8]" />
              </div>
            </div>
          ))}
        </div>
      ) : visibleProducts.length === 0 ? (
        <div className="rounded-2xl border border-[#E7E3DE] bg-white p-6 text-center">
          <p className="text-sm font-bold text-black">Belum ada produk yang tampil</p>
          <p className="mt-1 text-xs text-[#8b9793]">Katalog sedang diperbarui. Coba lagi nanti.</p>
          <Link
            href={`/${locale}/katalog`}
            className="mt-4 inline-flex rounded-full border border-black px-4 py-2 text-xs font-bold text-black transition hover:bg-black hover:text-white"
          >
            Buka katalog
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          {visibleProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              stock={groupStock[product.id] === -1 ? null : groupStock[product.id]}
              wishlist={wishlist}
              locale={locale}
            />
          ))}
        </div>
      )}
    </section>
  );
}
