"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useSafeTranslations } from "@/lib/safe-i18n";

export default function CreateYourPrice() {
  const t = useSafeTranslations("cyp");
  const [price, setPrice] = useState(249000);
  const minPrice = 249000;
  const maxPrice = 599000;

  const fmt = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;
  const pct = ((price - minPrice) / (maxPrice - minPrice)) * 100;

  const note =
    price === minPrice
      ? t("noteMin")
      : price >= maxPrice
        ? t("noteMax")
        : t("noteMid");

  const handleSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setPrice(Number(e.target.value));
  }, []);

  return (
    <section
      id="cyp"
      className="relative overflow-hidden min-h-screen flex items-center"
      style={{ background: "#000000", color: "#ffffff" }}
    >
      {/* Hero photo background — dibuat hitam-putih (grayscale) */}
      <div
        className="absolute inset-0 opacity-25"
        style={{
          backgroundImage: "url(/images/c8a0800b-b9bb-4b53-bd5e-00f26a500219.webp)",
          backgroundSize: "cover",
          backgroundPosition: "60% 50%",
          filter: "grayscale(1)",
        }}
      />

      {/* Gradient overlay */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to right, #000000, rgba(0,0,0,.95) 40%, rgba(0,0,0,.70))",
        }}
      />

      {/* Content */}
      <div className="relative w-full mx-auto max-w-7xl px-5 sm:px-8 py-16 md:py-20 grid lg:grid-cols-[1.05fr_.95fr] gap-12 lg:gap-16 items-center">
        {/* Left: Copy */}
        <div>
          <div className="flex items-center gap-4 mb-6">
            <span className="h-px w-10" style={{ background: "#ffffff" }} />
            <span
              className="font-semibold font-ui"
              style={{
                letterSpacing: "0.28em",
                fontSize: "11px",
                color: "rgba(255,255,255,.7)",
              }}
            >
              {t("eyebrow").toUpperCase()}
            </span>
          </div>

          <h1
            className="font-semibold leading-[1.14] max-w-[20ch]"
            style={{
              fontFamily: "var(--font-cormorant), Georgia, serif",
              fontSize: "clamp(36px, 5vw, 58px)",
            }}
          >
            {t("title")}
          </h1>

          <ul className="mt-9 space-y-6 max-w-lg">
            <li className="flex gap-4 items-start">
              <span className="shrink-0 grid place-items-center w-11 h-11 rounded-full" style={{ background: "rgba(255,255,255,.08)" }}>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.6">
                  <circle cx="9" cy="8" r="3" />
                  <path d="M3 20a6 6 0 0 1 12 0" />
                  <path d="M16 11a3 3 0 1 0-1-5.8" />
                  <path d="M18 20a5 5 0 0 0-3-4.6" />
                </svg>
              </span>
              <p className="text-[15px] leading-relaxed pt-2" style={{ color: "rgba(255,255,255,.72)" }}>
                {t("bullet1")}
              </p>
            </li>
            <li className="flex gap-4 items-start">
              <span className="shrink-0 grid place-items-center w-11 h-11 rounded-full" style={{ background: "rgba(255,255,255,.08)" }}>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.6">
                  <path d="M3 12V4h8l9 9-8 8-9-9Z" />
                  <circle cx="7.5" cy="7.5" r="1.3" fill="#ffffff" stroke="none" />
                </svg>
              </span>
              <p className="text-[15px] leading-relaxed pt-2" style={{ color: "rgba(255,255,255,.72)" }}>
                {t("bullet2")}
              </p>
            </li>
            <li className="flex gap-4 items-start">
              <span className="shrink-0 grid place-items-center w-11 h-11 rounded-full" style={{ background: "rgba(255,255,255,.08)" }}>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.6">
                  <path d="M4 20V10" />
                  <path d="M10 20V4" />
                  <path d="M16 20v-7" />
                  <path d="M22 20H2" />
                </svg>
              </span>
              <p className="text-[15px] leading-relaxed pt-2" style={{ color: "rgba(255,255,255,.72)" }}>
                {t("bullet3")}
              </p>
            </li>
          </ul>

          <Link
            href="/create-your-price"
            className="mt-10 inline-flex items-center gap-3 rounded-full font-bold text-[13px] tracking-wide px-8 py-4 transition-colors duration-200"
            style={{
              background: "#ffffff",
              color: "#000000",
            }}
          >
            {t("ctaLearn").toUpperCase()}
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>

        {/* Right: Interactive card */}
        <div
          className="rounded-2xl p-6 sm:p-8 backdrop-blur-sm"
          style={{
            border: "1px solid rgba(255,255,255,.14)",
            background: "rgba(255,255,255,.05)",
            boxShadow: "0 25px 50px -12px rgba(0,0,0,.6)",
          }}
        >
          <div className="flex items-center justify-between gap-4">
            <span
              className="font-semibold font-ui"
              style={{
                letterSpacing: "0.28em",
                fontSize: "11px",
                color: "rgba(255,255,255,.7)",
              }}
            >
              {t("cardTitle").toUpperCase()}
            </span>
            <span
              className="rounded-full text-[11px] font-semibold tracking-wide px-4 py-1.5 font-ui"
              style={{ background: "rgba(255,255,255,.12)", color: "#ffffff" }}
            >
              {t("cardBadge").toUpperCase()}
            </span>
          </div>

          <p
            className="mt-6 font-bold tabular-nums"
            style={{ fontSize: "clamp(38px, 4vw, 44px)" }}
          >
            {fmt(price)}
          </p>
          <p className="mt-2 text-[14px] leading-relaxed" style={{ color: "rgba(255,255,255,.6)" }}>
            {note}
          </p>

          <input
            type="range"
            min={minPrice}
            max={maxPrice}
            step={1000}
            value={price}
            onChange={handleSlider}
            className="cyp-slider mt-7"
            style={{ "--pct": `${pct}%` } as React.CSSProperties}
            aria-label={t("ariaSlider")}
          />
          <div
            className="mt-3 flex items-center justify-between text-[11px] tracking-wide font-ui"
            style={{ color: "rgba(255,255,255,.45)" }}
          >
            <span>MINIMUM</span>
            <span>{fmt(maxPrice)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
