"use client";

import { useState } from "react";
import { FAQS } from "@/lib/campaign/create-your-price-content";

/**
 * FAQ accordion — satu item terbuka pada satu waktu (default item pertama), sama
 * seperti mockup (`openFaq: 0`). Klik item yang sedang terbuka menutupnya.
 */
export default function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {FAQS.map((faq, index) => {
        const open = openIndex === index;
        return (
          <div
            key={faq.q}
            style={{
              background: "#FFFFFF",
              border: "1px solid var(--cyp-line)",
              borderRadius: "16px",
              overflow: "hidden",
            }}
          >
            <button
              type="button"
              onClick={() => setOpenIndex(open ? -1 : index)}
              aria-expanded={open}
              style={{
                width: "100%",
                minHeight: "60px",
                padding: "18px 20px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "16px",
                background: "transparent",
                border: 0,
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "inherit",
                fontSize: "16px",
                fontWeight: 700,
                color: "var(--cyp-black)",
              }}
            >
              <span>{faq.q}</span>
              <span
                style={{
                  display: "flex",
                  flex: "0 0 auto",
                  transition: "transform .2s ease",
                  transform: `rotate(${open ? "45deg" : "0deg"})`,
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </span>
            </button>
            {open ? (
              <div style={{ padding: "0 20px 20px", fontSize: "15px", lineHeight: 1.6, color: "var(--cyp-body)" }}>
                {faq.a}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
