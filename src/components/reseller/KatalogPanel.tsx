"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { resellerApi, type KatalogProduct } from "@/lib/reseller/client";
import { rupiah } from "@/lib/reseller/format";
import { filterGroups, groupProducts, groupStock, stockOf, type ProductGroup } from "@/lib/reseller/stock-view";
import ProductPhoto from "./ProductPhoto";
import SeriesDrawer from "./SeriesDrawer";
import { EmptyState, Note } from "./ui";

const orderHref = (id: string) => `/reseller/pesanan/baru?produk=${encodeURIComponent(id)}`;

/**
 * Satu kartu per produk induk (kategori + nama), seperti katalog website. "Pilih Series" membuka
 * drawer (series, stok per ukuran, tombol pesan). Produk yang hanya punya satu baris tampil seperti
 * biasa dengan tombol Pesan.
 */
function GroupCard({ group, onOpen }: { group: ProductGroup; onOpen: (key: string) => void }) {
  const { rows } = group;
  // Stok produk = jumlah stok per KOLAM (series yang berbagi stok dihitung sekali).
  const totalStock = groupStock(group);
  const habis = totalStock < 1;

  if (rows.length === 1) {
    const product = rows[0];
    return (
      <div className="prod-card">
        <ProductPhoto src={group.image} name={product.name} series={product.series} />
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
          <div className="small muted">{habis ? "Stok habis" : `Stok ${totalStock}`}</div>
          {habis ? (
            <button type="button" className="btn sm blk" disabled style={{ marginTop: 4 }}>
              Pesan
            </button>
          ) : (
            <Link className="btn sm blk" href={orderHref(product.id)} style={{ marginTop: 4 }}>
              Pesan
            </Link>
          )}
        </div>
      </div>
    );
  }

  const availableCount = rows.filter((row) => stockOf(row) > 0).length;
  const minPrice = Math.min(...rows.map((row) => row.price));
  const minBuy = Math.min(...rows.map((row) => row.buy_price));
  const discounts = new Set(rows.map((row) => row.discount_percent));
  const uniformDiscount = discounts.size === 1 ? rows[0].discount_percent : null;

  return (
    <div className="prod-card">
      <ProductPhoto src={group.image} name={group.name} />
      <div className="bd">
        <div className="nm" title={group.name}>
          {group.name}
        </div>
        <div className="small">
          <span className="price-strike">Mulai {rupiah(minPrice)}</span>
        </div>
        <div className="small">
          Beli mulai <b className="bold">{rupiah(minBuy)}</b>
        </div>
        <div className="small muted">
          {habis ? "Stok habis" : `${uniformDiscount != null ? `−${uniformDiscount}% · ` : ""}Stok ${totalStock}`}
        </div>
        <button
          type="button"
          className="btn sm blk grp-toggle"
          style={{ marginTop: 4 }}
          disabled={habis}
          onClick={() => onOpen(group.key)}
        >
          {habis ? "Stok habis" : `Pilih Series (${availableCount})`}
          {habis ? null : <ChevronRight size={15} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

/** Katalog produk yang boleh dijual reseller + pilih series lalu pesan langsung. */
export default function KatalogPanel() {
  const [products, setProducts] = useState<KatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [drawerKey, setDrawerKey] = useState<string | null>(null);

  useEffect(() => {
    resellerApi
      .katalog()
      .then((res) => setProducts(res.data))
      .catch((e) => setError(e?.message || "Gagal memuat katalog."))
      .finally(() => setLoading(false));
  }, []);

  // Penggabungan murni di sisi tampilan: API tetap mengirim satu baris per series.
  const allGroups = useMemo(() => groupProducts(products), [products]);
  const groups = useMemo(() => filterGroups(allGroups, query), [allGroups, query]);
  // Drawer selalu menampilkan SEMUA series produk, bukan hasil saringan pencarian.
  const drawerGroup = useMemo(() => allGroups.find((group) => group.key === drawerKey) ?? null, [allGroups, drawerKey]);

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
      ) : groups.length === 0 ? (
        <EmptyState text="Belum ada produk yang bisa dijual reseller. Hubungi admin SAMAQU." />
      ) : (
        <div className="prod-grid">
          {groups.map((group) => (
            <GroupCard key={group.key} group={group} onOpen={setDrawerKey} />
          ))}
        </div>
      )}

      <SeriesDrawer group={drawerGroup} onClose={() => setDrawerKey(null)} />
    </div>
  );
}
