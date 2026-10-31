/**
 * Token & primitif bersama halaman Promo Free Cover Hanger di panel admin.
 *
 * Warna memakai token admin yang sudah ada (`--fg`, `--bd`, `--card`, `--sub`, `--fg2`) dan
 * menambahkan tone biru pastel khusus halaman ini. Semua komponen promo mengambil gaya dari
 * sini supaya tidak ada nilai warna yang ditulis ulang di tiap file.
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
} as const;

/** Latar isian halus di dalam kartu (sama dengan token admin `--sub`). */
export const FIELD_BG = "var(--sub)";
export const BORDER = "var(--bd)";
export const TEXT = "var(--fg)";
export const TEXT_MUTED = "var(--fg2)";
export const TEXT_DIM = "var(--fg3)";

/** Label kecil huruf besar di atas tiap isian. */
export function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em]"
      style={{ color: TEXT_MUTED }}
    >
      {children}
    </label>
  );
}

/** Teks bantuan kecil di bawah isian. */
export function HelperText({ children }: { children: ReactNode }) {
  return (
    <p className="mt-1.5 text-[11.5px] leading-relaxed" style={{ color: TEXT_DIM }}>
      {children}
    </p>
  );
}

/** Gaya isian (input/textarea) yang seragam. */
export const inputStyle: CSSProperties = {
  width: "100%",
  background: FIELD_BG,
  border: `1px solid ${BORDER}`,
  color: TEXT,
  borderRadius: 10,
  padding: "9px 12px",
  fontSize: 13,
  outline: "none",
};

/** Kartu putih berbingkai tipis — pembungkus tiap bagian form. */
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
    <section
      className="rounded-2xl p-5"
      style={{ background: "var(--card)", border: `1px solid ${BORDER}`, boxShadow: "0 1px 2px rgba(0,0,0,.04)" }}
    >
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
