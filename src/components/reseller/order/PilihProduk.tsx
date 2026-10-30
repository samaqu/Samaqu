"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { KatalogProduct } from "@/lib/reseller/client";
import { rupiah } from "@/lib/reseller/format";
import ProductPhoto from "../ProductPhoto";
import { lineKey, type OrderLine } from "./types";

/**
 * Pilih produk + varian (warna/ukuran) + qty, lalu tambahkan ke pesanan.
 * Stok per varian berasal dari API katalog (sudah stok efektif).
 */
export default function PilihProduk({
  products,
  onAdd,
  initialOpen,
}: {
  products: KatalogProduct[];
  onAdd: (line: OrderLine) => void;
  initialOpen?: string;
}) {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string>(initialOpen || "");
  const [color, setColor] = useState("");
  const [size, setSize] = useState("");
  const [qty, setQty] = useState(1);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = needle
      ? products.filter(
          (p) =>
            p.name.toLowerCase().includes(needle) ||
            String(p.series || "").toLowerCase().includes(needle)
        )
      : products;
    return list.slice(0, 30);
  }, [products, query]);

  const active = products.find((p) => p.id === openId) || null;
  const colors = active ? [...new Set(active.variants.map((v) => v.color))] : [];
  const sizes = active
    ? active.variants.filter((v) => !color || v.color === color).map((v) => v)
    : [];
  const selectedVariant = sizes.find((v) => v.size === size) || null;

  const openProduct = (product: KatalogProduct) => {
    if (openId === product.id) {
      setOpenId("");
      return;
    }
    setOpenId(product.id);
    const firstColor = product.variants[0]?.color || "";
    const firstSize = product.variants.find((v) => v.color === firstColor);
    setColor(firstColor);
    setSize(firstSize?.size || "");
    setQty(1);
  };

  const add = () => {
    if (!active || !color || !size || !selectedVariant) return;
    const stock = Math.max(0, selectedVariant.stock);
    if (stock < 1 || qty < 1) return;
    onAdd({
      key: lineKey(active.id, color, size),
      product: active,
      color,
      size,
      quantity: Math.min(qty, stock),
      sellPrice: active.min_sell_price,
      stock,
    });
    setOpenId("");
  };

  if (products.length === 0) {
    return <p className="muted small">Belum ada produk yang bisa dijual reseller. Hubungi admin SAMAQU.</p>;
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div style={{ position: "relative" }}>
        <Search size={15} style={{ position: "absolute", left: 12, top: 12, color: "var(--rs-mut)" }} />
        <input
          className="in"
          style={{ paddingLeft: 34 }}
          placeholder="Cari produk atau series…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="stack" style={{ gap: 8 }}>
        {filtered.map((product) => {
          const isOpen = product.id === openId;
          const totalStock = product.variants.reduce((sum, v) => sum + v.stock, 0);
          return (
            <div key={product.id}>
              <button type="button" className="pick-row" onClick={() => openProduct(product)}>
                <ProductPhoto src={product.image} name={product.name} series={product.series} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="bold" style={{ display: "block", fontSize: 13.5 }}>
                    {product.name}
                    {product.series ? ` — ${product.series}` : ""}
                  </span>
                  <span className="small muted" style={{ display: "block", marginTop: 2 }}>
                    <span className="price-strike">{rupiah(product.price)}</span> · beli{" "}
                    <b className="bold">{rupiah(product.buy_price)}</b> (−{product.discount_percent}%)
                  </span>
                  <span className="small muted" style={{ display: "block" }}>
                    {totalStock < 1 ? "Stok habis" : `Stok ${totalStock}`}
                  </span>
                </span>
                <span className="btn ghost sm">{isOpen ? "Tutup" : "Pilih"}</span>
              </button>

              {isOpen ? (
                <div className="card" style={{ marginTop: 8 }}>
                  <div className="card-b stack" style={{ gap: 12 }}>
                    <div>
                      <p className="small bold" style={{ marginBottom: 6 }}>
                        Warna
                      </p>
                      <div className="chips">
                        {colors.map((c) => (
                          <button
                            key={c}
                            type="button"
                            className={`chip ${c === color ? "on" : ""}`}
                            onClick={() => {
                              setColor(c);
                              const first = active?.variants.find((v) => v.color === c);
                              setSize(first?.size || "");
                              setQty(1);
                            }}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="small bold" style={{ marginBottom: 6 }}>
                        Ukuran (sisa stok)
                      </p>
                      <div className="chips">
                        {sizes.map((v) => (
                          <button
                            key={v.size}
                            type="button"
                            className={`chip ${v.size === size ? "on" : ""}`}
                            disabled={v.stock < 1}
                            onClick={() => {
                              setSize(v.size);
                              setQty(1);
                            }}
                          >
                            {v.size} · {v.stock}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="spread">
                      <div className="row">
                        <span className="small bold">Jumlah</span>
                        <div className="qty">
                          <button type="button" disabled={qty <= 1} onClick={() => setQty((q) => q - 1)}>
                            −
                          </button>
                          <span>{qty}</span>
                          <button
                            type="button"
                            disabled={!selectedVariant || qty >= selectedVariant.stock}
                            onClick={() => setQty((q) => q + 1)}
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn"
                        disabled={!selectedVariant || selectedVariant.stock < 1}
                        onClick={add}
                      >
                        Tambah ke pesanan
                      </button>
                    </div>
                    {selectedVariant && selectedVariant.stock < 1 ? (
                      <p className="err">Stok varian ini habis.</p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
        {filtered.length === 0 ? <p className="muted small">Produk tidak ditemukan.</p> : null}
      </div>
    </div>
  );
}
