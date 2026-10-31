import { PROMO_STEPS } from "@/lib/promo/free-cover-hanger";

/** Tiga langkah mengambil bonus. */
export function PromoSteps() {
  return (
    <div className="fch-sheet" style={{ background: "#FFFFFF" }}>
      <div className="fch-wrap fch-sec">
        <h2 className="fch-disp fch-h-sec fch-rv" style={{ fontWeight: 900, marginBottom: 48 }}>
          {PROMO_STEPS.title}
        </h2>
        <div
          className="fch-steps fch-rv"
          style={{ borderTop: "1.5px solid #000000", borderBottom: "1.5px solid #000000" }}
        >
          {PROMO_STEPS.items.map((step, index) => (
            <div
              key={step.number}
              className="fch-step"
              style={{
                padding: "36px 32px 40px",
                display: "flex",
                flexDirection: "column",
                gap: 16,
                borderLeft: index === 0 ? "none" : "1.5px solid #000000",
              }}
            >
              <div
                className="fch-disp fch-step-n"
                style={{
                  fontSize: 120,
                  fontWeight: 900,
                  WebkitTextStroke: "2px #000000",
                  color: "transparent",
                  lineHeight: 0.8,
                }}
              >
                {step.number}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="fch-step-t" style={{ fontWeight: 700, fontSize: 22 }}>
                  {step.title}
                </div>
                <div style={{ fontSize: 16, color: "#3D3D3D", lineHeight: 1.6, maxWidth: "22em" }}>
                  {step.description}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
