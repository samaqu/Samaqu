"use client";

import { useState } from "react";
import type { CatalogUpdate } from "./api";
import { Modal } from "./Modal";

/** Aksi massal untuk series yang dicentang di tabel Produk & Harga. */
export default function BulkBar({
  selectedIds,
  busy,
  onApply,
}: {
  selectedIds: string[];
  busy: boolean;
  onApply: (updates: CatalogUpdate[], message: string) => Promise<boolean>;
}) {
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountDraft, setDiscountDraft] = useState("");

  if (selectedIds.length === 0) return null;

  const applyDiscount = async () => {
    const num = Number(discountDraft.replace(",", "."));
    if (!Number.isFinite(num) || num < 0 || num > 100) return;
    const ok = await onApply(
      selectedIds.map((id) => ({ id, reseller_discount_percent: Math.round(num * 100) / 100 })),
      `Diskon khusus ${num}% disimpan untuk ${selectedIds.length} series.`
    );
    if (ok) {
      setDiscountOpen(false);
      setDiscountDraft("");
    }
  };

  return (
    <>
      <div className="sticky bottom-3 z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur px-4 py-3 shadow-lg">
        <span className="text-[12.5px] font-bold text-slate-700 mr-1">{selectedIds.length} series dipilih</span>
        <button
          type="button"
          disabled={busy}
          onClick={() => setDiscountOpen(true)}
          className="px-3 py-2 rounded-lg text-[12px] font-bold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
        >
          Set diskon…
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            onApply(
              selectedIds.map((id) => ({ id, reseller_discount_percent: null })),
              `Diskon khusus dilepas untuk ${selectedIds.length} series (ikut default).`
            )
          }
          className="px-3 py-2 rounded-lg text-[12px] font-bold bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
        >
          Pakai default
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            onApply(
              selectedIds.map((id) => ({ id, reseller_enabled: true })),
              `${selectedIds.length} series dinyalakan untuk reseller.`
            )
          }
          className="px-3 py-2 rounded-lg text-[12px] font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          Nyalakan untuk reseller
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            onApply(
              selectedIds.map((id) => ({ id, reseller_enabled: false })),
              `${selectedIds.length} series dimatikan untuk reseller.`
            )
          }
          className="px-3 py-2 rounded-lg text-[12px] font-bold bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
        >
          Matikan untuk reseller
        </button>
        {busy ? <span className="text-[12px] text-slate-400">Menyimpan…</span> : null}
      </div>

      {discountOpen ? (
        <Modal title="Set diskon khusus" onClose={() => setDiscountOpen(false)} width={420}>
          <p className="text-[12.5px] text-slate-600">
            Diskon khusus berlaku untuk {selectedIds.length} series terpilih dan menimpa diskon default.
          </p>
          <div className="flex items-center gap-2 mt-3">
            <div className="flex flex-1 items-center rounded-xl border-2 border-slate-200 bg-white px-3 focus-within:border-slate-400">
              <input
                className="w-full bg-transparent py-2.5 text-sm font-bold text-slate-900 outline-none"
                inputMode="decimal"
                placeholder="25"
                value={discountDraft}
                onChange={(e) => setDiscountDraft(e.target.value.replace(/[^\d.,]/g, "").slice(0, 6))}
                autoFocus
              />
              <span className="text-[13px] font-bold text-slate-500">%</span>
            </div>
            <button
              type="button"
              onClick={applyDiscount}
              disabled={busy}
              className="px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              Terapkan
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">0–100%. Kosongkan lewat "Pakai default" bila ingin ikut default.</p>
        </Modal>
      ) : null}
    </>
  );
}
