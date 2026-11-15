"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { PREORDER_CANCEL_REASONS } from "@/lib/preorder";

/**
 * Dialog alasan wajib untuk membatalkan atau menghapus PRE-ORDER.
 *
 * Pre-order tidak bisa dibatalkan ke customer (kebijakan toko), jadi admin hanya boleh
 * membatalkan/menghapus dengan peringatan keras + alasan yang dipilih (dicatat server).
 * Pilihan alasan memakai daftar yang SAMA dengan server (`PREORDER_CANCEL_REASONS`).
 * Untuk pesanan reguler dialog ini tidak dipakai (tetap `ConfirmDeleteModal`).
 */
export default function PreorderReasonDialog({
  isOpen,
  onClose,
  onConfirm,
  /** "batal" | "hapus" — hanya mengubah teks. */
  action = "batal",
  itemName,
  isBusy = false,
}) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);

  // Dibuka ulang → isian bersih (alasan tidak boleh menempel dari pembatalan sebelumnya).
  useEffect(() => {
    if (isOpen) {
      setReason("");
      setNote("");
      setTouched(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const needsNote = reason === "lainnya";
  const error = !reason
    ? "Pilih alasan dulu."
    : needsNote && note.trim().length < 3
      ? "Isi catatan singkat untuk alasan \"Lainnya\"."
      : "";
  const verb = action === "hapus" ? "Hapus" : "Batalkan";

  const submit = () => {
    setTouched(true);
    if (error) return;
    onConfirm?.({ reason, reason_note: note.trim() });
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[9998]" onClick={isBusy ? undefined : onClose} />
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${verb} pre-order`}
          data-testid="preorder-reason-dialog"
          className="bg-white rounded-2xl shadow-2xl w-full max-w-[420px] p-6"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="text-center mb-4">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-red-100 rounded-full mb-3">
              <AlertTriangle size={28} className="text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">{verb} pre-order ini?</h3>
            {itemName ? <p className="text-sm text-gray-600 mt-2">{itemName}</p> : null}
            <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mt-3 text-left">
              Pre-order TIDAK dapat dibatalkan ke customer. Lanjutkan hanya kalau ini koreksi internal (salah input, pesanan dobel, atau
              data uji). Alasan dicatat.
              {action === "hapus" ? " Transaksi dihapus permanen." : ""}
            </p>
          </div>

          <fieldset className="space-y-1.5 mb-3">
            <legend className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">Alasan (wajib)</legend>
            {PREORDER_CANCEL_REASONS.map((option) => (
              <label key={option.key} className="flex items-center gap-2 text-sm font-semibold text-gray-800 cursor-pointer">
                <input
                  type="radio"
                  name="preorder-cancel-reason"
                  value={option.key}
                  checked={reason === option.key}
                  onChange={() => setReason(option.key)}
                />
                {option.label}
              </label>
            ))}
          </fieldset>

          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={needsNote ? "Catatan (wajib untuk Lainnya)" : "Catatan (opsional)"}
            aria-label="Catatan alasan"
            maxLength={200}
            rows={2}
            className="w-full rounded-xl border-2 border-gray-200 px-3 py-2 text-sm font-medium text-gray-800 mb-1"
          />
          {touched && error ? <p className="text-xs font-semibold text-red-600 mb-2">{error}</p> : <div className="mb-2" />}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isBusy}
              className="flex-1 px-5 py-2.5 bg-white border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 disabled:opacity-50"
            >
              Kembali
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={isBusy}
              data-testid="preorder-reason-confirm"
              className="flex-1 px-5 py-2.5 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 disabled:opacity-50"
            >
              {isBusy ? "Memproses..." : verb}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
