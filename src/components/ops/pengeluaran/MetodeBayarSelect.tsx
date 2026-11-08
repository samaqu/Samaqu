"use client";

import { useEffect, useRef, useState } from "react";
import { Banknote, Check, ChevronDown, Landmark, MoreHorizontal, QrCode, Wallet } from "lucide-react";
import { METODE_BAYAR } from "./helpers";

/** Ikon per metode bayar (monokrom, warna Samaqu: hitam–grafit). */
const IKON_METODE: Record<string, typeof Wallet> = {
  "Transfer Bank": Landmark,
  Cash: Banknote,
  QRIS: QrCode,
  "E-Wallet": Wallet,
  Lainnya: MoreHorizontal,
};

/**
 * Pemilih metode bayar bergaya dropdown berikon (bukan input teks + datalist).
 * Nilainya tetap teks bebas — METODE_BAYAR hanya daftar saran yang sama seperti sebelumnya.
 */
export default function MetodeBayarSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const terpilih = value.trim();
  const IkonTerpilih = IKON_METODE[terpilih] ?? MoreHorizontal;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-12 w-full items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-3 text-left text-sm transition-colors hover:border-slate-300 focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-900/5"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-slate-100 text-[#18181b]">
          <IkonTerpilih size={16} />
        </span>
        <span className={`flex-1 truncate ${terpilih ? "font-semibold text-slate-900" : "font-medium text-slate-400"}`}>
          {terpilih || "Pilih metode bayar…"}
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute inset-x-0 top-[calc(100%+6px)] z-30 max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10"
        >
          {METODE_BAYAR.map((option) => {
            const Ikon = IKON_METODE[option] ?? MoreHorizontal;
            const aktif = option === terpilih;
            return (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={aktif}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm font-semibold transition-colors ${
                  aktif ? "bg-slate-100 text-slate-900" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${
                    aktif ? "bg-[#18181b] text-white" : "bg-slate-100 text-[#18181b]"
                  }`}
                >
                  <Ikon size={16} />
                </span>
                <span className="flex-1 truncate">{option}</span>
                {aktif ? <Check size={16} className="shrink-0 text-[#18181b]" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
