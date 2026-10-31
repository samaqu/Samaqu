"use client";

/**
 * Detail produk admin — drawer yang meluncur dari kanan berisi kartu stok/harga/
 * statistik, pill status, tag, dan tombol "Tutup" di bawah. Warnanya mengikuti tema
 * admin lain (putih + netral: #fff / #f5f5f5 / #e8e8e8 / #1c1c1c) supaya seragam.
 *
 * Satu komponen `ProductDetailPanel` dipakai dua tempat:
 *  - `ProductDetailDrawer` (default export) = panel meluncur dari kanan di atas
 *    daftar produk — dipakai `ProductsCatalog` di kedua dashboard (/admin & /id/admin),
 *  - halaman route `/admin/produk/detail/<id>` merender panel yang sama
 *    (`mode="page"`) supaya tampilannya konsisten.
 *
 * Semua angka berasal dari data asli: stok & SKU dari `product_variants`, harga dari
 * `products`, penjualan dari `order_items`. Kolom yang tidak ada di skema
 * ("stok awal", "total masuk", "profit") tidak dikarang — barisnya diganti
 * angka nyata (total pesanan / varian menipis).
 */

import { useEffect, useRef, useState } from "react";
import { useBodyScrollLock } from "@/lib/use-scroll-lock";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Box, DollarSign, Edit, Image as ImageIcon, Layers, Package, Shirt, ShoppingCart, Tag, TrendingUp, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { requestRevalidate } from "@/lib/admin-revalidate";
import { useToast } from "@/components/AdminToast";
import { colorMap } from "@/lib/katalog-data";

const money = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");

interface ProductData {
  id: string;
  name: string;
  category: string;
  price: number;
  image: string;
  minimum_price?: number | null;
  create_your_price_enabled?: boolean;
  series?: string | null;
  kain?: string | null;
  /** Ikut tampil di katalog /open-order (kolom `products.open_order_enabled`, default true). */
  open_order_enabled?: boolean | null;
  /**
   * Ikut tampil di katalog promo Free Cover Hanger (kolom `products.promo_fch_enabled`).
   * Terpisah dari `open_order_enabled`.
   */
  promo_fch_enabled?: boolean | null;
  /** Tampil di katalog website (kolom `products.is_published`, default true). */
  is_published?: boolean | null;
}

interface Variant {
  product_id: string;
  color: string;
  size: string;
  stock: number;
  price_override: number | null;
  sku: string | null;
  series: string | null;
}

interface ProductImage {
  url: string;
  is_video: boolean;
  color: string;
  display_order: number;
}

interface OrderItem {
  order_id: string;
  product_name: string;
  color: string;
  size: string;
  quantity: number;
  price: number | null;
  customer_price: number | null;
  orders: {
    order_number: string;
    customer_name: string;
    status: string;
    created_at: string;
    total: number;
  } | null;
}

/** Harga efektif — sama dengan aturan lama: harga minimum bila Create Your Price aktif. */
function effectivePrice(p: ProductData): number {
  return p.create_your_price_enabled && p.minimum_price ? p.minimum_price : p.price;
}

function statusOf(stock: number) {
  if (stock <= 0) return { label: "Habis", cls: "pd-pill pd-pill-red" };
  if (stock <= 10) return { label: "Menipis", cls: "pd-pill pd-pill-amber" };
  return { label: "Tersedia", cls: "pd-pill pd-pill-green" };
}

