import { PROMO_ASSETS, PROMO_STORY } from "@/lib/promo/free-cover-hanger";

/** Section gelap: sambutan singkat + video program (autoplay, muted, loop, ada kontrol). */
export function PromoStory() {
  return (
    <div className="fch-sheet" style={{ background: "#000000", color: "#FFFFFF" }}>
      <div className="fch-wrap fch-sec fch-two">
        <div className="fch-rv" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <h2 className="fch-disp fch-h-sec" style={{ fontWeight: 900 }}>
            {PROMO_STORY.title}
          </h2>
          <p style={{ margin: 0, fontSize: 19, lineHeight: 1.7, color: "#C8C8C3", maxWidth: "30em" }}>
            {PROMO_STORY.description}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {PROMO_STORY.proofs.map((proof) => (
              <div key={proof} style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 17, fontWeight: 500 }}>
                <span
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    background: "#FFFFFF",
                    color: "#000000",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
                {proof}
              </div>
            ))}
          </div>
        </div>

        <div className="fch-rv fch-vid" style={{ justifySelf: "center", width: "100%", maxWidth: 360 }}>
          <div
            style={{
              aspectRatio: "9 / 16",
              borderRadius: 34,
              border: "6px solid #2B2B2B",
              background: "#000000",
              overflow: "hidden",
              position: "relative",
            }}
          >
            <video
              src={PROMO_ASSETS.video}
              poster={PROMO_ASSETS.poster}
              autoPlay
              muted
              loop
              playsInline
              controls
              preload="metadata"
              aria-label={PROMO_STORY.videoAlt}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          </div>
        </div>
      </div>
      <div className="fch-sheet-gap" />
    </div>
  );
}
