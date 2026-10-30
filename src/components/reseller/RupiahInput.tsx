"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Input uang bersama (portal reseller + halaman admin reseller).
 *
 * - Tampilan berformat rupiah dengan awalan "Rp" (mis. ketik 50000 → "Rp 50.000").
 * - Nilai yang dikirim ke pemanggil SELALU angka bulat (tanpa titik/Rp).
 * - Hanya angka yang bisa diketik; kursor tidak loncat (posisi dipulihkan
 *   berdasarkan jumlah digit di kiri kursor) saat mengetik/menghapus titik.
 * - `inputMode="numeric"` supaya keyboard angka muncul di HP.
 */
const MAX_DIGITS = 12; // sampai 999.999.999.999

function formatDigits(digits: string): string {
  if (!digits) return "";
  return Number(digits).toLocaleString("id-ID");
}

export default function RupiahInput({
  value,
  onChange,
  id,
  placeholder,
  disabled,
  autoFocus,
  max,
  invalid,
  compact,
  hero,
  className = "",
  ariaLabel,
  onBlur,
}: {
  value: number;
  onChange: (value: number) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Batas atas (mis. saldo bisa dipakai). Nilai lebih besar dipotong. */
  max?: number;
  /** true = garis merah (nilai tidak valid). */
  invalid?: boolean;
  /** Varian ringkas untuk tabel (tinggi ±34px, teks lebih kecil). */
  compact?: boolean;
  /** Varian besar & rata tengah (nominal utama di halaman bayar). */
  hero?: boolean;
  /** Dipanggil saat input kehilangan fokus (dipakai simpan otomatis di tabel). */
  onBlur?: () => void;
  className?: string;
  ariaLabel?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  /** Jumlah digit di kiri kursor setelah input — dipakai untuk memulihkan kursor. */
  const caretDigits = useRef<number | null>(null);
  const display = formatDigits(String(Math.max(0, Math.round(Number(value) || 0)) || ""));

  useLayoutEffect(() => {
    const el = inputRef.current;
    const target = caretDigits.current;
    if (!el || target === null || document.activeElement !== el) return;
    caretDigits.current = null;

    // Posisikan kursor setelah N digit pada teks terformat.
    let seen = 0;
    let pos = 0;
    const text = el.value;
    while (pos < text.length && seen < target) {
      if (/\d/.test(text[pos])) seen += 1;
      pos += 1;
    }
    el.setSelectionRange(pos, pos);
  });

  return (
    <div
      className={`flex w-full items-center gap-2 border-2 bg-white focus-within:ring-2 focus-within:ring-slate-900/5 ${
        hero ? "rounded-2xl px-4" : compact ? "rounded-lg px-2" : "rounded-xl px-3"
      } ${
        invalid ? "border-red-400 focus-within:border-red-500" : "border-slate-200 focus-within:border-slate-400"
      } ${disabled ? "opacity-60" : ""} ${className}`}
    >
      <span className={`font-bold text-slate-500 select-none ${compact ? "text-[11.5px]" : hero ? "text-lg" : "text-[13px]"}`}>Rp</span>
      <input
        ref={inputRef}
        id={id}
        className={`w-full min-w-0 bg-transparent font-semibold text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400 ${
          hero ? "py-2 text-center text-3xl font-extrabold tracking-tight" : compact ? "py-1.5 text-[12.5px]" : "py-2.5 text-sm"
        }`}
        inputMode="numeric"
        autoComplete="off"
        aria-label={ariaLabel}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onBlur={onBlur}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur();
        }}
        value={display}
        onChange={(event) => {
          const el = event.target;
          const raw = el.value;
          const caret = el.selectionStart ?? raw.length;
          const digitsBeforeCaret = raw.slice(0, caret).replace(/\D/g, "").length;

          let digits = raw.replace(/\D/g, "").slice(0, MAX_DIGITS);
          let next = digits ? parseInt(digits, 10) : 0;
          if (typeof max === "number") next = Math.min(next, Math.max(0, Math.round(max)));

          // Kalau dipotong oleh `max`, kursor mengikuti panjang angka hasil.
          digits = String(next);
          caretDigits.current = Math.min(digitsBeforeCaret, digits.length);
          onChange(next);
        }}
      />
    </div>
  );
}