export function ProductDetailPanel({
  productId,
  onClose,
  mode = "drawer",
  onPublishedChange,
}: {
  productId: string;
  onClose: () => void;
  mode?: "drawer" | "page";
  /** Dipanggil setelah status "tampil di website" benar-benar tersimpan, supaya
   *  daftar produk di dashboard ikut memperbarui badge "Dari Ops, belum tampil". */
  onPublishedChange?: (published: boolean, target: { name: string; category: string }) => void;
}) {
  const toast = useToast();
  const [product, setProduct] = useState<ProductData | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [savingOpenOrder, setSavingOpenOrder] = useState(false);
  const [savingPromoFch, setSavingPromoFch] = useState(false);
  const [savingPublish, setSavingPublish] = useState(false);
  const savingPublishRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    async function fetchData() {
      try {
        const [prodRes, varRes, imgRes, ordersRes] = await Promise.all([
          supabase.from("products").select("*").eq("id", productId).single(),
          supabase.from("product_variants").select("*").eq("product_id", productId).order("display_order"),
          supabase.from("product_images").select("*").eq("product_id", productId).order("display_order"),
          supabase
            .from("order_items")
            .select("*, orders(order_number, customer_name, status, created_at, total)")
            .eq("product_id", productId)
            .order("created_at", { referencedTable: "orders", ascending: false })
            .limit(20),
        ]);
        if (!mounted) return;
        if (prodRes.data) setProduct(prodRes.data as ProductData);
        if (varRes.data) {
          const rows = varRes.data as Variant[];
          setVariants(rows);
          // Thobe memakai color "default" + beberapa series → tab default ke series pertama.
          const colors = [...new Set(rows.map((v) => v.color))];
          const seriesList = [...new Set(rows.map((v) => v.series).filter(Boolean))] as string[];
          const isDefaultColor = colors.length === 1 && colors[0] === "default";
          if (isDefaultColor && seriesList.length > 0) setActiveTab(seriesList[0]);
          else if (seriesList.length > 1) setActiveTab(seriesList[0]);
          else setActiveTab(colors[0] ?? null);
        }
        if (imgRes.data) setImages(imgRes.data as ProductImage[]);
        if (ordersRes.data) setOrderItems(ordersRes.data as unknown as OrderItem[]);
      } catch (err) {
        console.error("Fetch detail produk error:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    fetchData();
    return () => {
      mounted = false;
    };
  }, [productId]);

  const uniqueColors = [...new Set(variants.map((v) => v.color))];
  const uniqueSeries = [...new Set(variants.map((v) => v.series).filter(Boolean))] as string[];
  const isDefaultColor = uniqueColors.length === 1 && uniqueColors[0] === "default";
  const showSeriesTabs = isDefaultColor && uniqueSeries.length > 1;
  const tabs = showSeriesTabs ? uniqueSeries : uniqueColors;

  const tabVariants = showSeriesTabs
    ? variants.filter((v) => v.series === activeTab)
    : variants.filter((v) => v.color === activeTab);
  const tabImages = showSeriesTabs
    ? images.filter((img) => img.color === "default" || !img.color)
    : images.filter((img) => img.color === activeTab);

  const totalStock = variants.reduce((sum, v) => sum + v.stock, 0);
  const totalSold = orderItems.reduce((sum, item) => sum + item.quantity, 0);
  const revenue = orderItems.reduce((sum, item) => sum + item.quantity * (item.customer_price ?? item.price ?? 0), 0);
  const totalOrders = new Set(orderItems.map((i) => i.order_id)).size;
  const lowStock = variants.filter((v) => v.stock > 0 && v.stock < 5).length;
  const status = statusOf(totalStock);

  const sku = tabVariants.map((v) => v.sku).find(Boolean) || variants.map((v) => v.sku).find(Boolean) || "—";
  const activeTag = showSeriesTabs ? activeTab : uniqueColors.length === 1 ? uniqueColors[0] : activeTab;
  const openOrderEnabled = product?.open_order_enabled !== false;
  const promoFchEnabled = product?.promo_fch_enabled !== false;
  const isPublished = product?.is_published !== false;

  /**
   * Sakelar Open Order dari panel detail — produk yang dimatikan hilang dari katalog
   * /open-order. Satu nama + kategori = satu produk di Open Order, jadi semua baris series-nya
   * ikut diubah (sama seperti sakelar di menu admin "Open Order").
   */
  async function toggleOpenOrder() {
    if (!product) return;
    const next = product.open_order_enabled === false;
    setSavingOpenOrder(true);
    const { error } = await supabase
      .from("products")
      .update({ open_order_enabled: next })
      .eq("category", product.category)
      .eq("name", product.name);
    setSavingOpenOrder(false);
    if (error) {
      console.error("[PD] Gagal mengubah status Open Order:", error);
      return;
    }
    setProduct((prev) => (prev ? { ...prev, open_order_enabled: next } : prev));
  }

  /**
   * Sakelar katalog PROMO "Free Cover Hanger" — kolom `products.promo_fch_enabled`.
   *
   * Jalur sendiri, terpisah dari Open Order: produk bisa tampil di promo tanpa ikut
   * /open-order, dan sebaliknya. Satu nama + kategori = satu produk, jadi semua baris
   * series-nya ikut diubah (sama seperti `toggleOpenOrder`).
   */
  async function togglePromoFch() {
    if (!product) return;
    const next = product.promo_fch_enabled === false;
    setSavingPromoFch(true);
    const { error } = await supabase
      .from("products")
      .update({ promo_fch_enabled: next })
      .eq("category", product.category)
      .eq("name", product.name);
    setSavingPromoFch(false);
    if (error) {
      console.error("[PD] Gagal mengubah status promo Free Cover Hanger:", error);
      return;
    }
    setProduct((prev) => (prev ? { ...prev, promo_fch_enabled: next } : prev));
  }

  /**
   * Sakelar "tampil di website" — mengubah `products.is_published` untuk SEMUA baris satu
   * nama + kategori (satu produk di katalog). Menyalakan hanya boleh kalau sudah ada foto
   * asli (bukan logo default) DAN harga > 0; kalau belum, tampilkan pesan yang jelas.
   *
   * Simpan langsung ke server pada klik PERTAMA (tanpa tombol "Simpan" terpisah) dan baru
   * ubah tampilan pill SETELAH server mengonfirmasi (read-back), supaya ikon tidak pernah
   * menyimpang dari data tersimpan. Kalau gagal, pill dibiarkan di status lama + pesan error.
   */
  async function togglePublish() {
    if (!product || savingPublishRef.current) return;
    const next = !isPublished;
    if (next) {
      const hasRealPhoto = !!product.image && !/(^|\/)logo\.svg$/i.test(product.image);
      if (!hasRealPhoto) {
        toast.showToast("error", "Lengkapi foto produk dulu (bukan logo bawaan) sebelum menampilkan di website.");
        return;
      }
      if (!(effectivePrice(product) > 0)) {
        toast.showToast("error", "Isi harga produk (lebih dari 0) dulu sebelum menampilkan di website.");
        return;
      }
      // Peringatan LUNAK (tidak memblokir): ukuran berstok yang beratnya belum diisi akan
      // memakai berat default saat menghitung ongkir J&T.
      try {
        const { data: rows } = await supabase
          .from("products")
          .select("id")
          .eq("category", product.category)
          .eq("name", product.name);
        const ids = (rows || []).map((r: { id: string }) => r.id);
        if (ids.length > 0) {
          const { data: vars } = await supabase
            .from("product_variants")
            .select("stock, weight")
            .in("product_id", ids);
          const missing = (vars || []).filter(
            (v: { stock: number | null; weight: number | null }) =>
              (Number(v.stock) || 0) > 0 && !(Number(v.weight) > 0)
          ).length;
          if (missing > 0) {
            toast.showToast("error", `${missing} ukuran belum punya berat, ongkir memakai berat default.`);
          }
        }
      } catch {
        /* peringatan lunak — jangan sampai menghalangi penerbitan */
      }
    }

    savingPublishRef.current = true;
    setSavingPublish(true);
    const target = { name: product.name, category: product.category };
    // `.select("id")` = read-back: pastikan baris benar-benar ter-update, bukan sekadar
    // "tidak error" (RLS bisa mengembalikan 0 baris tanpa error).
    const { data, error } = await supabase
      .from("products")
      .update({ is_published: next })
      .eq("category", product.category)
      .eq("name", product.name)
      .select("id");
    savingPublishRef.current = false;
    setSavingPublish(false);

    if (error || !data || data.length === 0) {
      console.error("[PD] Gagal mengubah status tampil:", error);
      toast.showToast("error", "Gagal mengubah status tampil — coba lagi.");
      return;
    }

    setProduct((prev) => (prev ? { ...prev, is_published: next } : prev));
    onPublishedChange?.(next, target);
    toast.showToast("success", next ? "Produk tampil di website" : "Produk disembunyikan");
    // Best-effort: segarkan halaman publik yang ter-cache (Home, katalog, detail produk).
    void requestRevalidate(product.id);
  }

  return (
    <div className={`pd-root pd-root--${mode}`}>
      {/* Header */}
      <header className="pd-head">
        <div className="pd-head-top">
          <div className="min-w-0">
            <div className="pd-title-row">
              <h2 className="pd-title">{product?.name || "Memuat…"}</h2>
              <span className={status.cls}>{status.label}</span>
            </div>
            <p className="pd-sku">SKU: {sku}</p>
          </div>
          <button onClick={onClose} className="pd-x" aria-label="Tutup">
            <X size={18} strokeWidth={2} />
          </button>
        </div>
        {product && (
          <div className="pd-tags">
            <span className="pd-tag">{product.category}</span>
            {activeTag && activeTag !== "default" && <span className="pd-tag">Uk. {activeTag}</span>}
            {product.kain && <span className="pd-tag">{product.kain}</span>}
          </div>
        )}
      </header>

      {/* Body */}
      <div className="pd-body drawer-scroll">
        {loading ? (
          <div className="pd-loading">
            <span className="pd-spinner" /> Memuat detail produk…
          </div>
        ) : !product ? (
          <div className="pd-loading">Produk tidak ditemukan.</div>
        ) : (
          <>
            {/* Ringkasan stok */}
            <div className="pd-grid2">
              <div className="pd-card pd-stat">
                <Package size={16} strokeWidth={2} className="pd-ico" />
                <p className="pd-stat-label">Total Stok</p>
                <p className="pd-stat-value">{totalStock} <span className="pd-unit">unit</span></p>
              </div>
              <div className="pd-card pd-stat">
                <Box size={16} strokeWidth={2} className="pd-ico" />
                <p className="pd-stat-label">Terjual</p>
                <p className="pd-stat-value">{totalSold} <span className="pd-unit">unit</span></p>
              </div>
            </div>

            {/* Harga jual */}
            <div className="pd-card pd-price-card">
              <div className="pd-price-ico"><DollarSign size={17} strokeWidth={2.2} /></div>
              <p className="pd-label">Harga Jual</p>
              <p className="pd-price">{money(effectivePrice(product))}</p>
              <p className="pd-price-sub">Per unit</p>
            </div>

            {/* Open Order */}
            <div className="pd-card pd-stats">
              <p className="pd-section-title">
                <Shirt size={14} strokeWidth={2.2} /> Open Order
              </p>
              <div className="pd-row">
                <span>Tampil di halaman /open-order</span>
                <button
                  type="button"
                  onClick={toggleOpenOrder}
                  disabled={savingOpenOrder}
                  aria-pressed={openOrderEnabled}
                  aria-label="Tampilkan produk ini di menu Open Order"
                  className={`pd-oo${openOrderEnabled ? " is-on" : ""}`}
                >
                  {savingOpenOrder ? "…" : openOrderEnabled ? "Tampil" : "Tersembunyi"}
                </button>
              </div>
              <p className="pd-empty">
                {openOrderEnabled
                  ? "Produk ini muncul di katalog Open Order."
                  : "Produk ini disembunyikan dari katalog Open Order."}
              </p>
            </div>

            {/* Promo Free Cover Hanger — sakelar TERPISAH dari Open Order */}
            <div className="pd-card pd-stats">
              <p className="pd-section-title">
                <Tag size={14} strokeWidth={2.2} /> Promo Free Cover Hanger
              </p>
              <div className="pd-row">
                <span>Tampil di katalog promo</span>
                <button
                  type="button"
                  onClick={togglePromoFch}
                  disabled={savingPromoFch}
                  aria-pressed={promoFchEnabled}
                  aria-label="Tampilkan produk ini di katalog promo Free Cover Hanger"
                  className={`pd-oo${promoFchEnabled ? " is-on" : ""}`}
                >
                  {savingPromoFch ? "…" : promoFchEnabled ? "Tampil" : "Tersembunyi"}
                </button>
              </div>
              <p className="pd-empty">
                {promoFchEnabled
                  ? "Produk ini bisa dipilih di halaman pesan promo."
                  : "Produk ini disembunyikan dari katalog promo."}
              </p>
            </div>

            {/* Tampil di website */}
            <div className="pd-card pd-stats">
              <p className="pd-section-title">
                <ImageIcon size={14} strokeWidth={2.2} /> Tampilkan di website
              </p>
              <div className="pd-row">
                <span>Muncul di katalog website</span>
                <button
                  type="button"
                  onClick={togglePublish}
                  disabled={savingPublish}
                  aria-pressed={isPublished}
                  aria-label="Tampilkan produk ini di katalog website"
                  className={`pd-oo${isPublished ? " is-on" : ""}`}
                >
                  {savingPublish ? (
                    <span className="pd-oo-loading">
                      <span className="pd-oo-spin" aria-hidden="true" />
                      Menyimpan…
                    </span>
                  ) : isPublished ? (
                    "Tampil"
                  ) : (
                    "Belum tampil"
                  )}
                </button>
              </div>
              <p className="pd-empty">
                {isPublished
                  ? "Produk ini tampil di katalog website."
                  : "Produk ini belum tampil di katalog website — lengkapi foto & harga, lalu tampilkan."}
              </p>
            </div>

            {/* Statistik penjualan */}
            <div className="pd-card pd-stats">
              <p className="pd-section-title">
                <TrendingUp size={14} strokeWidth={2.2} /> Statistik Penjualan
              </p>
              <div className="pd-row"><span>Total Terjual</span><strong>{totalSold} unit</strong></div>
              <div className="pd-row"><span>Total Revenue</span><strong className="pd-blue">{money(revenue)}</strong></div>
              <div className="pd-row"><span>Total Pesanan</span><strong className="pd-blue">{totalOrders}x</strong></div>
              <div className="pd-row"><span>Total Transaksi</span><strong>{orderItems.length}x</strong></div>
            </div>

            {/* Statistik stok */}
            <div className="pd-card pd-stats">
              <p className="pd-section-title">
                <Layers size={14} strokeWidth={2.2} /> Statistik Stok
              </p>
              <div className="pd-row"><span>Total Varian</span><strong>{variants.length} varian</strong></div>
              <div className="pd-row"><span>Sisa Stok</span><strong className="pd-blue">{totalStock} unit</strong></div>
              <div className="pd-row"><span>Varian Menipis</span><strong className={lowStock > 0 ? "pd-amber" : ""}>{lowStock} varian</strong></div>
            </div>

            {/* Varian & stok */}
            <div className="pd-card pd-block">
              <p className="pd-section-title">
                <Layers size={14} strokeWidth={2.2} /> {showSeriesTabs ? "Varian Series" : "Varian & Stok"}
              </p>
              {tabs.length > 0 && (
                <div className="pd-tabs">
                  {tabs.map((t) => (
                    <button
                      key={t}
                      onClick={() => setActiveTab(t)}
                      className={`pd-tab${activeTab === t ? " is-on" : ""}`}
                    >
                      {!showSeriesTabs && t !== "default" && (
                        <span className="pd-dot" style={{ background: colorMap[t] || "#7b8394" }} />
                      )}
                      {t === "default" ? "Semua" : t}
                    </button>
                  ))}
                </div>
              )}
              <div className="pd-list">
                {tabVariants.map((v, i) => (
                  <div key={i} className="pd-list-row">
                    <div className="min-w-0">
                      <p className="pd-item-main">
                        {/* Produk satu warna menyimpan `color` = "default" di database —
                            jangan ditampilkan sebagai nama warna (baris jadi "default · XS"). */}
                        {showSeriesTabs || v.color === "default" ? v.size : `${v.color} · ${v.size}`}
                      </p>
                      <p className="pd-item-sub">{v.sku || "Tanpa SKU"}{v.price_override ? ` · ${money(v.price_override)}` : ""}</p>
                    </div>
                    <div className="pd-item-right">
                      <span className="pd-item-qty">{v.stock} unit</span>
                      <span className={v.stock === 0 ? "pd-mini pd-mini-red" : v.stock < 5 ? "pd-mini pd-mini-amber" : "pd-mini pd-mini-green"}>
                        {v.stock === 0 ? "Habis" : v.stock < 5 ? "Menipis" : "Tersedia"}
                      </span>
                    </div>
                  </div>
                ))}
                {tabVariants.length === 0 && <p className="pd-empty">Tidak ada varian untuk pilihan ini.</p>}
              </div>
            </div>

            {/* Media */}
            <div className="pd-card pd-block">
              <p className="pd-section-title">
                <ImageIcon size={14} strokeWidth={2.2} /> Media ({activeTag === "default" ? "Semua" : activeTag || "—"})
              </p>
              {tabImages.length === 0 ? (
                <p className="pd-empty">Tidak ada media untuk pilihan ini.</p>
              ) : (
                <div className="pd-media">
                  {tabImages.map((img, i) => (
                    <div key={i} className="pd-media-item">
                      {img.is_video ? (
                        <video
                          src={img.url}
                          muted
                          loop
                          playsInline
                          onMouseEnter={(e) => (e.target as HTMLVideoElement).play()}
                          onMouseLeave={(e) => {
                            (e.target as HTMLVideoElement).pause();
                            (e.target as HTMLVideoElement).currentTime = 0;
                          }}
                        />
                      ) : (
                        <img src={img.url} alt="" loading="lazy" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Riwayat pesanan */}
            <div className="pd-card pd-block">
              <p className="pd-section-title">
                <ShoppingCart size={14} strokeWidth={2.2} /> Riwayat Pesanan
              </p>
              {orderItems.length === 0 ? (
                <p className="pd-empty">Belum ada pesanan untuk produk ini.</p>
              ) : (
                <div className="pd-list">
                  {orderItems.map((item, i) => (
                    <div key={i} className="pd-list-row">
                      <div className="min-w-0">
                        <p className="pd-item-main">{item.orders?.order_number || "-"}</p>
                        <p className="pd-item-sub">
                          {item.orders?.customer_name || "-"} · {item.color === "default" ? "" : `${item.color} · `}
                          {item.size}
                        </p>
                      </div>
                      <div className="pd-item-right">
                        <span className="pd-item-qty">
                          {item.quantity} × {money(item.customer_price ?? item.price ?? 0)}
                        </span>
                        <span className="pd-mini pd-mini-muted">{item.orders?.status || "-"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <footer className="pd-foot">
        {product && (
          <Link href={`/admin/produk/edit/${product.id}`} className="pd-edit">
            <Edit size={15} strokeWidth={2} /> Edit
          </Link>
        )}
        <button onClick={onClose} className="pd-close">Tutup</button>
      </footer>

      {/* Gaya panel ditulis sebagai <style> biasa (pola sama dengan RINCIAN_CSS/OD_CSS/
          STRUK_CSS): `style jsx global` dengan isi variabel tidak punya id statis
          ("jsx-undefined"), jadi registry styled-jsx menganggapnya duplikat tema admin
          dan membuang CSS ini — panel detail jadi tampil tanpa gaya. */}
      <style>{PD_CSS}</style>
    </div>
  );
}

export default function ProductDetailDrawer({
  productId,
  onClose,
  onPublishedChange,
}: {
  productId: string | null;
  onClose: () => void;
  onPublishedChange?: (published: boolean, target: { name: string; category: string }) => void;
}) {
  useEffect(() => {
    if (!productId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [productId, onClose]);

  // Halaman di belakang panel ikut dikunci selama drawer terbuka (satu scrollbar saja).
  useBodyScrollLock(!!productId);

  return (
    <AnimatePresence>
      {productId && (
        <motion.div
          key="product-detail-drawer"
          className="pd-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            className="pd-panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <ProductDetailPanel productId={productId} onClose={onClose} onPublishedChange={onPublishedChange} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const PD_CSS = `
  /* Palet sama dengan tema admin lain: latar/kartu putih, garis netral, teks #1c1c1c */
  .pd-overlay {
    position: fixed; inset: 0; z-index: 60;
    display: flex; justify-content: flex-end;
    background: rgba(15,15,15,.4);
  }
  .pd-panel {
    width: 460px; max-width: 100%; height: 100%;
    display: flex;
    box-shadow: -24px 0 60px -24px rgba(0,0,0,.25);
  }
  .pd-root {
    --pd-bg: #ffffff; --pd-card: #ffffff; --pd-sub: #f5f5f5; --pd-bd: #e8e8e8;
    --pd-fg: #1c1c1c; --pd-fg2: #5f5f5d; --pd-muted: #9a9a98;
    --pd-green: #16a34a; --pd-blue: #2563eb; --pd-amber: #b45309;
    display: flex; flex-direction: column; flex: 1; min-width: 0;
    background: var(--pd-bg); color: var(--pd-fg);
  }
  .pd-root--drawer { height: 100%; }
  .pd-root--page {
    border-radius: 16px; overflow: hidden;
    max-width: 560px; margin: 0 auto;
    border: 1px solid var(--pd-bd);
    box-shadow: 0 1px 2px rgba(0,0,0,.04);
  }
  .pd-root--page .pd-body { overflow: visible; }

  .pd-head { padding: 20px 22px 16px; border-bottom: 1px solid var(--pd-bd); }
  .pd-head-top { display: flex; align-items: flex-start; gap: 12px; }
  .pd-title-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .pd-title { font-size: 1.05rem; font-weight: 800; line-height: 1.25; margin: 0; color: var(--pd-fg); }
  .pd-sku { margin: 6px 0 0; font-size: .74rem; font-weight: 600; color: var(--pd-muted); }
  .pd-x {
    margin-left: auto; flex-shrink: 0; padding: 6px; border-radius: 8px;
    background: transparent; border: 1px solid transparent; color: var(--pd-muted);
  }
  .pd-x:hover { background: var(--pd-sub); color: var(--pd-fg); }

  .pd-pill {
    /* pill status — versi terang dari palet admin */
    font-size: .65rem; font-weight: 800; padding: .2rem .55rem;
    border-radius: 999px; white-space: nowrap;
  }
  .pd-pill-amber { background: rgba(245,158,11,.14); color: var(--pd-amber); }
  .pd-pill-green { background: rgba(34,197,94,.14); color: var(--pd-green); }
  .pd-pill-red { background: rgba(239,68,68,.12); color: #dc2626; }

  .pd-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
  .pd-tag {
    font-size: .65rem; font-weight: 700; padding: .22rem .55rem; border-radius: 6px;
    background: var(--pd-sub); border: 1px solid var(--pd-bd); color: var(--pd-fg2);
  }

  .pd-body {
    flex: 1; overflow-y: auto; padding: 18px 22px 22px;
    display: flex; flex-direction: column; gap: 14px;
  }
  .pd-root--drawer .pd-body { min-height: 0; }
  .pd-loading {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    padding: 40px 0; font-size: .8rem; font-weight: 700; color: var(--pd-muted);
  }
  .pd-spinner {
    width: 14px; height: 14px; border-radius: 999px;
    border: 2px solid rgba(0,0,0,.12); border-top-color: var(--pd-green);
    animation: pd-spin .7s linear infinite;
  }
  @keyframes pd-spin { to { transform: rotate(360deg); } }

  .pd-card { background: var(--pd-card); border: 1px solid var(--pd-bd); border-radius: 12px; }
  .pd-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .pd-stat { padding: 14px; }
  .pd-ico { color: var(--pd-muted); }
  .pd-stat-label {
    margin: 8px 0 0; font-size: .62rem; font-weight: 800;
    letter-spacing: .06em; text-transform: uppercase; color: var(--pd-muted);
  }
  .pd-stat-value { margin: 4px 0 0; font-size: 1.35rem; font-weight: 800; color: var(--pd-fg); }
  .pd-unit { font-size: .75rem; font-weight: 700; color: var(--pd-muted); }

  .pd-price-card { padding: 16px 14px; }
  .pd-price-ico {
    width: 30px; height: 30px; border-radius: 999px;
    display: flex; align-items: center; justify-content: center;
    background: rgba(34,197,94,.12); color: var(--pd-green);
  }
  .pd-label {
    margin: 10px 0 0; font-size: .62rem; font-weight: 800;
    letter-spacing: .06em; text-transform: uppercase; color: var(--pd-muted);
  }
  .pd-price { margin: 4px 0 0; font-size: 1.6rem; font-weight: 800; color: var(--pd-green); }
  .pd-price-sub { margin: 2px 0 0; font-size: .7rem; font-weight: 600; color: var(--pd-muted); }

  .pd-stats { padding: 14px; }
  .pd-section-title {
    display: flex; align-items: center; gap: 7px; margin: 0 0 10px;
    font-size: .7rem; font-weight: 800; letter-spacing: .04em;
    text-transform: uppercase; color: var(--pd-fg);
  }
  .pd-section-title svg { color: var(--pd-muted); }
  .pd-row {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 7px 0; font-size: .78rem; font-weight: 600; color: var(--pd-fg2);
    border-top: 1px solid var(--pd-bd);
  }
  .pd-row:first-of-type { border-top: 0; }
  .pd-row strong { color: var(--pd-fg); font-weight: 800; }
  .pd-blue { color: var(--pd-blue) !important; }
  .pd-amber { color: var(--pd-amber) !important; }

  .pd-block { padding: 14px; }
  .pd-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
  .pd-tab {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: .68rem; font-weight: 700; padding: .3rem .6rem; border-radius: 999px;
    background: transparent; border: 1px solid var(--pd-bd); color: var(--pd-muted);
  }
  .pd-tab.is-on { background: var(--pd-fg); border-color: var(--pd-fg); color: #ffffff; }
  .pd-dot { width: 8px; height: 8px; border-radius: 999px; flex-shrink: 0; }

  .pd-list { display: flex; flex-direction: column; }
  .pd-list-row {
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    padding: 9px 0; border-top: 1px solid var(--pd-bd);
  }
  .pd-list-row:first-child { border-top: 0; }
  .pd-item-main { margin: 0; font-size: .8rem; font-weight: 700; color: var(--pd-fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pd-item-sub { margin: 2px 0 0; font-size: .68rem; font-weight: 600; color: var(--pd-fg2); }
  .pd-item-right { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; flex-shrink: 0; }
  .pd-item-qty { font-size: .72rem; font-weight: 800; color: var(--pd-fg); white-space: nowrap; }
  .pd-mini { font-size: .6rem; font-weight: 800; padding: .12rem .4rem; border-radius: 999px; white-space: nowrap; }
  .pd-mini-green { background: rgba(34,197,94,.15); color: var(--pd-green); }
  .pd-mini-amber { background: rgba(245,158,11,.16); color: var(--pd-amber); }
  .pd-mini-red { background: rgba(239,68,68,.12); color: #dc2626; }
  .pd-mini-muted { background: var(--pd-sub); color: var(--pd-fg2); }
  .pd-empty { margin: 0; font-size: .74rem; font-weight: 600; color: var(--pd-fg2); }

  .pd-media { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .pd-media-item { aspect-ratio: 1 / 1; border-radius: 9px; overflow: hidden; background: var(--pd-sub); border: 1px solid var(--pd-bd); }
  .pd-media-item img, .pd-media-item video { width: 100%; height: 100%; object-fit: cover; display: block; }

  .pd-foot {
    display: flex; align-items: center; gap: 10px;
    padding: 14px 22px; border-top: 1px solid var(--pd-bd);
  }
  .pd-edit {
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    padding: 11px 16px; border-radius: 12px; font-size: .8rem; font-weight: 800;
    background: transparent; border: 1px solid var(--pd-bd); color: var(--pd-fg); text-decoration: none;
  }
  .pd-edit:hover { background: var(--pd-sub); }
  .pd-close {
    flex: 1; padding: 12px 16px; border-radius: 12px; border: 0;
    background: var(--pd-fg); color: #ffffff; font-size: .84rem; font-weight: 800;
  }
  .pd-close:hover { background: #0f0f0f; }

  /* Sakelar Open Order di kartu detail produk */
  .pd-oo {
    font-size: .66rem; font-weight: 800; padding: .32rem .68rem; border-radius: 999px;
    border: 1px solid var(--pd-bd); background: var(--pd-sub); color: var(--pd-fg2);
    cursor: pointer; white-space: nowrap;
  }
  .pd-oo.is-on { background: rgba(34,197,94,.14); border-color: rgba(34,197,94,.32); color: var(--pd-green); }
  .pd-oo:hover { filter: brightness(.97); }
  .pd-oo:disabled { opacity: .6; cursor: default; }
  .pd-oo-loading { display: inline-flex; align-items: center; gap: 5px; }
  .pd-oo-spin {
    width: 9px; height: 9px; border-radius: 999px; flex-shrink: 0;
    border: 2px solid currentColor; border-top-color: transparent;
    animation: pd-spin .7s linear infinite;
  }
`;
