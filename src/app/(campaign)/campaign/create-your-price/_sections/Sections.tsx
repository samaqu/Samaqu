import Image from "next/image";
import {
  CYP_ASSETS,
  GUARANTEES,
  INFO_BAR,
  REASONS,
  STEPS,
  VIDEO_ANCHOR,
} from "@/lib/campaign/create-your-price-content";

import s from "../campaign.module.css";
import StoryVideo from "./StoryVideo";
import FaqAccordion from "./FaqAccordion";
import CampaignWaLink from "./CampaignWaLink";
import CampaignOrderCta from "./CampaignOrderCta";

/* ── Section 2 — info bar ── */
export function InfoBarSection() {
  return (
    <div style={{ background: "var(--cyp-cream-2)", padding: "14px 20px" }}>
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "8px 28px",
          fontSize: "13px",
          fontWeight: 500,
        }}
      >
        {INFO_BAR.map((text, index) => (
          <span key={text} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              {index === 0 ? (
                <path d="M5 12l5 5L19 7" />
              ) : (
                <path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5" />
              )}
            </svg>
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Section 3 — video + 3 alasan ── */
export function VideoSection() {
  return (
    <section id={VIDEO_ANCHOR} className={s.sec} style={{ padding: "96px 20px 24px" }}>
      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))",
          gap: "56px",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
          <div className={s.tEyebrow} style={{ color: "var(--cyp-muted)" }}>
            KENAPA KAMI MEMBUAT INI
          </div>
          <h2 className={s.tH2} style={{ margin: 0 }}>
            Kami tahu rasanya menyukai sebuah produk, tapi harus <em>mundur karena harganya.</em>
          </h2>
          <p className={s.tBody} style={{ margin: 0, fontSize: "17px", lineHeight: 1.7, color: "var(--cyp-body)" }}>
            Samaqu juga dimulai oleh orang biasa. Karena itu kami membuat Create Your Price, supaya
            kualitas yang baik bisa dijangkau lebih banyak orang.
          </p>

          <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0, position: "relative" }}>
            <li
              aria-hidden="true"
              style={{
                position: "absolute",
                left: "19px",
                top: "40px",
                bottom: "40px",
                borderLeft: "1.5px dashed var(--cyp-black)",
              }}
            />
            {REASONS.map((reason, index) => {
              const last = index === REASONS.length - 1;
              return (
                <li
                  key={reason.title}
                  style={{
                    position: "relative",
                    display: "flex",
                    gap: "18px",
                    alignItems: "flex-start",
                    padding: last ? 0 : "0 0 26px",
                  }}
                >
                  <span
                    style={{
                      position: "relative",
                      zIndex: 1,
                      flex: "0 0 40px",
                      width: "40px",
                      height: "40px",
                      borderRadius: "50%",
                      background: "var(--cyp-cream)",
                      border: "1.5px dashed var(--cyp-black)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "12px",
                      fontWeight: 700,
                      letterSpacing: "0.5px",
                    }}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      padding: last ? "8px 0 0" : "8px 0 22px",
                      borderBottom: last ? undefined : "1.5px dashed var(--cyp-faint)",
                    }}
                  >
                    <div style={{ fontSize: "17px", fontWeight: 700 }}>{reason.title}</div>
                    <div style={{ fontSize: "15px", lineHeight: 1.55, color: "var(--cyp-body)", marginTop: "4px" }}>
                      {reason.body}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <StoryVideo />
      </div>
    </section>
  );
}

/* ── Section 5 — cara kerja ── */
export function StepsSection() {
  const icons = [
    <path key="1" d="M3 7h18M6 7l1 13h10l1-13M9 7V5a3 3 0 0 1 6 0v2" />,
    <g key="2">
      <path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </g>,
    <g key="3">
      <path d="M3 7l9-4 9 4v10l-9 4-9-4z" />
      <path d="M3 7l9 4 9-4M12 11v10" />
    </g>,
  ];

  return (
    <section id="cara" className={`${s.sec} ${s.sec0}`} style={{ padding: "0 20px 104px" }}>
      <div
        style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "32px" }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div className={s.tEyebrow} style={{ color: "var(--cyp-muted)" }}>
            CARA KERJA
          </div>
          <h2 className={s.tH2} style={{ margin: 0 }}>Cukup tiga langkah.</h2>
        </div>

        <div className={s.steps}>
          {STEPS.map((step, index) => (
            <div
              key={step.title}
              className={s.step}
              style={{
                background: "#FFFFFF",
                border: "1px solid var(--cyp-line)",
                borderRadius: "20px",
                padding: "28px",
                display: "flex",
                flexDirection: "column",
                gap: "18px",
              }}
            >
              <div
                style={{
                  flex: "0 0 48px",
                  width: "48px",
                  height: "48px",
                  borderRadius: "14px",
                  background: "var(--cyp-black)",
                  color: "var(--cyp-cream)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                  {icons[index]}
                </svg>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ fontSize: "17px", fontWeight: 700 }}>{step.title}</div>
                <div style={{ fontSize: "15px", lineHeight: 1.55, color: "var(--cyp-body)" }}>{step.body}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Section 6 — "Pilih harga minimum? Tentu boleh." ── */
export function MinimumPriceSection() {
  return (
    <section className={`${s.sec} ${s.sec0}`} style={{ padding: "0 20px 104px" }}>
      <div
        style={{
          maxWidth: "900px",
          margin: "0 auto",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          gap: "18px",
          alignItems: "center",
        }}
      >
        <h2
          className={s.tH2}
          style={{ margin: 0, fontSize: "clamp(40px, 6vw, 80px)", lineHeight: 1.04, letterSpacing: "-0.5px" }}
        >
          Pilih harga minimum?
          <br />
          <em>Tentu boleh.</em>
        </h2>
        <p className={s.tBody} style={{ margin: 0, fontSize: "18px", lineHeight: 1.7, color: "var(--cyp-body)" }}>
          Tidak perlu sungkan. Produk dan kualitasnya sama persis dengan yang memilih harga lebih tinggi.
        </p>
      </div>
    </section>
  );
}

/* ── Section 7 — gelap "Bukan diskon. Bukan promo." ── */
export function NotPromoSection() {
  const notItems = ["Diskon", "Promo", "Program sementara"];

  return (
    <section
      className={s.sec}
      style={{
        background: "var(--cyp-black)",
        color: "var(--cyp-cream)",
        padding: "112px 20px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        className={s.glow}
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: "900px",
          height: "900px",
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(244,241,234,0.08) 0%, rgba(11,11,11,0) 60%)",
        }}
      />
      <div
        style={{ position: "relative", maxWidth: "900px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "30px" }}
      >
        <div
          className={s.tEyebrow}
          style={{ display: "flex", gap: "14px", alignItems: "center", color: "var(--cyp-faint)" }}
        >
          <span style={{ width: "32px", height: "1px", background: "var(--cyp-faint-2)" }} />
          <span>BUKAN PROGRAM SEMENTARA</span>
        </div>

        <h2
          className={s.tH2}
          style={{ margin: 0, fontSize: "clamp(40px, 5.6vw, 76px)", lineHeight: 1.04, letterSpacing: "-0.5px" }}
        >
          Bukan diskon. Bukan promo.
          <br />
          <em>Cara kami, untuk seterusnya.</em>
        </h2>

        <p className={s.tBody} style={{ margin: 0, fontSize: "18px", lineHeight: 1.7, color: "var(--cyp-faint)" }}>
          Ini cara Samaqu supaya kualitas yang baik lebih mudah dijangkau orang biasa. Seiring Samaqu
          tumbuh, harga minimum yang kami tawarkan ingin makin terjangkau, tanpa meninggalkan mereka
          yang sudah bersama kami sejak awal.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
            gap: "12px",
            paddingTop: "6px",
          }}
        >
          {notItems.map((item) => (
            <div
              key={item}
              style={{
                border: "1px solid rgba(244,241,234,0.18)",
                borderRadius: "16px",
                padding: "18px 20px",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              <span style={{ fontSize: "12px", color: "var(--cyp-faint-2)", letterSpacing: "1px" }}>BUKAN</span>
              <span style={{ fontSize: "17px", fontWeight: 700 }}>{item}</span>
            </div>
          ))}
          <div
            style={{
              background: "var(--cyp-cream)",
              color: "var(--cyp-black)",
              borderRadius: "16px",
              padding: "18px 20px",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}
          >
            <span style={{ fontSize: "12px", color: "var(--cyp-muted)", letterSpacing: "1px" }}>TAPI</span>
            <span style={{ fontSize: "17px", fontWeight: 700 }}>Untuk seterusnya</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Section 8 — jaminan ── */
export function GuaranteeSection() {
  const icons = [
    <g key="1">
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </g>,
    <g key="2">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </g>,
    <path key="3" d="M7 7h11l-3-3M17 17H6l3 3" />,
    <path key="4" d="M21 12a9 9 0 0 1-13.5 7.8L3 21l1.2-4.4A9 9 0 1 1 21 12z" />,
  ];

  return (
    <section className={s.sec} style={{ padding: "104px 20px" }}>
      <div
        style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "32px" }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div className={s.tEyebrow} style={{ color: "var(--cyp-muted)" }}>BELI TANPA RAGU</div>
          <h2 className={s.tH2} style={{ margin: 0 }}>Harga minimum, jaminannya tetap penuh.</h2>
        </div>

        <div className={s.trustGrid}>
          {GUARANTEES.map((label, index) => (
            <div
              key={label}
              style={{
                background: "var(--cyp-cream-3)",
                border: "1px solid var(--cyp-line-soft)",
                borderRadius: "20px",
                padding: "28px 16px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "16px",
                textAlign: "center",
              }}
            >
              <svg
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--cyp-black)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {icons[index]}
              </svg>
              <div style={{ fontSize: "16px", fontWeight: 700, lineHeight: 1.3 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Section 9 — FAQ ── */
export function FaqSection() {
  return (
    <section className={`${s.sec} ${s.sec0}`} style={{ padding: "0 20px 104px" }}>
      <div style={{ maxWidth: "820px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "24px" }}>
        <h2 className={s.tH2} style={{ margin: 0, fontSize: "clamp(32px, 4vw, 48px)", letterSpacing: "-0.4px" }}>
          Yang sering ditanyakan
        </h2>
        <FaqAccordion />
      </div>
    </section>
  );
}

/* ── Section 10 — CTA penutup + video jahitan ── */
export function ClosingCtaSection({ waHref, orderHref }: { waHref: string | null; orderHref: string }) {
  return (
    <section className={`${s.sec} ${s.sec0}`} style={{ padding: "0 20px 112px" }}>
      <div
        className={s.ctaCard}
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          background: "var(--cyp-black)",
          color: "var(--cyp-cream)",
          borderRadius: "28px",
          overflow: "hidden",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))",
          alignItems: "stretch",
        }}
      >
        <div
          style={{
            padding: "clamp(32px, 5vw, 72px)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: "26px",
          }}
        >
          <div
            className={s.tEyebrow}
            style={{ display: "flex", gap: "14px", alignItems: "center", color: "var(--cyp-faint)" }}
          >
            <span style={{ width: "32px", height: "1px", background: "var(--cyp-faint-2)" }} />
            <span>CREATE YOUR PRICE</span>
          </div>

          <h2
            className={s.tH2}
            style={{ margin: 0, fontSize: "clamp(34px, 3.6vw, 52px)", lineHeight: 1.08, letterSpacing: "-0.4px" }}
          >
            Kemampuan kita mungkin berbeda.{" "}
            <em>Tapi kualitas yang baik seharusnya bisa dirasakan lebih banyak orang.</em>
          </h2>

          <p
            className={s.tBody}
            style={{ margin: 0, fontSize: "17px", lineHeight: 1.7, color: "var(--cyp-faint)", maxWidth: "440px" }}
          >
            Pilih harga terbaikmu, mulai dari harga minimum. Produk dan kualitasnya tetap sama.
          </p>

          <div
            className={s.btnRow}
            style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px", maxWidth: "460px" }}
          >
            <CampaignOrderCta variant="closing-primary" label="Mulai Pilih Hargamu" href={orderHref} arrow />
            <CampaignWaLink
              href={waHref}
              style={{
                color: "var(--cyp-cream)",
                textDecoration: "none",
                fontWeight: 500,
                fontSize: "15px",
                height: "56px",
                borderRadius: "999px",
                border: "1px solid rgba(244,241,234,0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M21 12a9 9 0 0 1-13.5 7.8L3 21l1.2-4.4A9 9 0 1 1 21 12z" />
              </svg>
              Tanya Admin
            </CampaignWaLink>
          </div>
        </div>

        <div className={s.ctaMedia} style={{ position: "relative", minHeight: "480px", background: "var(--cyp-cream)" }}>
          <video
            src={CYP_ASSETS.stitchVideo}
            poster={CYP_ASSETS.stitchPoster}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-label="Animasi benang menjahit thobe"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center 40%",
              display: "block",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "20px",
              bottom: "20px",
              background: "rgba(11,11,11,0.82)",
              color: "var(--cyp-cream)",
              fontSize: "12px",
              letterSpacing: "2px",
              padding: "8px 14px",
              borderRadius: "999px",
            }}
          >
            KUALITASNYA TETAP SAMA
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Footer ringkas + sticky CTA bawah ── */
export function CampaignFooter({ waHref, orderHref, fromPrice }: { waHref: string | null; orderHref: string; fromPrice: string }) {
  return (
    <>
      <footer style={{ borderTop: "1px solid var(--cyp-line-soft)", padding: "28px 20px 120px" }}>
        <div
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "16px",
            fontSize: "14px",
            color: "var(--cyp-muted)",
          }}
        >
          <Image
            src={CYP_ASSETS.logo}
            alt="SAMAQU"
            width={88}
            height={16}
            style={{ height: "16px", width: "auto" }}
          />
          <div>© 2026 Samaqu</div>
        </div>
      </footer>

      <div
        style={{
          position: "sticky",
          bottom: 0,
          left: 0,
          right: 0,
          background: "rgba(11,11,11,0.96)",
          padding: "12px 16px",
          zIndex: 40,
          paddingBottom: "max(12px, env(safe-area-inset-bottom))",
        }}
      >
        <div style={{ maxWidth: "760px", margin: "0 auto", display: "flex", gap: "12px", alignItems: "center" }}>
          <div
            className={s.stickyPrice}
            style={{ color: "var(--cyp-cream)", display: "flex", flexDirection: "column", gap: "2px", flex: "0 0 auto" }}
          >
            <span style={{ fontSize: "11px", letterSpacing: "1px", color: "var(--cyp-faint-2)" }}>MULAI DARI</span>
            <span className={s.num} style={{ fontSize: "20px", fontWeight: 700, lineHeight: 1 }}>
              {fromPrice}
            </span>
          </div>

          <CampaignOrderCta variant="sticky" label="Mulai Pilih Hargamu" href={orderHref} />

          <CampaignWaLink
            href={waHref}
            ariaLabel="Chat WhatsApp"
            style={{
              flex: "0 0 52px",
              height: "52px",
              borderRadius: "999px",
              border: "1px solid rgba(244,241,234,0.4)",
              color: "var(--cyp-cream)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M21 12a9 9 0 0 1-13.5 7.8L3 21l1.2-4.4A9 9 0 1 1 21 12z" />
            </svg>
          </CampaignWaLink>
        </div>
      </div>
    </>
  );
}

