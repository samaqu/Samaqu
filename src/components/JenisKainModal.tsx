"use client";

import { m as motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import type { JenisKain } from "@/lib/katalog-data";

interface JenisKainModalProps {
  kain: JenisKain | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function JenisKainModal({ kain, isOpen, onClose }: JenisKainModalProps) {
  if (!kain) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[90]"
            style={{ background: "rgba(0,0,0,.5)", backdropFilter: "blur(4px)" }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="fixed z-[91] inset-x-4 bottom-4 top-auto max-h-[85vh] overflow-y-auto rounded-2xl sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-w-lg sm:w-full sm:max-h-[80vh]"
            style={{ background: "#ffffff", boxShadow: "0 24px 64px -16px rgba(0,0,0,.35)" }}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4" style={{ background: "#ffffff", borderBottom: "1px solid rgba(0,0,0,.08)" }}>
              <p className="text-xs tracking-[0.2em] uppercase font-medium" style={{ color: "#000000" }}>Detail Kain</p>
              <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-[rgba(0,0,0,.05)]" style={{ color: "var(--text-muted)" }}>
                <X size={18} />
              </button>
            </div>

            <div className="px-5 pb-5">
              {/* Photo */}
              {kain.image_url && (
                <div className="w-full aspect-[16/10] rounded-xl overflow-hidden mb-4" style={{ background: "#e5e5e5" }}>
                  <img src={kain.image_url} alt={kain.name} className="w-full h-full object-cover" />
                </div>
              )}

              {/* Name */}
              <h2
                className="text-2xl sm:text-3xl font-semibold mb-4"
                style={{ fontFamily: "var(--font-cormorant), Georgia, serif", color: "var(--espresso)" }}
              >
                {kain.name}
              </h2>

              {/* Info grid */}
              <div className="space-y-3">
                {kain.material && (
                  <div className="p-3 rounded-lg" style={{ background: "rgba(0,0,0,.03)" }}>
                    <p className="text-[10px] tracking-[0.12em] uppercase font-medium mb-1" style={{ color: "#000000" }}>Bahan</p>
                    <p className="text-sm leading-relaxed" style={{ color: "var(--espresso)" }}>{kain.material}</p>
                  </div>
                )}

                {kain.texture && (
                  <div className="p-3 rounded-lg" style={{ background: "rgba(0,0,0,.03)" }}>
                    <p className="text-[10px] tracking-[0.12em] uppercase font-medium mb-1" style={{ color: "#000000" }}>Tekstur</p>
                    <p className="text-sm leading-relaxed" style={{ color: "var(--espresso)" }}>{kain.texture}</p>
                  </div>
                )}

                {kain.suitable_for && (
                  <div className="p-3 rounded-lg" style={{ background: "rgba(0,0,0,.03)" }}>
                    <p className="text-[10px] tracking-[0.12em] uppercase font-medium mb-1" style={{ color: "#000000" }}>Cocok Untuk</p>
                    <p className="text-sm leading-relaxed" style={{ color: "var(--espresso)" }}>{kain.suitable_for}</p>
                  </div>
                )}

                {kain.care_instructions && (
                  <div className="p-3 rounded-lg" style={{ background: "rgba(0,0,0,.03)" }}>
                    <p className="text-[10px] tracking-[0.12em] uppercase font-medium mb-1" style={{ color: "#000000" }}>Cara Perawatan</p>
                    <p className="text-sm leading-relaxed" style={{ color: "var(--espresso)" }}>{kain.care_instructions}</p>
                  </div>
                )}
              </div>

              {/* Empty state */}
              {!kain.material && !kain.texture && !kain.suitable_for && !kain.care_instructions && (
                <p className="text-sm text-center py-6" style={{ color: "var(--text-muted)" }}>
                  Detail kain belum tersedia.
                </p>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
