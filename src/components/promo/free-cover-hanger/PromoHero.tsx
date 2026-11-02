"use client";

import { useEffect, useRef } from "react";
import { PROMO_HERO, PROMO_WA_MESSAGE, katalogHref } from "@/lib/promo/free-cover-hanger";
import { getWhatsAppLink } from "@/lib/store-settings";

/**
 * Hero landing promo — diport 1:1 dari mockup "Hero Promo Gratis Cover Hanger - SAMAQU"
 * (`index.html` di folder Downloads pemilik). Tata letak, ukuran, urutan elemen di HP,
 * aset foto, dan seluruh timeline animasi 8 detik mengikuti mockup apa adanya.
 *
 * Tiga hal yang TIDAK boleh hilang saat markup ini diubah:
 * 1. `data-katalog-link` + `data-fch-placement="hero"` pada CTA katalog — dibaca
 *    `PromoCatalogParams` (membawa UTM/fbclid) dan `PromoPixel` (event PromoKatalogClick).
 * 2. `data-wa-number` + `data-fch-placement="hero"` pada CTA WhatsApp — dasar event
 *    `wa_click` di `PromoPixel`. Nomornya dari helper store settings.
 * 3. Stage berukuran tetap 358x400 yang diskalakan lewat `transform: scale()`, karena
 *    semua koordinat di dalamnya (foto, stempel, konfeti) ditulis pada kanvas 358x400.
 */

/** Kanvas desain stage, sama dengan mockup. */
const STAGE_W = 358;
const STAGE_H = 400;

/** Potongan konfeti: posisi + arah terbang (`--dx`/`--dy`/`--r` dibaca keyframe fchhConf). */
const KONFETI = [
  { left: 170, top: 286, w: 6, h: 10, bg: "#C9A866", dx: "-90px", dy: "-120px", r: "260deg" },
  { left: 176, top: 286, w: 5, h: 9, bg: "#111111", dx: "-40px", dy: "-150px", r: "-200deg" },
  { left: 182, top: 286, w: 6, h: 10, bg: "#E8D3A2", dx: "30px", dy: "-160px", r: "220deg" },
  { left: 188, top: 286, w: 5, h: 9, bg: "#C9A866", dx: "95px", dy: "-110px", r: "-260deg" },
  { left: 174, top: 286, w: 4, h: 8, bg: "#111111", dx: "-120px", dy: "-50px", r: "180deg" },
  { left: 184, top: 286, w: 4, h: 8, bg: "#C9A866", dx: "120px", dy: "-60px", r: "-180deg" },
  { left: 179, top: 286, w: 6, h: 6, bg: "#E8D3A2", dx: "-10px", dy: "-180px", r: "300deg" },
  { left: 186, top: 286, w: 5, h: 8, bg: "#111111", dx: "60px", dy: "-140px", r: "240deg" },
] as const;

const ANTON = "var(--font-anton), Anton, Impact, sans-serif";

