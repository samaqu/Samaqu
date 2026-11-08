"use client";

import type { ReactNode } from "react";

/** Gaya input seragam untuk drawer Pengeluaran. */
export const inputClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400";

export const textareaClass =
  "w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

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
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] font-medium text-slate-400">{hint}</span> : null}
    </label>
  );
}
