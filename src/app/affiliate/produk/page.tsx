"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/affiliate/icons";
import { Empty, Pager, Search, Select, paginate, useModal, useToast } from "@/components/affiliate/ui";
import LinkFormModal from "@/components/affiliate/LinkFormModal";
import { affiliateFetch } from "@/lib/affiliate/client";
import { money } from "@/lib/affiliate/format";

/**
 * Katalog produk affiliate — mengikuti katalog toko: SATU kartu per produk
 * utama (kategori + nama), bukan satu kartu per baris series/varian.
 * Series & varian ditampilkan di halaman detail setelah kartu diklik.
 * Data produk & stok berasal dari katalog SAMAQU sungguhan.
 */

interface AffiliateProduct {
  id: string;
  name: string;
  category: string;
  series: string | null;
  kain: string | null;
  badge: string | null;
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

interface CatalogGroup {
  id: string;
  name: string;
  category: string;
  kain: string | null;
  badge: string | null;
  image: string;
  price: number;
  stock: number;
  rate: number;
  estimatedCommission: number;
  series: string[];
  promoted: boolean;
}

/** Gabungkan semua baris series/varian menjadi satu kartu produk utama. */
function groupProducts(items: AffiliateProduct[]): CatalogGroup[] {
  const map = new Map<string, AffiliateProduct[]>();
  for (const item of items) {
    const key = `${item.category}::${item.name}`;
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }

  return Array.from(map.values()).map((members) => {
    const rep = members[0];
    const cheapest = members.reduce((a, b) => (b.price < a.price ? b : a), members[0]);
    const stock = members.reduce((sum, m) => sum + m.stock, 0);
    const series = Array.from(
      new Set(members.map((m) => m.series).filter((s): s is string => Boolean(s))),
    ).sort();
    const badge =
      members.find((m) => m.badge === "terlaris")?.badge ||
      members.find((m) => m.badge === "rekomendasi")?.badge ||
      members.find((m) => m.badge === "new")?.badge ||
      null;
    return {
      id: rep.id,
      name: rep.name,
      category: rep.category,
      kain: cheapest.kain,
      badge,
      image: rep.image,
      price: cheapest.price,
      stock,
      rate: cheapest.rate,
      estimatedCommission: Math.round((cheapest.price * cheapest.rate) / 100),
      series,
      promoted: members.some((m) => m.promoted),
    };
  });
}

export default function AffiliateCatalogPage() {
  const [products, setProducts] = useState<AffiliateProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [kainF, setKainF] = useState("");
  const [seriesF, setSeriesF] = useState("");
  const [price, setPrice] = useState("");
  const [rate, setRate] = useState("");
  const [avail, setAvail] = useState("");
  const [sortBy, setSortBy] = useState("popular");
  const [page, setPage] = useState(1);
  const { open } = useModal();
  const { toast } = useToast();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const json = await affiliateFetch<{ products: AffiliateProduct[] }>("/api/affiliate/products");
        if (alive) setProducts(json.products || []);
      } catch (e) {
        console.error("[AFFILIATE] Gagal memuat katalog:", e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const groups = useMemo(() => groupProducts(products), [products]);

  const categories = useMemo(
    () => Array.from(new Set(groups.map((p) => p.category).filter(Boolean))),
    [groups],
  );

  const kainOptions = useMemo(
    () =>
      Array.from(new Set(groups.map((p) => p.kain).filter((k): k is string => Boolean(k)))).sort(),
    [groups],
  );

  const seriesOptions = useMemo(
    () => Array.from(new Set(groups.flatMap((p) => p.series))).sort(),
    [groups],
  );

  const list = useMemo(() => {
    let rows = groups.filter((p) => {
      if (q && !`${p.name} ${p.category} ${p.series.join(" ")}`.toLowerCase().includes(q.toLowerCase())) {
        return false;
      }
      if (cat && p.category !== cat) return false;
      if (kainF && p.kain !== kainF) return false;
      if (seriesF && !p.series.includes(seriesF)) return false;
      if (price) {
        const [lo, hi] = price.split("-").map(Number);
        if (p.price < lo || p.price > hi) return false;
      }
      if (rate && p.rate < Number(rate)) return false;
      if (avail === "ada" && p.stock === 0) return false;
      if (avail === "habis" && p.stock !== 0) return false;
      return true;
    });

    rows = [...rows];
    if (sortBy === "price-asc") rows.sort((a, b) => a.price - b.price);
    else if (sortBy === "price-desc") rows.sort((a, b) => b.price - a.price);
    else if (sortBy === "rate") rows.sort((a, b) => b.rate - a.rate || b.price - a.price);
    else rows.sort((a, b) => b.estimatedCommission - a.estimatedCommission);
    return rows;
  }, [groups, q, cat, kainF, seriesF, price, rate, avail, sortBy]);

  const pg = paginate(list, page, 8);

  const reset = () => {
    setQ("");
    setCat("");
    setKainF("");
    setSeriesF("");
    setPrice("");
    setRate("");
    setAvail("");
    setSortBy("popular");
    setPage(1);
    toast("Filter katalog direset", "info");
  };

  return (
    <div>
      <div className="card">
        <div className="filters">
          <Search value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Cari nama produk…" />
          <Select
            value={cat}
            onChange={(v) => { setCat(v); setPage(1); }}
            options={[["", "Semua Kategori"], ...categories.map((c) => [c, c] as [string, string])]}
          />
          <Select
            value={kainF}
            onChange={(v) => { setKainF(v); setPage(1); }}
            options={[["", "Semua Kain"], ...kainOptions.map((k) => [k, k] as [string, string])]}
          />
          <Select
            value={seriesF}
            onChange={(v) => { setSeriesF(v); setPage(1); }}
            options={[["", "Semua Series"], ...seriesOptions.map((s) => [s, s] as [string, string])]}
          />
          <Select
            value={price}
            onChange={(v) => { setPrice(v); setPage(1); }}
            options={[
              ["", "Semua Harga"],
              ["0-150000", "< Rp150.000"],
              ["150000-300000", "Rp150.000 – Rp300.000"],
              ["300000-9999999", "> Rp300.000"],
            ]}
          />
          <Select
            value={rate}
            onChange={(v) => { setRate(v); setPage(1); }}
            options={[
              ["", "Semua Komisi"],
              ["10", "Komisi ≥ 10%"],
              ["12", "Komisi ≥ 12%"],
              ["14", "Komisi ≥ 14%"],
            ]}
          />
          <Select
            value={avail}
            onChange={(v) => { setAvail(v); setPage(1); }}
            options={[
              ["", "Semua Ketersediaan"],
              ["ada", "Tersedia"],
              ["habis", "Stok Habis"],
            ]}
          />
          <Select
            value={sortBy}
            onChange={(v) => { setSortBy(v); setPage(1); }}
            options={[
              ["popular", "Urutkan: Terpopuler"],
              ["price-asc", "Harga Terendah"],
              ["price-desc", "Harga Tertinggi"],
              ["rate", "Komisi Tertinggi"],
            ]}
          />
          <button className="btn s" onClick={reset} type="button">
            <Icon name="rot" className="sm" />
            Reset Filter
          </button>
        </div>
        <div className="cp small muted" style={{ padding: "12px 16px" }}>
          {loading ? "Memuat katalog…" : `${list.length} produk ditemukan`}
        </div>
      </div>

      {pg.total === 0 ? (
        <div className="card mt">
          <Empty
            icon="bag"
            title="Produk tidak ditemukan"
            text="Tidak ada produk yang cocok dengan filter kamu."
            action={
              <button className="btn s" onClick={reset} type="button">
                Reset Filter
              </button>
            }
          />
        </div>
      ) : (
        <>
          <div className="grid g4 mt">
            {pg.rows.map((p) => (
              <div className="card pc" key={`${p.category}::${p.name}`}>
                <Link href={`/affiliate/produk/${p.id}`} className="im">
                  {p.image ? <img src={p.image} alt={p.name} loading="lazy" /> : null}
                  {p.stock > 0 && p.badge ? (
                    <span className={`pc-badge ${p.badge}`}>
                      {p.badge === "terlaris"
                        ? "Terlaris"
                        : p.badge === "rekomendasi"
                          ? "Rekomendasi"
                          : "New"}
                    </span>
                  ) : null}
                  {p.stock === 0 ? <span className="pc-sold">Habis</span> : null}
                </Link>
                <div className="bd">
                  <div className="nm">{p.name}</div>
                  <div className="pc-meta">
                    {p.kain ? `Kain ${p.kain}` : p.category}
                    {p.series.length > 1 ? ` · ${p.series.length} series` : ""}
                  </div>
                  <div
                    className={`pc-stock${p.stock === 0 ? " out" : p.stock < 15 ? " low" : ""}`}
                  >
                    {p.stock === 0
                      ? "Stok habis"
                      : p.stock < 15
                        ? `Stok terbatas · ${p.stock}`
                        : "Stok tersedia"}
                  </div>
                  <div className="pr">
                    Mulai <b>{money(p.price)}</b>
                  </div>
                  <div className="cmb">
                    <span>
                      Komisi <b>{p.rate}%</b>
                    </span>
                    <span>
                      ±<b>{money(p.estimatedCommission)}</b>/terjual
                    </span>
                  </div>
                  <div className="pc-actions">
                    <Link href={`/affiliate/produk/${p.id}`} className="pc-btn">
                      Lihat Detail
                    </Link>
                    <button
                      className="pc-btn solid"
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
                                kain: x.kain,
                              }))}
                              initialProductId={p.id}
                            />
                          ),
                        })
                      }
                    >
                      Promosikan
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="card mt">
            <Pager page={pg.page} pages={pg.pages} total={pg.total} size={pg.size} onPage={setPage} />
          </div>
        </>
      )}
    </div>
  );
}
