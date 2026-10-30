"use client";

import type { PaymentMethodChoice } from "./types";

/**
 * Kartu radio pilihan metode pembayaran (langkah 1 top up).
 * Kartu QRIS hanya muncul kalau admin sudah mengunggah gambar QRIS.
 */
export default function MethodCards({
  hasQris,
  value,
  onChange,
}: {
  hasQris: boolean;
  value: PaymentMethodChoice;
  onChange: (method: PaymentMethodChoice) => void;
}) {
  const card = (method: PaymentMethodChoice, title: string, desc: string) => {
    const active = value === method;
    return (
      <button
        type="button"
        onClick={() => onChange(method)}
        aria-pressed={active}
        className="pick-row"
        style={{
          borderColor: active ? "var(--rs-ink)" : undefined,
          background: active ? "#fafaf8" : undefined,
          alignItems: "flex-start",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 16,
            height: 16,
            borderRadius: 999,
            border: `2px solid ${active ? "var(--rs-ink)" : "#c7c7c2"}`,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 2,
            flex: "none",
          }}
        >
          {active ? (
            <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--rs-ink)" }} />
          ) : null}
        </span>
        <span style={{ minWidth: 0 }}>
          <span className="bold" style={{ display: "block", fontSize: 13.5 }}>
            {title}
          </span>
          <span className="small muted" style={{ display: "block", marginTop: 2 }}>
            {desc}
          </span>
        </span>
      </button>
    );
  };

  return (
    <div className="stack" style={{ gap: 8 }}>
      {hasQris ? card("qris", "QRIS", "Scan pakai e-wallet / m-banking apa saja") : null}
      {card("bsi", "Transfer Bank BSI", "Transfer manual ke rekening SAMAQU")}
    </div>
  );
}
