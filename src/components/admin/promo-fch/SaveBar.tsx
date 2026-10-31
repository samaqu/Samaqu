"use client";

/**
 * Save bar yang menempel di bawah area konten — hanya untuk field form
 * (status, teks, kuota, periode). Produk promo disimpan per klik, jadi tidak masuk di sini.
 */

import { Loader2 } from "lucide-react";
import { PROMO_COLORS, TEXT, TEXT_MUTED } from "./primitives";

export function SaveBar({
  dirty,
  saving,
  onReset,
  onSave,
}: {
  dirty: boolean;
  saving: boolean;
  onReset: () => void;
  onSave: () => void;
}) {
  return (
    <div
      className="sticky bottom-0 z-20 -mx-1 mt-2 rounded-t-2xl px-4 py-3"
      style={{
        background: "rgba(255,255,255,.94)",
        backdropFilter: "blur(10px)",
        border: "1px solid var(--bd)",
        borderBottom: "none",
        boxShadow: "0 -6px 24px -12px rgba(0,0,0,.18)",
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[12px] font-medium" style={{ color: dirty ? "#8a4b08" : TEXT_MUTED }}>
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: dirty ? "#E0A100" : "#22c55e" }}
          />
          {dirty ? "Ada perubahan yang belum disimpan" : "Semua perubahan tersimpan"}
        </span>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onReset}
            disabled={!dirty || saving}
            className="rounded-lg px-4 py-2 text-[12px] font-semibold disabled:opacity-40"
            style={{ border: "1px solid var(--bd)", color: TEXT, background: "var(--card)" }}
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg px-5 py-2 text-[12px] font-bold disabled:opacity-60"
            style={{
              background: `linear-gradient(90deg, ${PROMO_COLORS.saveFrom}, ${PROMO_COLORS.saveTo})`,
              border: `1px solid ${PROMO_COLORS.saveBorder}`,
              color: PROMO_COLORS.saveText,
            }}
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : null}
            {saving ? "Menyimpan…" : "Simpan pengaturan"}
          </button>
        </div>
      </div>
    </div>
  );
}
