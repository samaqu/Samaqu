"use client";

/**
 * Dropdown wilayah (Provinsi / Kota / Kecamatan) yang bisa dicari.
 *
 * Satu komponen dipakai di tiga tempat supaya perilakunya seragam:
 *   - dashboard ops (Tambah Transaksi) — variant "ops"
 *   - checkout website                 — variant "store"
 *   - Open Order langkah data pemesan  — variant "store"
 *
 * Sumber pilihannya dataset area J&T lewat `/api/shipping/wilayah` — jadi nama kota/kecamatan
 * yang tersimpan persis yang dipakai `/api/shipping/jnt-cost` untuk menghitung tarif J&T.
 * Nilai yang sedang terpilih tetap ditampilkan walau tidak ada di daftar (mis. alamat lama
 * atau alamat tersimpan customer), jadi data lama tidak hilang saat diubah.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";

export interface WilayahSelectProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options?: string[];
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
  /** Keterangan tambahan di bawah isian (mis. penanda hasil tebakan otomatis). */
  hint?: string;
  /** "ops" untuk dashboard internal, "store" untuk halaman customer, "reseller" untuk portal reseller. */
  variant?: "ops" | "store" | "reseller";
  required?: boolean;
}

export default function WilayahSelect({
  label,
  value,
  onChange,
  options = [],
  placeholder = "— Pilih —",
  disabled = false,
  loading = false,
  error,
  hint = "",
  variant = "ops",
  required = true,
}: WilayahSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const list = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle ? options.filter((option) => option.toLowerCase().includes(needle)) : options;
    // Nilai terpilih tetap muncul walau tidak ada di daftar.
    if (value && !filtered.includes(value)) return [value, ...filtered];
    return filtered.slice(0, 80);
  }, [options, query, value]);

  const pick = (option: string) => {
    onChange(option);
    setQuery("");
    setOpen(false);
  };

  const isStore = variant === "store";
  // Portal reseller: gaya dari `reseller.css` (`rs-wil-*`) supaya sama dengan kolom isian lainnya.
  const isReseller = variant === "reseller";
  const labelClass = isReseller
    ? "rs-wil-label"
    : isStore
      ? "block text-[13px] sm:text-sm font-ui mb-1.5"
      : "text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1.5";
  const buttonClass = isReseller
    ? "rs-wil-btn"
    : isStore
    ? "w-full flex items-center justify-between gap-2 rounded-lg px-4 py-3 text-left text-sm font-ui transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    : `w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border-2 bg-gray-50 dark:bg-slate-900 text-left text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        error ? "border-red-300 dark:border-red-900/60" : "border-gray-200 dark:border-slate-700"
      } ${open ? "border-blue-500 ring-2 ring-blue-100 dark:ring-blue-900/30" : ""}`;
  const buttonStyle = isStore
    ? {
        background: "var(--cream, #fff)",
        border: `1px solid ${error ? "#e74c3c" : "rgba(0,0,0,.25)"}`,
        color: "var(--text-primary, #1a1a1a)",
      }
    : undefined;

  return (
    <div ref={rootRef} className="relative">
      {label ? (
        <label className={labelClass}>
          {label} {required ? <span style={{ color: isStore ? "var(--gold)" : "#ef4444" }}>*</span> : null}
        </label>
      ) : null}

      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={buttonClass}
        style={buttonStyle}
      >
        <span
          className={`truncate${isReseller && !value ? " rs-wil-ph" : ""}`}
          style={value || !isStore ? undefined : { color: "var(--text-muted, #6b7280)" }}
        >
          {value || (loading ? "Memuat…" : placeholder)}
        </span>
        <ChevronDown size={15} className="shrink-0 opacity-60" />
      </button>

      {open && !disabled && (
        <div
          className="absolute left-0 right-0 z-40 mt-1 overflow-hidden rounded-xl border bg-white shadow-xl"
          style={{ borderColor: isStore ? "rgba(0,0,0,.15)" : "rgb(226 232 240)" }}
        >
          <div className="relative border-b border-slate-100">
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ketik untuk mencari…"
              className="w-full bg-transparent px-3 py-2.5 pr-8 text-sm text-slate-900 outline-none placeholder-slate-400"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:text-slate-600"
                aria-label="Hapus pencarian"
              >
                <X size={13} />
              </button>
            )}
          </div>
          <div className="no-scrollbar max-h-56 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            {list.length === 0 ? (
              <p className="px-3 py-3 text-xs text-slate-500">Tidak ada pilihan yang cocok.</p>
            ) : (
              list.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => pick(option)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-slate-50 ${
                    option === value ? "font-bold text-slate-900" : "text-slate-700"
                  }`}
                >
                  <span className="truncate">{option}</span>
                  {option === value ? <Check size={14} className="shrink-0 text-blue-600" /> : null}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {error ? (
        <p className="mt-1 text-[11px] font-ui font-semibold" style={{ color: "#e74c3c" }}>
          {error}
        </p>
      ) : null}
      {!error && hint ? (
        <p className="mt-1 text-xs font-semibold" style={{ color: isStore ? "var(--text-muted, #6b7280)" : "#d97706" }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
