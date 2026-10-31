"use client";

import { useState } from "react";
import { ADMIN_WA_LINK, PROMO_FAQ } from "@/lib/promo/free-cover-hanger";

/** FAQ accordion — satu item terbuka pada satu waktu. */
export function PromoFaq() {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <div className="fch-sheet" style={{ background: "#FFFFFF" }}>
      <div className="fch-wrap fch-sec fch-two" style={{ alignItems: "start" }}>
        <div className="fch-rv" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <h2 className="fch-disp fch-h-sec" style={{ fontWeight: 900 }}>
            {PROMO_FAQ.title}
          </h2>
          <p style={{ margin: 0, fontSize: 18, color: "#3D3D3D", lineHeight: 1.7, maxWidth: "26em" }}>
            {PROMO_FAQ.description}
          </p>
          <a
            href={ADMIN_WA_LINK}
            className="fch-btn-line"
            style={{
              alignSelf: "flex-start",
              border: "1.5px solid #000000",
              color: "#000000",
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 16,
              padding: "0 24px",
              height: 52,
              borderRadius: 999,
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            {PROMO_FAQ.chatLabel}
          </a>
        </div>

        <div style={{ display: "flex", flexDirection: "column", borderTop: "1.5px solid #000000" }}>
          {PROMO_FAQ.items.map((item, index) => {
            const open = openIndex === index;
            return (
              <div key={item.question} style={{ borderBottom: "1.5px solid #000000" }}>
                <button
                  type="button"
                  className="fch-faq-q"
                  onClick={() => setOpenIndex(open ? -1 : index)}
                  aria-expanded={open}
                  style={{
                    width: "100%",
                    background: "none",
                    border: "none",
                    textAlign: "left",
                    padding: "24px 0",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 20,
                    cursor: "pointer",
                    fontFamily: "'Instrument Sans', system-ui, sans-serif",
                    fontSize: 18,
                    fontWeight: 600,
                    color: "#000000",
                    minHeight: 44,
                  }}
                >
                  <span>{item.question}</span>
                  <span
                    style={{
                      flexShrink: 0,
                      width: 38,
                      height: 38,
                      borderRadius: "50%",
                      background: open ? "#000000" : "#FFFFFF",
                      color: open ? "#FFFFFF" : "#000000",
                      border: "1.5px solid #000000",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "background .25s ease",
                    }}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      style={{ transition: "transform .3s ease", transform: open ? "rotate(45deg)" : "rotate(0deg)" }}
                    >
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </span>
                </button>
                {open ? (
                  <div
                    className="fch-fu fch-faq-a"
                    style={{
                      animationDelay: "0s",
                      padding: "0 56px 26px 0",
                      fontSize: 16,
                      color: "#3D3D3D",
                      lineHeight: 1.7,
                    }}
                  >
                    {item.answer}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
