"use client";

import { useState } from "react";
import PublicPhoto from "@/components/PublicPhoto";
import type { HeroData } from "../_data/products";
import s from "../campaign.module.css";

/**
 * Kartu demo harga interaktif di hero.
 *
 * Isinya datang dari produk CYP aktif pertama (`heroFromProducts()`), atau data statis
 * kalau tidak ada produk aktif. Hanya contoh tampilan — tidak memilih produk sungguhan
 * dan tidak menyentuh keranjang.
 */
export default function HeroPriceCard({ data }: { data: HeroData }) {
  const [picked, setPicked] = useState(0);
  const selected = data.options[picked] ?? data.options[0];

  return (
    <div className={s.floaty} style={{ position: "relative", width: "min(400px, 100%)" }}>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: "-16px",
          border: "1px solid rgba(244,241,234,0.25)",
          borderRadius: "34px",
        }}
      />
      <div
        className={s.priceCard}
        style={{
          position: "relative",
          background: "var(--cyp-cream)",
          color: "var(--cyp-black)",
          borderRadius: "26px",
          padding: "22px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          boxShadow: "0 40px 90px rgba(0,0,0,0.55)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
          <span
            style={{
              fontSize: "11px",
              letterSpacing: "2px",
              fontWeight: 700,
              border: "1px solid var(--cyp-black)",
              padding: "6px 10px",
              borderRadius: "999px",
            }}
          >
            CREATE YOUR PRICE
          </span>
        </div>

        <div
          className={s.cardPhoto}
          style={{
            aspectRatio: "4 / 5",
            background: "#F8F5F1",
            borderRadius: "16px",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {/* Sengaja `<img>`, bukan `next/image`: foto produk aktif bisa berasal dari host
              yang tidak terdaftar di `next.config.ts` (mis. R2 samaqu-media.samaqu.workers.dev).
              Sama seperti kartu di section produk. */}
          <PublicPhoto
            src={data.image}
            alt={data.photoAlt}
            sizes="400px"
            className="object-cover object-top"
            fallbackLabel={data.name}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "12px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0 }}>
            <div style={{ fontSize: "17px", fontWeight: 700 }}>{data.name}</div>
            <div style={{ fontSize: "13px", color: "var(--cyp-muted)" }}>{data.minimumLabel}</div>
          </div>
        </div>

        <div style={{ fontSize: "13px", fontWeight: 700 }}>Pilih hargamu</div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "8px" }}>
          {data.options.map((option, index) => {
            const on = picked === index;
            return (
              <button
                key={option.price}
                type="button"
                className={s.pill}
                onClick={() => setPicked(index)}
                aria-pressed={on}
                style={{
                  cursor: "pointer",
                  textAlign: "left",
                  padding: "12px 10px",
                  borderRadius: "14px",
                  fontFamily: "inherit",
                  minHeight: "64px",
                  width: "100%",
                  minWidth: 0,
                  boxSizing: "border-box",
                  background: on ? "var(--cyp-black)" : "transparent",
                  color: on ? "var(--cyp-cream)" : "var(--cyp-black)",
                  border: `1px solid ${on ? "var(--cyp-black)" : "var(--cyp-faint)"}`,
                }}
              >
                <span style={{ display: "block", fontSize: "10px", letterSpacing: "1px", opacity: 0.7 }}>
                  {option.label}
                </span>
                <span
                  className={s.num}
                  style={{
                    display: "block",
                    fontSize: "17px",
                    fontWeight: 700,
                    marginTop: "4px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {option.short}
                </span>
              </button>
            );
          })}
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: "14px",
            borderTop: "1px dashed var(--cyp-faint)",
            gap: "10px 12px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <span style={{ fontSize: "12px", color: "var(--cyp-muted)" }}>Kamu bayar</span>
            <span
              className={s.num}
              style={{ fontSize: "28px", fontWeight: 700, lineHeight: 1.1 }}
              aria-live="polite"
            >
              {selected.price}
            </span>
          </div>
          <span
            style={{
              fontSize: "12px",
              fontWeight: 700,
              background: "var(--cyp-black)",
              color: "var(--cyp-cream)",
              padding: "8px 12px",
              borderRadius: "999px",
            }}
          >
            Kualitas tetap sama
          </span>
        </div>
      </div>
    </div>
  );
}
