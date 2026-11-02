import Image from "next/image";
import Link from "next/link";
import {
  CYP_ASSETS,
  HERO_FROM_PRICE,
  VIDEO_ANCHOR,
} from "@/lib/campaign/create-your-price-content";
import s from "../campaign.module.css";
import HeroPriceCard from "./HeroPriceCard";
import CampaignOrderCta from "./CampaignOrderCta";

/** Section 1 — hero gelap + kartu demo harga interaktif. */
export default function HeroSection({ orderHref }: { orderHref: string }) {
  return (
    <section
      style={{
        background: "var(--cyp-black)",
        color: "var(--cyp-cream)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        className={s.glow}
        aria-hidden="true"
        style={{
          position: "absolute",
          right: "4%",
          top: "-14%",
          width: "780px",
          height: "780px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(244,241,234,0.16) 0%, rgba(11,11,11,0) 62%)",
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: "24px",
          textAlign: "center",
          fontFamily: "var(--cyp-serif)",
          fontSize: "clamp(110px, 17vw, 270px)",
          lineHeight: 0.85,
          color: "transparent",
          WebkitTextStroke: "1px rgba(244,241,234,0.09)",
          whiteSpace: "nowrap",
        }}
      >
        Your Price
      </div>

      <div
        style={{
          position: "relative",
          maxWidth: "1240px",
          margin: "0 auto",
          padding: "24px 24px 0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Image
          src={CYP_ASSETS.logo}
          alt="SAMAQU"
          width={120}
          height={22}
          priority
          style={{ height: "22px", width: "auto", filter: "invert(1)" }}
        />
        <CampaignOrderCta variant="ghost-pill" label="Open Order" href={orderHref} />
      </div>

      <div
        style={{
          position: "relative",
          maxWidth: "1240px",
          margin: "0 auto",
          padding: "56px 24px 112px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 480px), 1fr))",
          gap: "64px",
          alignItems: "center",
        }}
      >
        <div className={s.heroCopy} style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
          <div
            className={`${s.r1} ${s.tEyebrow}`}
            style={{ display: "flex", gap: "14px", alignItems: "center", letterSpacing: "4px" }}
          >
            <span style={{ flex: "0 0 40px", height: "1px", background: "var(--cyp-cream)" }} />
            <span>CREATE YOUR PRICE</span>
          </div>

          <h1
            className={`${s.r2} ${s.heroTitle}`}
            style={{
              margin: 0,
              fontFamily: "var(--cyp-serif)",
              fontWeight: 500,
              lineHeight: 1.06,
              letterSpacing: "-0.5px",
            }}
          >
            <span style={{ display: "block", whiteSpace: "nowrap" }}>Harga baju ini,</span>
            <em style={{ display: "block", whiteSpace: "nowrap" }}>kamu yang tentukan.</em>
          </h1>

          <p
            className={`${s.r3} ${s.tBody}`}
            style={{
              margin: 0,
              fontSize: "18px",
              lineHeight: 1.7,
              color: "var(--cyp-faint)",
              maxWidth: "470px",
            }}
          >
            Di Samaqu, kamu bisa memilih hargamu sendiri, mulai dari harga minimum. Bayar berapa pun,
            produk dan kualitasnya tetap sama.
          </p>

          <div className={s.r4} style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
              <span style={{ fontSize: "13px", letterSpacing: "2px", color: "var(--cyp-faint-2)" }}>
                MULAI DARI
              </span>
              <span className={s.num} style={{ fontSize: "44px", fontWeight: 700, lineHeight: 1 }}>
                {HERO_FROM_PRICE}
              </span>
            </div>

            <div className={s.btnRow} style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
              <CampaignOrderCta variant="primary" label="Mulai Pilih Hargamu" href={orderHref} arrow />
              <a
                href={`#${VIDEO_ANCHOR}`}
                style={{
                  color: "var(--cyp-cream)",
                  textDecoration: "none",
                  fontWeight: 500,
                  fontSize: "15px",
                  padding: "18px 26px",
                  borderRadius: "999px",
                  border: "1px solid rgba(244,241,234,0.4)",
                  display: "flex",
                  gap: "10px",
                  alignItems: "center",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M10 8.5l5 3.5-5 3.5z" />
                </svg>
                Tonton videonya
              </a>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "center" }}>
          <HeroPriceCard />
        </div>
      </div>
    </section>
  );
}
