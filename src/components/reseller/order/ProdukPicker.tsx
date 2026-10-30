"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { KatalogProduct } from "@/lib/reseller/client";
import { rupiah } from "@/lib/reseller/format";
import ProductPhoto from "../ProductPhoto";
import type { OrderLine } from "./types";

interface ProductGroup {
  key: string;
  name: string;
  category: string;
  rows: KatalogProduct[];
}

/** Pemilih produk: grup per produk induk, series sebagai chip. */
export default function ProdukPicker({
  products,
  lines,
  onPick,
}: {
  products: KatalogProduct[];
  lines: OrderLine[];
  onPick: (product: KatalogProduct) => void;
}) {
  const [query, setQuery] = useState("");

  const groups = useMemo<ProductGroup[]>(() => {
    const map = new Map<string, ProductGroup>();
    for (const product of products) {
      const key = `${product.category}|${product.name}`;
      const group = map.get(key) || {
        key,
        name: product.name,
        category: product.category,
        rows: [],
      };
      group.rows.push(product);
      map.set(key, group);
    }
    const needle = query.trim().toLowerCase();
    if (!needle) return [...map.values()];
    return [...map.values()]
      .map((group) => ({
        ...group,
        rows: group.rows.filter(
          (row) =>
            group.name.toLowerCase().includes(needle) ||
            String(row.series || "").toLowerCase().includes(needle)
        ),
      }))
      .filter((group) => group.rows.length > 0);
  }, [products, query]);

  const selectedIds = useMemo(() => new Set(lines.map((line) => line.product.id)), [lines]);

  if (products.length === 0) {
    return <p className="muted small">Belum ada produk yang bisa dijual reseller. Hubungi admin SAMAQU.</p>;
  }

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div style={{ position: "relative" }}>
        <Search size={15} style={{ position: "absolute", left: 12, top: 14, color: "var(--rs-mut)" }} />
        <input
          className="in"
          style={{ paddingLeft: 34, minHeight: 46 }}
          placeholder="Cari produk atau series…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {groups.length === 0 ? <p className="muted small">Produk tidak ditemukan.</p> : null}

      <div className="stack" style={{ gap: 10 }}>
        {groups.map((group) => {
          const rep = group.rows.find((row) => row.image) || group.rows[0];
          return (
            <div className="prod-group" key={group.key}>
              <div className="prod-group-head">
                <ProductPhoto src={rep.image} name={group.name} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="bold" style={{ fontSize: 13.5 }}>
                    {group.name}
                  </div>
                  <div className="small muted">
                    {group.category} · {group.rows.length} series
                  </div>
                </div>
              </div>

              <div className="series-grid">
                {group.rows.map((row) => {
                  const stock = row.variants.reduce((sum, variant) => sum + variant.stock, 0);
                  const active = selectedIds.has(row.id);
                  const habis = stock < 1;
                  const label = row.series || "Standar";
                  return (
                    <button
                      key={row.id}
                      type="button"
                      className={`series-chip ${active ? "on" : ""} ${habis ? "off" : ""}`}
                      disabled={habis}
                      aria-pressed={active}
                      onClick={() => onPick(row)}
                    >
                      <span className="nm">{label}</span>
                      <span className="meta">
                        {rupiah(row.buy_price)} · {habis ? "Stok habis" : `Stok ${stock}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
