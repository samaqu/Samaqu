"use client";

import { m as motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open,
  title,
  message,
  confirmText = "Hapus",
  cancelText = "Batal",
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,.4)", backdropFilter: "blur(4px)" }}
          onClick={onCancel}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 16 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-sm rounded-2xl p-6"
            style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,.08)", boxShadow: "0 24px 48px -12px rgba(0,0,0,.25)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2" style={{ fontFamily: "var(--font-cormorant), Georgia, serif", color: "var(--espresso)" }}>
              {title}
            </h3>
            <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--text-secondary)" }}>
              {message}
            </p>
            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-[0.98]"
                style={{ border: "1px solid rgba(0,0,0,.15)", color: "var(--espresso)" }}
              >
                {cancelText}
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-[0.98]"
                style={{ background: danger ? "#e74c3c" : "#000000" }}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
