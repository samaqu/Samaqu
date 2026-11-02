import Link from "next/link";
import { money } from "@/lib/open-order-catalog";
import type { CampaignProduct } from "../_data/products";
import { OPEN_ORDER_PATH } from "../_data/order-href";
import s from "../campaign.module.css";

/**
 * Section 4 — "Produk pilihan periode ini".
 *
 * Sumber datanya `loadCampaignProducts()` (server): produk yang Create Your Price-nya
 * aktif di Open Order, maksimal 4. Kalau daftarnya kosong, section ini TIDAK dirender
 * sama sekali oleh `page.tsx` — bukan placeholder kosong.
 *
 * Di mobile `.prodRow` berubah jadi carousel scroll-snap (lihat `campaign.module.css`).
 */
export default function ProductsSection({ products }: { products: CampaignProduct[] }) {
  if (products.length === 0) return null;

  return (
    <section className={s.sec} style={{ padding: "96px 20px" }}>
      <div
        style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "32px" }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: "16px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div className={s.tEyebrow} style={{ color: "var(--cyp-muted)" }}>
              PRODUK PILIHAN PERIODE INI
            </div>
            <h2 className={s.tH2} style={{ margin: 0 }}>
              Bisa kamu beli dengan <em>harga pilihanmu.</em>
            </h2>
          </div>
          <Link
            className={s.hideSm}
            href={OPEN_ORDER_PATH}
            style={{ fontSize: "14px", fontWeight: 700, textDecoration: "none" }}
          >
            Lihat semua di Open Order →
          </Link>
        </div>

        <div className={s.prodRow}>
          {products.map((product) => (
            <a
              key={product.id}
              href={`/id/katalog/${product.id}`}
              style={{
                textDecoration: "none",
                color: "var(--cyp-black)",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                minWidth: 0,
              }}
            >
              <div
                style={{
                  position: "relative",
                  aspectRatio: "3 / 4",
                  background: "var(--cyp-cream-2)",
                  borderRadius: "18px",
                  overflow: "hidden",
                }}
              >
                {product.image ? (
                  // Sengaja `<img>`, bukan `next/image`: foto katalog bisa berasal dari host yang
                  // tidak terdaftar di `next.config.ts` (mis. R2 `samaqu-media.samaqu.workers.dev`)
                  // dan sebagian berupa `.mp4`. Menambah host ke config global di luar lingkup
                  // halaman ini, jadi di sini dipakai tag gambar biasa yang selalu aman.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.image}
                    alt={product.name}
                    loading="lazy"
                    decoding="async"
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "12px",
                      color: "var(--cyp-muted)",
                    }}
                  >
                    [FOTO PRODUK]
                  </div>
                )}
                <span
                  style={{
                    position: "absolute",
                    top: "10px",
                    left: "10px",
                    background: "var(--cyp-black)",
                    color: "var(--cyp-cream)",
                    fontSize: "10px",
                    fontWeight: 700,
                    letterSpacing: "1px",
                    padding: "5px 9px",
                    borderRadius: "999px",
                  }}
                >
                  CREATE YOUR PRICE
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                <div style={{ fontSize: "16px", fontWeight: 700 }}>{product.name}</div>
                {product.sub ? (
                  <div style={{ fontSize: "13px", color: "var(--cyp-muted)" }}>{product.sub}</div>
                ) : null}
                <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginTop: "6px" }}>
                  <span style={{ fontSize: "12px", color: "var(--cyp-muted)" }}>Mulai</span>
                  <span className={s.num} style={{ fontSize: "18px", fontWeight: 700, lineHeight: 1 }}>
                    {money(product.minimumPrice)}
                  </span>
                </div>
              </div>
            </a>
          ))}
        </div>

        <p style={{ margin: 0, fontSize: "13px", color: "var(--cyp-muted)" }}>
          Programnya tetap, yang berganti hanya produknya. Daftar di atas mengikuti produk Create Your
          Price yang sedang aktif di Open Order.
        </p>
      </div>
    </section>
  );
}