export function PromoHero({ locale }: { locale: string }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const inner = innerRef.current;
    if (!stage || !inner) return;

    // Desain dikunci pada 358x400; seluruh isi diskalakan mengikuti lebar stage.
    const fit = () => {
      inner.style.transform = `scale(${stage.clientWidth / STAGE_W})`;
    };
    fit();

    let resizeObserver: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(fit);
      resizeObserver.observe(stage);
    } else {
      window.addEventListener("resize", fit);
    }

    // Animasi berhenti saat hero keluar layar — hemat baterai, sama seperti mockup.
    let intersectionObserver: IntersectionObserver | undefined;
    if (typeof IntersectionObserver !== "undefined") {
      intersectionObserver = new IntersectionObserver((entries) => {
        stage.classList.toggle("fchh-paused", !entries[0]?.isIntersecting);
      });
      intersectionObserver.observe(stage);
    }

    return () => {
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, []);

  return (
    <section className="fchh-hero" aria-label="Promo Gratis Cover Hanger">
      <div className="fchh-text">
        <h1 className="fchh-title">
          <span className="fchh-nw">{PROMO_HERO.headline[0]}</span>
          <br />
          <span className="fchh-nw">{PROMO_HERO.headline[1]}</span>
          <br />
          <span className="fchh-outline">{PROMO_HERO.headline[2]}</span>
        </h1>

        <p className="fchh-sub">{PROMO_HERO.description}</p>

        <div className="fchh-ctas">
          <a
            className="fchh-btn fchh-btn--ink fchh-cta"
            href={katalogHref(locale)}
            data-katalog-link=""
            data-fch-placement="hero"
          >
            {PROMO_HERO.primaryCta}
          </a>
          <a
            className="fchh-btn fchh-btn--line"
            href={getWhatsAppLink(PROMO_WA_MESSAGE)}
            data-wa-number=""
            data-fch-placement="hero"
          >
            {PROMO_HERO.secondaryCta}
          </a>
        </div>
      </div>

      <div className="fchh-visual">
        <div className="fchh-stage" ref={stageRef}>
          <div className="fchh-inner" ref={innerRef}>
            {/* Baju + cover/hanger, ikut bergoyang */}
            <div className="fchh-abs fchh-sway" style={{ left: 0, top: 0, width: STAGE_W, height: STAGE_H }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="fchh-abs fchh-baju"
                src="/promo/hero/baju-hanger.webp"
                alt="Thobe hitam SAMAQU tergantung di hanger kayu"
                style={{ left: 40, top: 8, width: 278, height: 347, objectFit: "contain" }}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="fchh-abs fchh-set"
                src="/promo/hero/cover-hanger-baru.webp"
                alt="Tiga cover hanger SAMAQU berlapis dengan hanger kayu"
                style={{ left: 40, top: 8, width: 278, height: 347, objectFit: "contain" }}
              />
            </div>

            {/* Teks yang muncul saat bonus masuk paket */}
            <div
              className="fchh-abs"
              aria-hidden="true"
              style={{
                left: 0,
                top: 38,
                width: STAGE_W,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                textAlign: "center",
                pointerEvents: "none",
              }}
            >
              <span className="fchh-word" style={{ fontSize: 10, fontWeight: 800, letterSpacing: 3, color: "#8A6D33" }}>
                BONUS SPESIAL DARI SAMAQU
              </span>
              <span style={{ display: "flex", gap: 8, fontFamily: ANTON, fontSize: 31, lineHeight: 1, textTransform: "uppercase" }}>
                <span className="fchh-word">Hadiah</span>
                <span className="fchh-word" style={{ animationDelay: ".12s" }}>order</span>
                <span className="fchh-word" style={{ animationDelay: ".24s" }}>pertamamu</span>
              </span>
              <span className="fchh-word" style={{ animationDelay: ".4s", fontSize: 12, fontWeight: 600, color: "#4A4A4A" }}>
                Cover + hanger, dibungkus buat kamu
              </span>
            </div>

            {/* Chip kecil di kiri bawah */}
            <div
              className="fchh-abs fchh-chip"
              style={{
                left: 12,
                bottom: 14,
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: "#FFFFFF",
                border: "1.5px solid #111111",
                borderRadius: 12,
                padding: "8px 12px 8px 10px",
                boxShadow: "3px 4px 0 #111111",
              }}
            >
              <svg
                aria-hidden="true"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#111111"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="8" width="18" height="4" rx="1" />
                <path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
                <path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5" />
              </svg>
              <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontSize: 12, fontWeight: 800 }}>Langsung masuk paket</span>
                <span style={{ fontSize: 10, color: "#4A4A4A" }}>Kamu nggak perlu klaim apa-apa</span>
              </span>
            </div>

            {/* Box hadiah + konfeti + stempel GRATIS */}
            <div
              className="fchh-abs fchh-box"
              aria-hidden="true"
              style={{ left: 0, top: 0, width: STAGE_W, height: STAGE_H, pointerEvents: "none" }}
            >
              <div
                className="fchh-abs fchh-rays"
                style={{
                  left: 49,
                  top: 186,
                  width: 260,
                  height: 260,
                  borderRadius: 130,
                  background:
                    "repeating-conic-gradient(from 0deg,rgba(201,168,102,.30) 0deg 10deg,rgba(201,168,102,0) 10deg 30deg)",
                  WebkitMaskImage: "radial-gradient(circle,#000 25%,transparent 70%)",
                  maskImage: "radial-gradient(circle,#000 25%,transparent 70%)",
                }}
              />
              <span
                className="fchh-abs"
                style={{ left: 109, top: 378, width: 140, height: 12, borderRadius: "50%", background: "rgba(0,0,0,.14)" }}
              />

              {KONFETI.map((piece, index) => (
                <span
                  key={index}
                  className="fchh-abs fchh-conf"
                  style={
                    {
                      left: piece.left,
                      top: piece.top,
                      width: piece.w,
                      height: piece.h,
                      background: piece.bg,
                      "--dx": piece.dx,
                      "--dy": piece.dy,
                      "--r": piece.r,
                    } as React.CSSProperties
                  }
                />
              ))}

              <div className="fchh-abs fchh-bouncer" style={{ left: 99, top: 236, width: 160, height: 146 }}>
                <svg className="fchh-abs" style={{ left: 5, top: 54 }} width="150" height="92" viewBox="0 0 150 92">
                  <rect x=".75" y=".75" width="148.5" height="90.5" rx="6" fill="#FFFFFF" stroke="#D6D0C4" strokeWidth="1.5" />
                  <rect x="1.5" y="1.5" width="147" height="9" fill="#E6E1D8" />
                  <rect x="120" y="1.5" width="28.5" height="89" fill="#000000" opacity=".035" />
                  <rect x="22" y="0" width="16" height="92" fill="#111111" />
                  <rect x="25" y="0" width="2.5" height="92" fill="#444444" />
                  <rect x="52" y="34" width="86" height=".8" fill="#111111" opacity=".5" />
                  <text
                    x="95"
                    y="53"
                    textAnchor="middle"
                    fontFamily="Inter,sans-serif"
                    fontSize="11"
                    fontWeight="800"
                    letterSpacing="3.5"
                    fill="#111111"
                  >
                    SAMAQU
                  </text>
                  <rect x="52" y="62" width="86" height=".8" fill="#111111" opacity=".5" />
                </svg>
                <span
                  className="fchh-abs"
                  style={{ left: 5, top: 54, width: 150, height: 92, overflow: "hidden", borderRadius: 6 }}
                >
                  <span
                    className="fchh-abs fchh-shine"
                    style={{
                      left: 0,
                      top: 0,
                      width: 40,
                      height: 92,
                      background:
                        "linear-gradient(100deg,rgba(201,168,102,0) 0%,rgba(201,168,102,.28) 50%,rgba(201,168,102,0) 100%)",
                    }}
                  />
                </span>
                <svg className="fchh-abs fchh-lid" style={{ left: 0, top: 0 }} width="160" height="58" viewBox="0 0 160 58">
                  <path d="M35 30 C19 10 5 8 7 20 C9 30 25 30 35 30 Z" fill="#111111" />
                  <path d="M35 30 C51 10 65 8 63 20 C61 30 45 30 35 30 Z" fill="#111111" />
                  <path d="M35 30 C21 16 13 15 13 21 C14 26 25 28 35 30 Z" fill="#555555" opacity=".6" />
                  <circle cx="35" cy="29" r="5" fill="#000000" />
                  <rect x=".75" y="30.75" width="158.5" height="26.5" rx="5" fill="#FFFFFF" stroke="#D6D0C4" strokeWidth="1.5" />
                  <rect x="1.5" y="51" width="157" height="6" rx="2" fill="#000000" opacity=".07" />
                  <rect x="27" y="30" width="16" height="28" fill="#111111" />
                  <rect x="30" y="30" width="2.5" height="28" fill="#444444" />
                </svg>
              </div>

              <svg className="fchh-abs fchh-spark" style={{ left: 82, top: 226 }} width="26" height="26" viewBox="0 0 24 24">
                <path d="M12 1 L14 10 L23 12 L14 14 L12 23 L10 14 L1 12 L10 10 Z" fill="#C9A866" />
              </svg>
              <svg className="fchh-abs fchh-spark" style={{ left: 262, top: 250 }} width="18" height="18" viewBox="0 0 24 24">
                <path d="M12 1 L14 10 L23 12 L14 14 L12 23 L10 14 L1 12 L10 10 Z" fill="#C9A866" />
              </svg>
              <svg className="fchh-abs fchh-spark" style={{ left: 70, top: 300 }} width="14" height="14" viewBox="0 0 24 24">
                <path d="M12 1 L14 10 L23 12 L14 14 L12 23 L10 14 L1 12 L10 10 Z" fill="#111111" />
              </svg>

              <div
                className="fchh-abs fchh-stamp"
                style={{
                  left: 232,
                  top: 190,
                  width: 88,
                  height: 88,
                  borderRadius: 44,
                  background: "#FFFFFF",
                  border: "3px solid #111111",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 1,
                }}
              >
                <span className="fchh-abs" style={{ inset: 5, borderRadius: "50%", border: "1.5px dashed #111111" }} />
                <span style={{ fontFamily: ANTON, fontSize: 22, lineHeight: 1 }}>GRATIS</span>
                <span style={{ fontSize: 11, fontWeight: 800 }}>Rp35.000</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
