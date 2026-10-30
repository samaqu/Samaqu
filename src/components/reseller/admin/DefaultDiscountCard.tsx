"use client";

import { useState } from "react";
import { AdminApiError, opsResellerApi, type CatalogUpdate } from "./api";

/**
 * Kartu "Diskon reseller default" — dipakai series yang tidak punya diskon
 * khusus. Nilai disimpan ke pengaturan reseller (store_settings).
 */
export default function DefaultDiscountCard({
  value,
  onSaved,
  onError,
}: {
  value: number;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const num = Number(draft.replace(",", "."));
    if (!Number.isFinite(num) || num < 0 || num > 100) {
      onError("Diskon default harus 0–100.");
      return;
    }
    setBusy(true);
    try {
      await opsResellerApi.updateSettings({ default_discount_percent: num });
      onSaved(`Diskon reseller default disimpan: ${num}%`);
    } catch (e) {
      onError(e instanceof AdminApiError ? e.message : "Gagal menyimpan diskon default.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3.5 flex flex-wrap items-center gap-3">
      <div className="min-w-0">
        <p className="font-extrabold text-slate-900 text-sm">Diskon reseller default</p>
        <p className="text-[12px] text-slate-500">
          Dipakai semua series yang diskon khususnya kosong. Diskon khusus per series menimpa nilai ini.
        </p>
      </div>
      <div className="flex items-center gap-2 ml-auto">
        <div className="flex items-center rounded-xl border-2 border-slate-200 bg-white px-3 focus-within:border-slate-400">
          <input
            className="w-16 bg-transparent py-2 text-sm font-bold text-slate-900 outline-none"
            inputMode="decimal"
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/[^\d.,]/g, "").slice(0, 6))}
            aria-label="Diskon reseller default (persen)"
          />
          <span className="text-[13px] font-bold text-slate-500">%</span>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
    </div>
  );
}

/** Helper update massal untuk tab Produk & Harga. */
export function buildDiscountUpdates(ids: string[], percent: number | null): CatalogUpdate[] {
  return ids.map((id) => ({ id, reseller_discount_percent: percent }));
}

export function buildEnabledUpdates(ids: string[], enabled: boolean): CatalogUpdate[] {
  return ids.map((id) => ({ id, reseller_enabled: enabled }));
}
