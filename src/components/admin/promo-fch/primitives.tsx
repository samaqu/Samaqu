/**
 * Token & primitif bersama halaman Promo Free Cover Hanger di panel admin.
 *
 * Mengapa gaya isian ditulis sebagai CSS kelas (`.pf-input`) dan bukan `style={}` biasa:
 * proyek ini memakai Tailwind v4 (`@import "tailwindcss"`), yang preflight-nya me-reset
 * `border` semua `input`/`textarea` ke 0. Inline style sebenarnya menang urutan, tapi
 * sejumlah reset di layer base tetap membuat kotak isian tampak polos. CSS kelas dengan
 * spesifisitas lebih tinggi di-scope ke halaman promo saja — CSS global TIDAK diubah.
 */

import type { CSSProperties, ReactNode } from "react";

/** Warna aksen halaman promo (tone biru pastel panel admin). */
export const PROMO_COLORS = {
  /** Gradasi tombol Simpan. */
  saveFrom: "#C7E6F9",
  saveTo: "#C6EEE2",
  saveBorder: "#9FD3F2",
  saveText: "#1F3B4D",
  /** Chip kategori aktif. */
  chipBg: "#D6EEFB",
  chipBorder: "#8CC8EE",
  chipText: "#1F3B4D",
  /** Toggle ON & progress bar. */
  accent: "#3B97D3",
  /** Toggle OFF. */
  toggleOff: "#CFC6BA",
  /** Teks aksen & angka penting. */
  ink: "#1F6FA3",
  /** Border isian & kartu. */
  fieldBorder: "#D9CFC1",
  cardBorder: "#ECE4D8",
} as const;

/** Warna teks. Label field sengaja gelap (bukan abu pucat). */
export const TEXT = "#1F3B4D";
export const TEXT_MUTED = "#5B6B78";
export const TEXT_DIM = "#7A8794";

/** CSS scoped halaman promo — tidak bocor ke halaman lain. */
export const PROMO_FORM_CSS = `
.pf-form .pf-input{
  box-sizing:border-box;
  width:100%;
  height:44px;
  padding:0 14px;
  background:#FFFFFF;
  color:${TEXT};
  border:1px solid ${PROMO_COLORS.fieldBorder};
  border-radius:10px;
  font-size:13px;
  line-height:1.4;
  outline:none;
  transition:border-color .15s ease,box-shadow .15s ease;
  -webkit-appearance:none;
  appearance:none;
}
.pf-form textarea.pf-input{
  height:auto;
  min-height:calc(1.6em * 3 + 24px);
  padding:11px 14px;
  line-height:1.6;
  resize:vertical;
}
.pf-form .pf-input::placeholder{color:#A9B2BA;}
.pf-form .pf-input:hover{border-color:#C6B9A6;}
.pf-form .pf-input:focus{
  border-color:${PROMO_COLORS.accent};
  box-shadow:0 0 0 3px rgba(59,151,211,.18);
}
.pf-form .pf-input:disabled{background:#F6F4F1;color:#8A96A1;cursor:not-allowed;}
/* Angka: spinner bawaan browser disembunyikan supaya rapi & tinggi tetap 44px. */
.pf-form .pf-input[type="number"]{-moz-appearance:textfield;}
.pf-form .pf-input[type="number"]::-webkit-outer-spin-button,
.pf-form .pf-input[type="number"]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;}
/* Isian tanggal dd/mm/yyyy di dalam PeriodeCard. */
.pf-form .pf-date{height:44px;padding:0 14px;text-align:center;font-variant-numeric:tabular-nums;}
.pf-form .pf-card{
  background:#FFFFFF;
  border:1px solid ${PROMO_COLORS.cardBorder};
  border-radius:16px;
  box-shadow:0 1px 2px rgba(31,59,77,.04),0 8px 24px -18px rgba(31,59,77,.25);
}
`;

/** Label field — teks gelap, bukan abu pucat. */
export function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-[11.5px] font-semibold uppercase tracking-[0.1em]"
      style={{ color: TEXT }}
    >
      {children}
    </label>
  );
}

/** Teks bantuan di bawah kotak input (punya jarak sendiri ke field berikutnya). */
export function HelperText({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <p className="mt-2 text-[11.5px] leading-relaxed" style={{ color: TEXT_DIM, ...style }}>
      {children}
    </p>
  );
}

/** Kelas isian seragam — dipakai semua input & textarea di halaman promo. */
export const inputClass = "pf-input";

/** Primitif input bertanda tangan sederhana (biar tiap kartu tidak menulis kelas lagi). */
export function PromoInput(props: React.ComponentPropsWithoutRef<"input">) {
  const { className, ...rest } = props;
  return <input {...rest} className={`${inputClass} ${className ?? ""}`.trim()} />;
}

export function PromoTextarea(props: React.ComponentPropsWithoutRef<"textarea">) {
  const { className, ...rest } = props;
  return <textarea {...rest} className={`${inputClass} ${className ?? ""}`.trim()} />;
}

/** Kartu putih — pembungkus tiap bagian form. */
export function Card({
  title,
  description,
  children,
  aside,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="pf-card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[13.5px] font-bold" style={{ color: TEXT }}>
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 text-[12px] leading-relaxed" style={{ color: TEXT_MUTED }}>
              {description}
            </p>
          ) : null}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}
