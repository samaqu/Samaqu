import { PROMO_FOOTER } from "@/lib/promo/free-cover-hanger";

/** Footer gelap: logo + tagline. */
export function PromoFooter() {
  return (
    <div style={{ background: "#000000", color: "#FFFFFF" }}>
      <div
        className="fch-wrap fch-footer-pad"
        style={{
          paddingTop: 36,
          paddingBottom: 60,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div className="fch-disp" style={{ fontSize: 30, letterSpacing: "0.14em", lineHeight: 1 }}>
          {PROMO_FOOTER.logo}
        </div>
        <div style={{ fontSize: 15, color: "#BDBDB8" }}>{PROMO_FOOTER.tagline}</div>
      </div>
    </div>
  );
}
