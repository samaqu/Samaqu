"use client";

import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";

/** Modal dasar untuk halaman admin reseller (di dalam halaman, bukan alert browser). */
export function Modal({
  title,
  onClose,
  children,
  width = 480,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative w-full max-w-full bg-white rounded-2xl shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col"
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <h3 className="font-extrabold text-slate-900 text-sm">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Tutup">
            <X size={16} className="text-slate-500" />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

/**
 * Konfirmasi aksi uang: deskripsi wajib menyebut nama reseller + jumlah
 * (diberikan pemanggil). `reason` = tolak wajib alasan.
 */
export function ConfirmActionModal({
  title,
  description,
  confirmLabel,
  tone = "primary",
  busy,
  requireReason,
  reasonLabel = "Alasan",
  reasonPlaceholder = "Tulis alasan untuk reseller…",
  onConfirm,
  onClose,
}: {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  busy?: boolean;
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const disabled = Boolean(busy) || Boolean(requireReason && !reason.trim());

  return (
    <Modal title={title} onClose={onClose}>
      <div className="text-sm text-slate-700 leading-relaxed">{description}</div>
      {requireReason ? (
        <div className="mt-4">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
            {reasonLabel} <span className="text-red-500">*</span>
          </label>
          <textarea
            className="w-full px-3 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm font-semibold text-slate-900"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={reasonPlaceholder}
            autoFocus
          />
        </div>
      ) : null}
      <div className="flex justify-end gap-2 mt-5">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200"
        >
          Batal
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onConfirm(reason.trim())}
          className={`px-4 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 ${
            tone === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {busy ? "Memproses…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/** Notifikasi kecil di pojok bawah (dipakai tab Produk & Harga). */
export function AdminToast({
  message,
  tone,
  onClose,
}: {
  message: string;
  tone: "ok" | "err";
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 3500);
    return () => window.clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className={`fixed bottom-5 right-5 z-[400] px-4 py-3 rounded-xl shadow-xl text-sm font-bold text-white ${
        tone === "ok" ? "bg-emerald-600" : "bg-red-600"
      }`}
    >
      {message}
    </div>
  );
}
