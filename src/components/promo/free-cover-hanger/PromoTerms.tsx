import { PROMO_TERMS } from "@/lib/promo/free-cover-hanger";

/** Syarat program, ditampilkan sebagai label baju (hang tag). */
export function PromoTerms() {
  return (
    <div className="fch-sheet" style={{ background: "#000000", color: "#FFFFFF" }}>
      <div className="fch-wrap fch-sec fch-two">
        <div className="fch-rv" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <h2 className="fch-disp fch-h-sec" style={{ fontWeight: 900 }}>
            {PROMO_TERMS.title}
          </h2>
          <p style={{ margin: 0, fontSize: 18, lineHeight: 1.7, color: "#C8C8C3", maxWidth: "28em" }}>
            {PROMO_TERMS.description}
          </p>
        </div>

        <div className="fch-rv" style={{ justifySelf: "center", width: "100%", maxWidth: 440 }}>
          <div
            className="fch-tag"
            style={{
              background: "#FFFFFF",
              color: "#000000",
              borderRadius: 22,
              padding: "60px 30px 30px",
              position: "relative",
              transform: "rotate(-2deg)",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 22,
                left: "50%",
                transform: "translateX(-50%)",
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "#000000",
              }}
            />
            <div
              className="fch-disp"
              style={{
                fontSize: 38,
                fontWeight: 900,
                textAlign: "center",
                paddingBottom: 18,
                borderBottom: "1.5px dashed #000000",
              }}
            >
              {PROMO_TERMS.tagTitle}
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {PROMO_TERMS.rows.map((row) => (
                <div
                  key={row.key}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 16,
                    padding: "15px 0",
                    borderBottom: "1px solid #D6D5CF",
                    fontSize: 15,
                  }}
                >
                  <span style={{ color: "#3D3D3D" }}>{row.key}</span>
                  <span style={{ fontWeight: 700, textAlign: "right" }}>{row.value}</span>
                </div>
              ))}
            </div>
            <div style={{ paddingTop: 16, fontSize: 13, color: "#3D3D3D", textAlign: "center" }}>
              {PROMO_TERMS.footnote}
            </div>
          </div>
        </div>
      </div>
      <div className="fch-sheet-gap" />
    </div>
  );
}
