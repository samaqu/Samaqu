"use client";

import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Search } from "lucide-react";
import { resellerApi, type KatalogProduct } from "@/lib/reseller/client";
import { rupiah } from "@/lib/reseller/format";
import ProductPhoto from "./ProductPhoto";
import { EmptyState, Note } from "./ui";

interface ProductGroup {
  key: string;
  name: string;
  category: string;
  /** Foto kartu = foto series pertama yang punya gambar (sama seperti pemilih produk Buat Pesanan). */
  image: string | null;
  rows: KatalogProduct[];
}

const stockOf = (product: KatalogProduct) => product.variants.reduce((sum, variant) => sum + variant.stock, 0);
const orderHref = (id: string) => `/reseller/pesanan/baru?produk=${encodeURIComponent(id)}`;

/**
 * Satu kartu per produk induk (kategori + nama), seperti katalog website. Series dipilih lewat
 * chip di dalam kartu; chip membuka form pesanan dengan tautan yang SAMA seperti tombol Pesan
 * sebelumnya. Produk yang hanya punya satu baris tampil seperti biasa dengan tombol Pesan.
 */
function GroupCard({ group, searching }: { group: ProductGroup; searching: boolean }) {
  const { rows } = group;
  const panelId = useId();
  // Saat mencari, chip langsung terbuka; ketukan pengguna menimpa pengaturan itu.
  const [toggled, setToggled] = useState<boolean | null>(null);
  useEffect(() => setToggled(null), [searching]);
  const open = toggled ?? searching;

  const stocks = rows.map(stockOf);
  const totalStock = stocks.reduce((sum, stock) => sum + stock, 0);
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

  const availableCount = stocks.filter((stock) => stock > 0).length;
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
          aria-expanded={open && !habis}
          aria-controls={panelId}
          disabled={habis}
          onClick={() => setToggled(!open)}
        >
          {habis ? "Stok habis" : `Pilih Series (${availableCount})`}
          {habis ? null : <ChevronDown size={15} aria-hidden="true" />}
        </button>
      </div>

      {open && !habis ? (
        <div className="grp-series" id={panelId}>
          <div className="series-grid">
            {rows.map((row, index) => {
              const stock = stocks[index];
              const label = row.series || "Standar";
              const meta = `${rupiah(row.buy_price)} · ${stock < 1 ? "Stok habis" : `Stok ${stock}`}`;
              return stock < 1 ? (
                <button key={row.id} type="button" className="series-chip off" disabled>
                  <span className="nm">{label}</span>
                  <span className="meta">{meta}</span>
                </button>
              ) : (
                <Link key={row.id} className="series-chip" href={orderHref(row.id)}>
                  <span className="nm">{label}</span>
                  <span className="meta">{meta}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Katalog produk yang boleh dijual reseller + pilih series lalu pesan langsung. */
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

  // Penggabungan murni di sisi tampilan: API tetap mengirim satu baris per series.
  const allGroups = useMemo<ProductGroup[]>(() => {
    const map = new Map<string, ProductGroup>();
    for (const product of products) {
      const key = `${product.category}|${product.name}`;
      const group = map.get(key) || { key, name: product.name, category: product.category, image: null, rows: [] };
      group.rows.push(product);
      if (!group.image && product.image) group.image = product.image;
      map.set(key, group);
    }
    return [...map.values()];
  }, [products]);

  const needle = query.trim().toLowerCase();
  const groups = useMemo(() => {
    if (!needle) return allGroups;
    return allGroups
      .map((group) => ({
        ...group,
        rows: group.rows.filter(
          (row) => row.name.toLowerCase().includes(needle) || String(row.series || "").toLowerCase().includes(needle)
        ),
      }))
      .filter((group) => group.rows.length > 0);
  }, [allGroups, needle]);

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
            <GroupCard key={group.key} group={group} searching={needle.length > 0} />
          ))}
        </div>
      )}
    </div>
  );
}
