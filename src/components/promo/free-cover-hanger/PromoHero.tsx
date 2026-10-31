import {
  ADMIN_WA_LINK,
  PROMO_FLAGS,
  PROMO_HERO,
  katalogHref,
} from "@/lib/promo/free-cover-hanger";
import { HeroStageSvg } from "./illustrations";
import { QuotaBar } from "./QuotaBar";

/** Gaya dasar tautan CTA — ukuran/padding/radius diatur `.fch-cta-row > a` di CSS. */
const ctaBase: React.CSSProperties = {
  textDecoration: "none",
  fontWeight: 600,
  fontSize: 17,
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
};

/** Hero: headline 3 baris (muncul per baris), deskripsi, 2 CTA, dan animasi Cover Hanger. */
export function PromoHero({ locale }: { locale: string }) {
  return (
    <div className="fch-wrap fch-hero fch-hero-pad" style={{ paddingTop: 64, paddingBottom: 80 }}>
      <div className="fch-hero-copy" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <h1 className="fch-disp fch-h-hero" style={{ fontWeight: 900 }}>
          <span className="fch-line">
            <span>{PROMO_HERO.headline[0]}</span>
          </span>
          <span className="fch-line fch-l2">
            <span>{PROMO_HERO.headline[1]}</span>
          </span>
          <span className="fch-line fch-l3">
            <span style={{ WebkitTextStroke: "2.5px #000000", color: "transparent" }}>
              {PROMO_HERO.headline[2]}
            </span>
          </span>
        </h1>

        <p
          className="fch-fu fch-hero-sub"
          style={{ margin: 0, fontSize: 20, lineHeight: 1.6, color: "#3D3D3D", maxWidth: "32em" }}
        >
          {PROMO_HERO.description}
        </p>

        {PROMO_FLAGS.showQuota ? <QuotaBar /> : null}

        <div className="fch-fu3 fch-cta-row">
          <a
            href={katalogHref(locale)}
            data-katalog-link=""
            data-fch-placement="hero"
            className="fch-btn-ink"
            style={{ ...ctaBase, background: "#000000", color: "#FFFFFF" }}
          >
            {PROMO_HERO.primaryCta}
          </a>
          <a
            href={ADMIN_WA_LINK}
            data-fch-placement="hero"
            className="fch-btn-line"
            style={{
              ...ctaBase,
              background: "#FFFFFF",
              color: "#000000",
              border: "1.5px solid #000000",
            }}
          >
            {PROMO_HERO.secondaryCta}
          </a>
        </div>
      </div>

      <div className="fch-stage" style={{ position: "relative", width: "100%", maxWidth: 480, justifySelf: "center" }}>
        <div
          style={{
            aspectRatio: "400 / 520",
            background: "#EEEDE8",
            borderRadius: "240px 240px 28px 28px",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <HeroStageSvg />
        </div>
        <div
          className="fch-hide-m"
          style={{
            position: "absolute",
            bottom: 26,
            left: -36,
            background: "#FFFFFF",
            border: "1.5px solid #000000",
            borderRadius: 14,
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            boxShadow: "6px 6px 0 #000000",
          }}
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#000000"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20 12v9H4v-9" />
            <path d="M2 7h20v5H2z" />
            <path d="M12 21V7" />
            <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
            <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
          </svg>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{PROMO_HERO.badgeTitle}</span>
            <span style={{ fontSize: 13, color: "#3D3D3D" }}>{PROMO_HERO.badgeSubtitle}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
