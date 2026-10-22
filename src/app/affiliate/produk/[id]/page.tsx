"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/affiliate/icons";
import { Badge, useModal, useToast } from "@/components/affiliate/ui";
import LinkFormModal from "@/components/affiliate/LinkFormModal";
import { affiliateFetch } from "@/lib/affiliate/client";
import { money } from "@/lib/affiliate/format";

/**
 * Detail produk untuk portal affiliate — mengikuti mockup.
 */

interface AffiliateProduct {
  id: string;
  name: string;
  category: string;
  series: string | null;
  kain: string | null;
  price: number;
  description: string | null;
  image: string;
  media: { src: string; type: "image" | "video" }[];
  stock: number;
  sizes: string[];
  colors: string[];
  rate: number;
  estimatedCommission: number;
  promoted: boolean;
  createYourPrice: boolean;
  minimumPrice: number | null;
}

function stockLabel(stock: number) {
  if (stock === 0) return "Habis";
  if (stock < 15) return "Stok Terbatas";
  return "Tersedia";
}

export default function AffiliateProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [products, setProducts] = useState<AffiliateProduct[]>([]);
  const [activeId, setActiveId] = useState("");
  const [active, setActive] = useState(0);
  const [variant, setVariant] = useState("");
  const [loading, setLoading] = useState(true);
  const { open } = useModal();
  const { toast } = useToast();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const json = await affiliateFetch<{ products: AffiliateProduct[] }>("/api/affiliate/products");
        if (!alive) return;
        setProducts(json.products || []);
        const id = (await params).id;
        setActiveId(id);
      } catch (e) {
        console.error("[AFFILIATE] Gagal memuat detail produk:", e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [params]);

  const product = useMemo(
    () => products.find((p) => p.id === activeId) || null,
    [products, activeId],
  );

  // Semua baris dengan kategori + nama sama = satu produk utama; tiap baris
  // membawa series sendiri (sama seperti katalog toko).
  const group = useMemo(
    () =>
      product
        ? products.filter((p) => p.category === product.category && p.name === product.name)
        : [],
    [products, product],
  );

  const seriesOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of group) {
      if (row.series && !map.has(row.series)) map.set(row.series, row.id);
    }
    return Array.from(map.entries());
  }, [group]);

  const gallery = useMemo(() => {
    if (!product) return [];
    const media = product.media.filter((m) => m.type === "image");
    const list = media.length ? media : product.image ? [{ src: product.image, type: "image" as const }] : [];
    return list.slice(0, 4);
  }, [product]);

  if (loading) {
    return <div className="card p-10 text-center muted">Memuat detail produk…</div>;
  }

  if (!product) {
    return (
      <div className="card">
        <div className="empty">
          <div className="ei">
            <Icon name="bag" className="lg" />
          </div>
          <div className="b dark">Produk tidak ditemukan</div>
          <div className="small" style={{ marginTop: 4 }}>
            Produk mungkin sudah tidak tersedia.
          </div>
          <div className="mt">
            <Link href="/affiliate/produk" className="btn p">
              Kembali ke Katalog
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const main = gallery[active];

  return (
    <div>
      <Link href="/affiliate/produk" className="btn s sm" style={{ marginBottom: 14 }}>
        <Icon name="back" className="sm" />
        Kembali ke Katalog
      </Link>

      <div className="card cp">
        <div className="grid g2" style={{ gap: 40, alignItems: "start" }}>
          <div className="prod-media">
            <div
              style={{
                aspectRatio: "3 / 4",
                borderRadius: 24,
                overflow: "hidden",
                background: "#e5e5e5",
              }}
            >
              {main ? (
                <img src={main.src} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : null}
            </div>
            {gallery.length > 1 && (
              <div className="row mt">
                {gallery.map((g, i) => (
                  <button
                    key={g.src + i}
                    type="button"
                    onClick={() => setActive(i)}
                    style={{
                      border: `2px solid ${active === i ? "#111827" : "transparent"}`,
                      borderRadius: 12,
                      padding: 0,
                      cursor: "pointer",
                      overflow: "hidden",
                      width: 68,
                      height: 68,
                    }}
                  >
                    <img src={g.src} alt={`Foto ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <span className="small muted">
              {product.category}
              {product.kain ? ` · Kain ${product.kain}` : ""}
              {product.series ? ` · ${product.series}` : ""}
            </span>

            <h2
              style={{
                fontFamily: "var(--font-cormorant), Georgia, serif",
                fontSize: 30,
                fontWeight: 600,
                lineHeight: 1.15,
                color: "#000",
                marginTop: 8,
              }}
            >
              {product.name}
            </h2>
            <div style={{ fontSize: 20, fontWeight: 600, color: "#000", marginTop: 8 }}>
              {money(product.price)}
            </div>

            {product.description ? (
              <p className="muted" style={{ lineHeight: 1.7, marginTop: 12 }}>
                {product.description}
              </p>
            ) : null}

            {seriesOptions.length > 1 && (
              <div className="mt">
                <div className="fl">Pilihan Series</div>
                <div className="row wrap">
                  {seriesOptions.map(([series, memberId]) => (
                    <button
                      key={series}
                      className={`chip ${product.series === series ? "on" : ""}`}
                      onClick={() => {
                        setActiveId(memberId);
                        setActive(0);
                        setVariant("");
                      }}
                      type="button"
                    >
                      {series}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {product.sizes.length > 0 && (
              <div className="mt">
                <div className="fl">Pilihan Variasi</div>
                <div className="row wrap">
                  {product.sizes.map((s) => (
                    <button
                      key={s}
                      className={`chip ${variant === s ? "on" : ""}`}
                      onClick={() => setVariant(s)}
                      type="button"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="box mt">
              <div className="row between">
                <span className="b dark">Perhitungan komisi 1 penjualan</span>
                <Badge label={stockLabel(product.stock)} />
              </div>
              <div className="kv mt">
                <dt>Harga produk</dt>
                <dd>{money(product.price)}</dd>
                <dt>Persentase komisi</dt>
                <dd>{product.rate}%</dd>
                <dt>Estimasi komisi</dt>
                <dd style={{ color: "var(--af-pri)" }}>{money(product.estimatedCommission)}</dd>
                <dt>Ketersediaan</dt>
                <dd>{product.stock ? `${product.stock} unit` : "Stok habis"}</dd>
              </div>
            </div>

            <div className="mt">
              <div className="fl">Ketentuan Promosi</div>
              <ul className="small muted" style={{ lineHeight: 1.8, paddingLeft: 18, listStyle: "disc" }}>
                <li>Gunakan foto dan deskripsi resmi dari Materi Promosi.</li>
                <li>Dilarang menjanjikan diskon yang tidak berlaku.</li>
                <li>Dilarang memasang iklan berbayar dengan kata kunci merek SAMAQU.</li>
                <li>Komisi final dihitung setelah masa validasi berakhir.</li>
              </ul>
            </div>

            <div className="row wrap mt2">
              <button
                className="btn p"
                type="button"
                onClick={() =>
                  open({
                    title: "Buat Tautan Affiliate",
                    body: (
                      <LinkFormModal
                        products={products.map((x) => ({
                          id: x.id,
                          name: x.name,
                          rate: x.rate,
                          series: x.series,
                        }))}
                        initialProductId={product.id}
                      />
                    ),
                  })
                }
              >
                <Icon name="link" className="sm" />
                Buat Tautan Affiliate
              </button>
              <button
                className="btn s"
                type="button"
                onClick={async () => {
                  try {
                    await affiliateFetch("/api/affiliate/my-products", {
                      method: "POST",
                      body: JSON.stringify({ productId: product.id, promoted: !product.promoted }),
                    });
                    toast(
                      product.promoted
                        ? "Produk ditandai tidak dipromosikan"
                        : "Produk ditambahkan ke Produk Saya",
                    );
                  } catch (e) {
                    toast(e instanceof Error ? e.message : "Gagal menyimpan produk", "err");
                  }
                }}
              >
                {product.promoted ? (
                  <>
                    <Icon name="check" className="sm" />
                    Sudah di Produk Saya
                  </>
                ) : (
                  <>
                    <Icon name="plus" className="sm" />
                    Tambah ke Produk Saya
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
