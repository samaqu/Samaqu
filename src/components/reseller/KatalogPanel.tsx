"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { resellerApi, type KatalogProduct } from "@/lib/reseller/client";
import { rupiah } from "@/lib/reseller/format";
import ProductPhoto from "./ProductPhoto";
import { EmptyState, Note, SkeletonRows } from "./ui";

/** Katalog produk yang boleh dijual reseller + tombol Pesan langsung. */
export default function KatalogPanel() {
  const [products, setProducts] = useState<KatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    resellerApi
      .katalog()
      .then((res) => setProducts(res.data))
      .catch((e) => setError(e?.message || "Gagal memuat katalog."))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(needle) || String(p.series || "").toLowerCase().includes(needle)
    );
  }, [products, query]);

  if (error) return <Note tone="err">{error}</Note>;

  return (
    <div className="stack">
      <div style={{ position: "relative", maxWidth: 420 }}>
        <Search size={15} style={{ position: "absolute", left: 12, top: 12, color: "var(--rs-mut)" }} />
        <input
          className="in"
          style={{ paddingLeft: 34 }}
          placeholder="Cari produk atau series…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="prod-grid">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="sk" style={{ height: 320 }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState text="Belum ada produk yang bisa dijual reseller. Hubungi admin SAMAQU." />
      ) : (
        <div className="prod-grid">
          {filtered.map((product) => {
            const stock = product.variants.reduce((sum, v) => sum + v.stock, 0);
            const habis = stock < 1;
            return (
              <div className="prod-card" key={product.id}>
                <ProductPhoto src={product.image} name={product.name} series={product.series} />
                <div className="bd">
                  <div className="nm">
                    {product.name}
                    {product.series ? ` — ${product.series}` : ""}
                  </div>
                  <div className="small">
                    <span className="price-strike">{rupiah(product.price)}</span>
                  </div>
                  <div className="small">
                    Beli kamu <b className="bold">{rupiah(product.buy_price)}</b> (−{product.discount_percent}%)
                  </div>
                  <div className="small muted">{habis ? "Stok habis" : `Stok ${stock}`}</div>
                  {habis ? (
                    <button type="button" className="btn sm blk" disabled style={{ marginTop: 4 }}>
                      Pesan
                    </button>
                  ) : (
                    <Link
                      className="btn sm blk"
                      href={`/reseller/pesanan/baru?produk=${encodeURIComponent(product.id)}`}
                      style={{ marginTop: 4 }}
                    >
                      Pesan
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
