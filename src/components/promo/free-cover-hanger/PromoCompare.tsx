"use client";

import { useState } from "react";
import { PROMO_COMPARE } from "@/lib/promo/free-cover-hanger";
import { AfterIllustrationSvg, BeforeIllustrationSvg } from "./illustrations";

const labelStyle: React.CSSProperties = {
  position: "absolute",
  top: 16,
  fontSize: 13,
  fontWeight: 600,
  padding: "9px 14px",
  borderRadius: 999,
};

/** Slider geser "Digantung asal" ↔ "Dengan Cover Hanger". */
export function PromoCompare() {
  const [split, setSplit] = useState(50);

  return (
    <div className="fch-sheet" style={{ background: "#EEEDE8" }}>
      <div className="fch-wrap fch-sec fch-two">
        <div className="fch-rv" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <h2 className="fch-disp fch-h-sec" style={{ fontWeight: 900 }}>
            {PROMO_COMPARE.title}
          </h2>
          <p style={{ margin: 0, fontSize: 18, lineHeight: 1.7, color: "#3D3D3D", maxWidth: "30em" }}>
            {PROMO_COMPARE.description}
          </p>
          <div style={{ display: "flex", flexDirection: "column", borderTop: "1.5px solid #000000" }}>
            {PROMO_COMPARE.benefits.map((benefit) => (
              <div
                key={benefit.title}
                style={{
                  display: "flex",
                  gap: 18,
                  alignItems: "flex-start",
                  padding: "20px 0",
                  borderBottom: "1.5px solid #000000",
                }}
              >
                <div
                  style={{
                    width: 46,
                    height: 46,
                    flexShrink: 0,
                    borderRadius: "50%",
                    background: "#000000",
                    color: "#FFFFFF",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontWeight: 700, fontSize: 19 }}>{benefit.title}</div>
                  <div style={{ fontSize: 16, color: "#3D3D3D", lineHeight: 1.6 }}>{benefit.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div
            className="fch-ba"
            style={{
              position: "relative",
              aspectRatio: "4 / 5",
              borderRadius: 28,
              overflow: "hidden",
              background: "#FFFFFF",
              userSelect: "none",
              border: "1.5px solid #000000",
            }}
          >
            <div style={{ position: "absolute", inset: 0, background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <AfterIllustrationSvg />
              <div style={{ ...labelStyle, top: 16, right: 16, background: "#000000", color: "#FFFFFF" }}>
                {PROMO_COMPARE.afterLabel}
              </div>
            </div>

            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "#D6D5CF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                clipPath: `inset(0 ${100 - split}% 0 0)`,
              }}
            >
              <BeforeIllustrationSvg />
              <div style={{ ...labelStyle, left: 16, background: "#FFFFFF", color: "#000000" }}>
                {PROMO_COMPARE.beforeLabel}
              </div>
            </div>

            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${split}%`,
                width: 2,
                background: "#000000",
                transform: "translateX(-1px)",
                pointerEvents: "none",
              }}
            >
              <div
                className="fch-knob"
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  width: 54,
                  height: 54,
                  borderRadius: "50%",
                  background: "#000000",
                  color: "#FFFFFF",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M9 6l-6 6 6 6M15 6l6 6-6 6" />
                </svg>
              </div>
            </div>

            <label htmlFor="fch-ba-range" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
              {PROMO_COMPARE.sliderLabel}
            </label>
            <input
              id="fch-ba-range"
              type="range"
              min={0}
              max={100}
              value={split}
              onChange={(event) => setSplit(Number(event.target.value))}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                margin: 0,
                opacity: 0,
                cursor: "ew-resize",
              }}
            />
          </div>
          <div style={{ textAlign: "center", fontSize: 14, color: "#3D3D3D" }}>{PROMO_COMPARE.caption}</div>
        </div>
      </div>
      <div className="fch-sheet-gap" />
    </div>
  );
}
