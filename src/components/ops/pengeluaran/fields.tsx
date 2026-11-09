"use client";

import type { ReactNode } from "react";
import { angka } from "./helpers";

/** Gaya input seragam untuk drawer Pengeluaran. */
export const inputClass =
  "h-12 w-full rounded-2xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-900 outline-none transition-colors placeholder:font-medium placeholder:text-slate-400 hover:border-slate-300 focus:border-slate-400 focus:ring-4 focus:ring-slate-900/5 disabled:bg-slate-50 disabled:text-slate-400";

export const textareaClass =
  "w-full resize-none rounded-2xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-medium text-slate-900 outline-none transition-colors placeholder:text-slate-400 hover:border-slate-300 focus:border-slate-400 focus:ring-4 focus:ring-slate-900/5";

/**
 * Input rupiah: state menyimpan digit polos, tampilannya diberi pemisah ribuan saat mengetik.
 * Jangan pernah menyimpan nilai berformat — `asInt` di server juga mengharapkan digit/nilai polos.
 */
export function RupiahInput({
  value,
  onChange,
  placeholder = "0",
  disabled,
}: {
  value: string;
  onChange: (digits: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
        Rp
      </span>
      <input
        type="text"
        inputMode="numeric"
        value={value ? angka(Number(value)) : ""}
        onChange={(event) => onChange(event.target.value.replace(/[^\d]/g, ""))}
        placeholder={placeholder}
        disabled={disabled}
        className={`${inputClass} pl-10 tabular-nums`}
      />
    </div>
  );
}

/** Judul kecil per blok form. */
export const sectionLabelClass = "text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400";

/** Label + isi field dengan pesan bantuan opsional. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] font-medium text-slate-400">{hint}</span> : null}
    </label>
  );
}
