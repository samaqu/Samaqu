"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { m as motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import Link from "next/link";

export interface ToastAction {
  /** Label tautan kecil di kanan (mis. "Lihat"). */
  label: string;
  /** Tujuan tautan (sudah termasuk prefix locale). */
  href: string;
}

export interface ToastOptions {
  /** Tautan kecil di sebelah kanan toast (mis. "Lihat" → keranjang). */
  action?: ToastAction;
  /**
   * Angkat toast tepat di atas bar aksi bawah halaman (baris TOTAL + tombol di
   * detail produk) supaya tidak menutupinya. Hanya berpengaruh di mobile; di
   * desktop toast tetap menempel di atas seperti biasa.
   */
  aboveActionBar?: boolean;
}

interface ToastCtx {
  show: (msg: string, opts?: ToastOptions) => void;
}

const ToastContext = createContext<ToastCtx>({ show: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState("");
  const [action, setAction] = useState<ToastAction | undefined>(undefined);
  const [aboveActionBar, setAboveActionBar] = useState(false);
  const [visible, setVisible] = useState(false);

  const show = useCallback((text: string, opts?: ToastOptions) => {
    setMsg(text);
    setAction(opts?.action);
    setAboveActionBar(!!opts?.aboveActionBar);
    setVisible(true);
  }, []);

  useEffect(() => {
    if (!visible) return;
    // Sedikit lebih lama kalau ada tautan supaya sempat ditekan.
    const t = setTimeout(() => setVisible(false), action?.href ? 3200 : 2200);
    return () => clearTimeout(t);
  }, [visible, action]);

  // Default `bottom-24` di mobile, pojok atas di desktop — halaman lain tidak berubah.
  // Varian `aboveActionBar` memakai tinggi bar aksi bawah halaman (`--action-bar-h`,
  // 110px di mobile detail produk) + jarak, lalu kembali ke atas di desktop (`md:`).
  const positionClass = aboveActionBar
    ? "bottom-[calc(var(--action-bar-h)_+_1rem)] md:bottom-auto md:top-24"
    : "bottom-24 md:bottom-auto md:top-24";

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className={`fixed left-1/2 -translate-x-1/2 z-[9999] pointer-events-none ${positionClass}`}>
        <AnimatePresence>
          {visible && (
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg pointer-events-auto"
              style={{ background: "#000000", color: "white", boxShadow: "0 8px 30px -8px rgba(0,0,0,.35)" }}>
              <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: "#ffffff" }}>
                <Check size={12} strokeWidth={3} color="#000000" />
              </div>
              <span className="text-[12px] font-ui font-medium whitespace-nowrap">{msg}</span>
              {action?.href && (
                <Link
                  href={action.href}
                  onClick={() => setVisible(false)}
                  className="ml-0.5 pl-2.5 text-[12px] font-ui font-semibold whitespace-nowrap underline underline-offset-2 shrink-0 transition-opacity duration-200 hover:opacity-70"
                  style={{ borderLeft: "1px solid rgba(255,255,255,.3)", color: "#ffffff" }}
                >
                  {action.label}
                </Link>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
