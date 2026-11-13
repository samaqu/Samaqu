"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { rupiah } from "@/lib/reseller/format";
import { groupStock, poolOfRow, stockOf, type ProductGroup } from "@/lib/reseller/stock-view";
import { PanelDetailShell } from "@/components/ops/transaksi/PanelDetailPesanan";
import { RS_DRAWER_CSS } from "./ResellerOrderDrawer";
import ProductPhoto from "./ProductPhoto";
import { StockStrip } from "./StockViews";

const orderHref = (id: string) => `/reseller/pesanan/baru?produk=${encodeURIComponent(id)}`;

/**
 * Drawer "Pilih Series" katalog reseller. Kerangka drawer (overlay + panel geser kanan) memakai
 * `PanelDetailShell` yang sama dengan Detail Pesanan reseller, jadi tampilannya identik.
 * Isi: ringkasan produk, pil series, stok per ukuran (dan warna) series terpilih, lalu tombol pesan
 * yang memakai tautan lama `/reseller/pesanan/baru?produk=<id series>`.
 */
export default function SeriesDrawer({ group, onClose }: { group: ProductGroup | null; onClose: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Series awal = series pertama yang masih ada stoknya (kalau semua habis, yang pertama).
  useEffect(() => {
    if (!group) return;
    const first = group.rows.find((row) => stockOf(row) > 0) ?? group.rows[0];
    setSelectedId(first?.id ?? null);
  }, [group]);

  return (
    <PanelDetailShell open={!!group} onClose={onClose} tema="mono">
      <style>{RS_DRAWER_CSS}</style>
      {group ? <DrawerBody group={group} selectedId={selectedId} onSelect={setSelectedId} onClose={onClose} /> : null}
    </PanelDetailShell>
  );
}

function DrawerBody({
  group,
  selectedId,
  onSelect,
  onClose,
}: {
  group: ProductGroup;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const selected = group.rows.find((row) => row.id === selectedId) ?? group.rows[0];
  const pool = poolOfRow(group, selected);
  const habis = stockOf(selected) < 1;
  const label = selected.series || "Standar";
  const minPrice = Math.min(...group.rows.map((row) => row.price));
  const minBuy = Math.min(...group.rows.map((row) => row.buy_price));

  return (
    <div className="rso">
      <div className="rso-head">
        <div>
          <span className="rso-kicker">Reseller Center</span>
          <h2>{group.name}</h2>
        </div>
        <button type="button" className="rso-x" onClick={onClose} aria-label="Tutup">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="rso-body">
        <section className="rso-card rsk-sum">
          <ProductPhoto src={group.image} name={group.name} className="rsk-thumb" />
          <div className="rsk-sum-txt">
            <span className="rso-sub">
              {group.category} · {group.rows.length} series
            </span>
            <span className="rsk-sum-price">
              <s>Mulai {rupiah(minPrice)}</s>
              <b>Beli mulai {rupiah(minBuy)}</b>
            </span>
            <span className="rso-badge">Total stok {groupStock(group)}</span>
          </div>
        </section>

        <section className="rso-card">
          <div className="rso-sec">
            <span className="rso-sec-title">Pilih series</span>
          </div>
          <div className="rsk-pills" role="group" aria-label="Pilih series">
            {group.rows.map((row) => {
              const off = stockOf(row) < 1;
              return (
                <button
                  key={row.id}
                  type="button"
                  className={`rsk-pill${row.id === selected.id ? " on" : ""}${off ? " off" : ""}`}
                  aria-pressed={row.id === selected.id}
                  onClick={() => onSelect(row.id)}
                >
                  {row.series || "Standar"}
                </button>
              );
            })}
          </div>

          <div className="rsk-sel">
            <div className="rsk-sel-top">
              <div className="rsk-sel-name">{label}</div>
              <div className="rsk-sel-price">
                <b>{rupiah(selected.buy_price)}</b>
                <span>
                  <s>{rupiah(selected.price)}</s> · −{selected.discount_percent}%
                </span>
              </div>
            </div>

            <div className="rsk-sel-stock">
              <span className="rso-sec-title">Stok per ukuran</span>
              <span className="rso-badge">{pool.total} unit</span>
            </div>
            <StockStrip pool={pool} />

            {habis ? (
              <button type="button" className="rsk-cta" disabled>
                Stok habis
              </button>
            ) : (
              <Link className="rsk-cta" href={orderHref(selected.id)}>
                Pesan Series {label}
              </Link>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
