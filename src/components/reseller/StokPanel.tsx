"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { resellerApi, type KatalogProduct } from "@/lib/reseller/client";
import { filterGroups, groupProducts, groupStock, poolsOf } from "@/lib/reseller/stock-view";
import ProductPhoto from "./ProductPhoto";
import { StockTable } from "./StockViews";
import { EmptyState, Note } from "./ui";

/**
 * Menu Stok reseller: stok per produk, per series (series yang berbagi stok digabung), per ukuran,
 * dan per warna kalau produknya punya warna. Hanya membaca data katalog reseller yang sama dengan
 * menu Katalog; tidak ada data baru dan tidak ada aksi tulis.
 */
export default function StokPanel() {
  const [products, setProducts] = useState<KatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    resellerApi
      .katalog()
      .then((res) => setProducts(res.data))
      .catch((e) => setError(e?.message || "Gagal memuat stok."))
      .finally(() => setLoading(false));
  }, []);

  const groups = useMemo(() => filterGroups(groupProducts(products), query), [products, query]);

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
        <div className="stk-list">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="sk" style={{ height: 180 }} />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState text="Belum ada produk yang bisa dijual reseller. Hubungi admin SAMAQU." />
      ) : (
        <div className="stk-list">
          {groups.map((group) => {
            const pools = poolsOf(group);
            const total = groupStock(group);
            return (
              <section className="stk-card" key={group.key}>
                <div className="stk-head">
                  <ProductPhoto src={group.image} name={group.name} className="stk-thumb" />
                  <div className="stk-head-txt">
                    <h2>{group.name}</h2>
                    <span className="muted small">
                      {group.category} · {group.rows.length} series
                    </span>
                  </div>
                  <span className={`badge ${total < 1 ? "err" : "muted"}`}>{total < 1 ? "Habis" : `${total} unit`}</span>
                </div>
                <StockTable pools={pools} />
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
