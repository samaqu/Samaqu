import { ADMIN_WA_LINK, PROMO_CLOSING, katalogHref } from "@/lib/promo/free-cover-hanger";

const ctaBase: React.CSSProperties = {
  textDecoration: "none",
  fontWeight: 600,
  fontSize: 17,
  height: 60,
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
};

/** Penutup: ajakan terakhir dengan dua tombol. */
export function PromoClosing({ locale }: { locale: string }) {
  return (
    <div style={{ borderTop: "1.5px solid #000000" }}>
      <div
        className="fch-wrap fch-sec"
        style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 28 }}
      >
        <h2 className="fch-disp fch-rv" style={{ fontWeight: 900, fontSize: "clamp(54px, 10cqw, 150px)" }}>
          {PROMO_CLOSING.headlineTop}
          <br />
          <span style={{ WebkitTextStroke: "2.5px #000000", color: "transparent" }}>
            {PROMO_CLOSING.headlineOutline}
          </span>
        </h2>
        <p style={{ margin: 0, fontSize: 19, color: "#3D3D3D", maxWidth: "32em", lineHeight: 1.6 }}>
          {PROMO_CLOSING.description}
        </p>
        <div
          className="fch-cta-row"
          style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", width: "100%" }}
        >
          <a
            href={katalogHref(locale)}
            data-katalog-link=""
            className="fch-btn-ink"
            style={{ ...ctaBase, background: "#000000", color: "#FFFFFF", padding: "0 32px" }}
          >
            {PROMO_CLOSING.primaryCta}
          </a>
          <a
            href={ADMIN_WA_LINK}
            className="fch-btn-line"
            style={{ ...ctaBase, color: "#000000", border: "1.5px solid #000000", padding: "0 28px", boxSizing: "border-box" }}
          >
            {PROMO_CLOSING.secondaryCta}
          </a>
        </div>
      </div>
    </div>
  );
}
