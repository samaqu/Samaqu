import Link from "next/link";
import { money } from "@/lib/open-order-catalog";
import type { CampaignProduct, CampaignWindowState } from "../_data/products";
import { OPEN_ORDER_PATH, openOrderProductHref } from "../_data/order-href";
import s from "../campaign.module.css";

/**
 * Section 4 — "Produk pilihan periode ini".
 *
 * Sumber datanya `loadCampaignProducts()` (server): produk yang Create Your Price-nya
 * aktif di Open Order, maksimal 4. Kalau daftarnya kosong, section ini TIDAK dirender
 * sama sekali oleh `page.tsx` — bukan placeholder kosong.
 *
 * Tampilan kartu sengaja MENIRU kartu katalog /open-order, termasuk overlay kunci
 * "Sudah ditutup" / "Segera dibuka" ketika jendela Open Order belum/sudah lewat
 * (`loadCampaignWindowState()`, sumber status yang sama).
 *
 * Di mobile `.prodRow` jadi grid 2×2 (lihat `campaign.module.css`).
 */
export default function ProductsSection({
  products,
  window: openOrderWindow,
  searchParams = {},
}: {
  products: CampaignProduct[];
  window: CampaignWindowState;
  /** Query kampanye (utm_*) yang ikut diteruskan ke tautan detail Open Order. */
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  if (products.length === 0) return null;

  const locked = openOrderWindow.locked;
  const lockLabel = openOrderWindow.state === "closed" ? "Sudah ditutup" : "Segera dibuka";

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
              href={openOrderProductHref(product.id, searchParams)}
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
                  // `object-contain` + padding → foto tampil UTUH, sama seperti kartu Open Order.
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
                      objectFit: "contain",
                      padding: "4px",
                      boxSizing: "border-box",
                      display: "block",
                      // Produk habis / jendela ditutup digelapkan sedikit, sama seperti kartu Open Order.
                      filter: locked || !product.available ? "grayscale(35%) brightness(.85)" : undefined,
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

                {/* Kunci — jendela Open Order BELUM dibuka / sudah berakhir: foto digelapkan +
                    pill putih berikon gembok di tengah, PERSIS seperti kartu /open-order. */}
                {locked ? (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(0,0,0,0.25)",
                    }}
                  >
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        background: "#FFFFFF",
                        color: "var(--cyp-black)",
                        fontSize: "11px",
                        fontWeight: 700,
                        padding: "6px 12px",
                        borderRadius: "999px",
                        boxShadow: "0 2px 8px rgba(0,0,0,.15)",
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                        <rect x="4" y="10" width="16" height="11" rx="2" />
                        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                      </svg>
                      {lockLabel}
                    </span>
                  </div>
                ) : null}
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

                {/* Tombol — gaya kartu /open-order: terkunci = garis abu-abu, aktif = hitam. */}
                <span
                  style={{
                    marginTop: "10px",
                    display: "flex",
                    width: "100%",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "4px",
                    padding: "9px 12px",
                    borderRadius: "12px",
                    fontSize: "12px",
                    fontWeight: 700,
                    ...(locked
                      ? {
                          background: "#FFFFFF",
                          color: "var(--cyp-muted)",
                          border: "1px solid rgba(11,11,11,0.15)",
                        }
                      : { background: "var(--cyp-black)", color: "var(--cyp-cream)" }),
                  }}
                >
                  Lihat Detail
                  {locked ? null : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  )}
                </span>
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
