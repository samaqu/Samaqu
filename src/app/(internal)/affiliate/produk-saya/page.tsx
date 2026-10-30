"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/affiliate/icons";
import { Empty, Pager, ProductCell, Search, Tabs, paginate, useToast } from "@/components/affiliate/ui";
import { affiliateFetch } from "@/lib/affiliate/client";
import { money, num } from "@/lib/affiliate/format";

/**
 * "Produk Saya" — produk yang dipilih affiliate untuk dipromosikan.
 * Struktur tabel mengikuti mockup.
 */

interface MyProduct {
  id: string;
  productId: string;
  name: string;
  category: string;
  price: number;
  image: string;
  stock: number;
  links: number;
  clicks: number;
  orders: number;
  promoted: boolean;
}

export default function AffiliateMyProductsPage() {
  const [items, setItems] = useState<MyProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { toast } = useToast();

  const load = async () => {
    try {
      const json = await affiliateFetch<{ items: MyProduct[] }>("/api/affiliate/my-products");
      setItems(json.items || []);
    } catch (e) {
      console.error("[AFFILIATE] Gagal memuat produk saya:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = async (item: MyProduct) => {
    try {
      await affiliateFetch("/api/affiliate/my-products", {
        method: "POST",
        body: JSON.stringify({ productId: item.productId, promoted: !item.promoted }),
      });
      toast(item.promoted ? "Produk ditandai tidak dipromosikan" : "Produk ditandai aktif dipromosikan");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Gagal menyimpan status produk", "err");
    }
  };

  const remove = async (item: MyProduct) => {
    try {
      await affiliateFetch(`/api/affiliate/my-products?productId=${encodeURIComponent(item.productId)}`, {
        method: "DELETE",
      });
      toast("Produk dihapus dari Produk Saya");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Gagal menghapus produk", "err");
    }
  };

  const counts = useMemo(
    () => ({
      all: items.length,
      on: items.filter((i) => i.promoted).length,
      off: items.filter((i) => !i.promoted).length,
    }),
    [items],
  );

  const list = useMemo(
    () =>
      items.filter(
        (i) =>
          (tab === "all" || (tab === "on" ? i.promoted : !i.promoted)) &&
          (!q || i.name.toLowerCase().includes(q.toLowerCase())),
      ),
    [items, tab, q],
  );

  const pg = paginate(list, page, 8);

  return (
    <div className="card">
      <div className="ch">
        <div>
          <h3>Daftar Produk Affiliate</h3>
          <p>Produk yang kamu pilih untuk dipromosikan.</p>
        </div>
        <Link href="/affiliate/produk" className="btn p sm">
          <Icon name="plus" className="sm" />
          Tambah dari Katalog
        </Link>
      </div>

      <div style={{ padding: "0 16px" }}>
        <Tabs
          items={[
            ["all", "Semua Produk", counts.all],
            ["on", "Aktif Dipromosikan", counts.on],
            ["off", "Tidak Dipromosikan", counts.off],
          ]}
          value={tab}
          onChange={(v) => {
            setTab(v);
            setPage(1);
          }}
        />
      </div>

      <div className="filters">
        <Search
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          placeholder="Cari produk saya…"
        />
      </div>

      {loading ? (
        <div className="cp muted small">Memuat produk…</div>
      ) : pg.total === 0 ? (
        <Empty
          icon="pkg"
          title="Belum ada produk"
          text="Tambahkan produk dari katalog untuk mulai promosi."
          action={
            <Link href="/affiliate/produk" className="btn p">
              Buka Katalog
            </Link>
          }
        />
      ) : (
        <>
          <div className="tw">
            <table className="t">
              <thead>
                <tr>
                  <th>Produk</th>
                  <th>Harga</th>
                  <th className="num">Tautan</th>
                  <th className="num">Klik</th>
                  <th className="num">Pesanan</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {pg.rows.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <ProductCell name={item.name} category={item.category} image={item.image} />
                    </td>
                    <td>{money(item.price)}</td>
                    <td className="num">{num(item.links)}</td>
                    <td className="num">{num(item.clicks)}</td>
                    <td className="num">{num(item.orders)}</td>
                    <td>
                      <button
                        className={`sw ${item.promoted ? "on" : ""}`}
                        onClick={() => toggle(item)}
                        aria-label="Ubah status promosi"
                        type="button"
                      />{" "}
                      <span className="small muted">{item.promoted ? "Aktif" : "Nonaktif"}</span>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        <Link
                          href={`/affiliate/produk/${item.productId}`}
                          className="btn s sm"
                          title="Lihat Detail"
                        >
                          <Icon name="eye" className="sm" />
                        </Link>
                        <Link href="/affiliate/tautan" className="btn s sm" title="Buat tautan">
                          <Icon name="link" className="sm" />
                        </Link>
                        <Link href="/affiliate/performa" className="btn s sm" title="Lihat performa">
                          <Icon name="chart" className="sm" />
                        </Link>
                        <button
                          className="btn s sm"
                          style={{ color: "var(--af-err)" }}
                          title="Hapus dari Produk Saya"
                          onClick={() => remove(item)}
                          type="button"
                        >
                          <Icon name="trash" className="sm" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={pg.page} pages={pg.pages} total={pg.total} size={pg.size} onPage={setPage} />
        </>
      )}
    </div>
  );
}
