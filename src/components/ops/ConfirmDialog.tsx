"use client";

/**
 * Modal konfirmasi sendiri (pengganti window.confirm yang tampil dengan gaya bawaan browser).
 * Esc / klik di luar kotak = batal. Fokus awal di tombol Batal supaya Enter tidak tidak sengaja menyetujui.
 */

import { useEffect, useRef } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** danger = tombol setuju merah (tindakan yang sulit dibatalkan). */
  tone?: "default" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ open, title, message, confirmLabel, cancelLabel = "Batal", tone = "default", busy = false, onConfirm, onCancel }: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  // onCancel dibaca lewat ref supaya render ulang induk tidak memicu fokus ulang ke tombol Batal.
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancelRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  const danger = tone === "danger";
  return (
    <div
      role="presentation"
      onClick={onCancel}
      style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(15,23,42,0.45)", display: "grid", placeItems: "center", padding: 16 }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        onClick={(event) => event.stopPropagation()}
        style={{ width: "100%", maxWidth: 400, background: "#fff", borderRadius: 20, padding: 24, display: "grid", gap: 14, boxShadow: "0 24px 60px rgba(15,23,42,0.25)" }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span
            aria-hidden="true"
            style={{ width: 42, height: 42, borderRadius: "50%", background: danger ? "#fee2e2" : "#fef3c7", color: danger ? "#b91c1c" : "#b45309", display: "grid", placeItems: "center", fontSize: 20, fontWeight: 800, flex: "none" }}
          >
            !
          </span>
          <b id="confirm-dialog-title" style={{ fontSize: 18, color: "#1f2937" }}>
            {title}
          </b>
        </div>
        <p id="confirm-dialog-message" style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "#4b5563" }}>
          {message}
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{ border: "1px solid #e5e7eb", background: "#fff", color: "#1f2937", borderRadius: 12, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            style={{ border: 0, background: danger ? "#dc2626" : "#1f2937", color: "#fff", borderRadius: 12, padding: "10px 18px", fontSize: 14, fontWeight: 800, cursor: busy ? "wait" : "pointer" }}
          >
            {busy ? "Memproses…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
