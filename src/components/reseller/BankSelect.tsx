"use client";

import { useEffect, useState } from "react";
import {
  OTHER_BANK_VALUE,
  RESELLER_BANK_OPTIONS,
  detectKnownBankCode,
} from "@/lib/reseller/banks";

/**
 * Dropdown bank Indonesia (kode bank) + opsi "Lainnya" dengan input teks.
 * Nilai tersimpan: kode bank ("BSI", "BCA", …) atau teks bebas untuk "Lainnya".
 * BSI dideteksi dari kode ini — bukan dari pencocokan teks.
 */
export default function BankSelect({
  value,
  onChange,
  label = "Bank",
  required = true,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
}) {
  const known = detectKnownBankCode(value);
  const [otherChosen, setOtherChosen] = useState(false);
  const isOther = otherChosen || (!known && Boolean(value.trim()));
  const mode = known ?? (isOther ? OTHER_BANK_VALUE : "");

  // Nilai dari luar berubah menjadi kode dikenal (mis. edit reseller lain) → reset mode.
  useEffect(() => {
    if (detectKnownBankCode(value)) setOtherChosen(false);
  }, [value]);

  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </label>
      <select
        className="w-full px-3 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-lg text-sm font-semibold text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        value={mode}
        onChange={(event) => {
          const next = event.target.value;
          if (next === OTHER_BANK_VALUE) {
            setOtherChosen(true);
            onChange("");
          } else {
            setOtherChosen(false);
            onChange(next);
          }
        }}
      >
        <option value="">— Pilih bank —</option>
        {RESELLER_BANK_OPTIONS.map((option) => (
          <option key={option.code} value={option.code}>
            {option.label}
          </option>
        ))}
        <option value={OTHER_BANK_VALUE}>Lainnya…</option>
      </select>
      {isOther ? (
        <input
          className="mt-2 w-full px-3 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-lg text-sm font-semibold text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          placeholder="Nama bank (isi manual)"
          value={known ? "" : value}
          onChange={(event) => {
            setOtherChosen(true);
            onChange(event.target.value);
          }}
          aria-label="Nama bank lainnya"
        />
      ) : null}
    </div>
  );
}
