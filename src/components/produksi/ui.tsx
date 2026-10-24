"use client";

import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Loader2, Lock, X } from "lucide-react";
import type { ProduksiAccess } from "./useAccess";

export const inputClass =
  "w-full px-3 py-2 bg-gray-50 dark:bg-slate-900 border-2 border-gray-200 dark:border-slate-700 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/30 text-sm font-semibold text-slate-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed";
export const labelClass =
  "text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1";
export const btnPrimary =
  "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1e3a5f] text-white text-sm font-bold shadow-sm hover:bg-[#16304f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap";
export const btnSecondary =
  "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-bold hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors whitespace-nowrap";
export const cardClass =
  "rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-[#1a1d28]";

export function PageHead({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-inter text-2xl md:text-3xl font-black text-slate-900 dark:text-white">{title}</h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-2xl">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "positive" | "warning" | "danger" | "muted";
}) {
  const color =
    tone === "positive"
      ? "text-emerald-600"
      : tone === "warning"
        ? "text-amber-600"
        : tone === "danger"
          ? "text-red-600"
          : tone === "muted"
            ? "text-slate-400"
            : "text-slate-900 dark:text-white";
  return (
    <div className={`${cardClass} p-4`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-1.5 text-2xl font-black leading-tight whitespace-nowrap ${color}`}>{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{hint}</p> : null}
    </div>
  );
}

type BadgeTone = "green" | "amber" | "red" | "slate" | "blue";

const BADGE_STYLES: Record<BadgeTone, string> = {
  green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  red: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200",
  slate: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
};

export function Badge({ tone = "slate", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${BADGE_STYLES[tone]}`}
    >
      {children}
    </span>
  );
}

export function ErrorBox({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-200">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="px-4 py-12 text-center">
      <p className="text-sm font-bold text-slate-500 dark:text-slate-400">{title}</p>
      {description ? (
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{description}</p>
      ) : null}
    </div>
  );
}

export function Spinner({ label = "Memuat…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm font-semibold text-slate-400">
      <Loader2 size={16} className="animate-spin" /> {label}
    </div>
  );
}

export function AccessGate({
  access,
  ownerOnly = false,
  children,
}: {
  access: ProduksiAccess;
  ownerOnly?: boolean;
  children: ReactNode;
}) {
  if (access.loading) return <Spinner label="Memeriksa akses…" />;

  if (!access.allowed || (ownerOnly && access.role !== "owner")) {
    return (
      <div className={`${cardClass} p-8 text-center`}>
        <div className="mx-auto grid place-items-center h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-800">
          <Lock size={20} className="text-slate-500" />
        </div>
        <h2 className="mt-3 text-lg font-black text-slate-900 dark:text-white">Menu ini hanya untuk Owner</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {access.error || "Role akunmu tidak punya akses ke fitur produksi ini."}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998]"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.24, ease: "easeOut" }}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`fixed inset-y-0 right-0 z-[9999] w-full ${
              wide ? "sm:w-[760px]" : "sm:w-[560px]"
            } bg-white dark:bg-[#1a1d28] shadow-2xl flex flex-col overflow-hidden`}
          >
            <div className="shrink-0 px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-bold text-lg text-slate-900 dark:text-white">{title}</h3>
                {subtitle ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Tutup"
                className="p-2 -mr-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={18} className="text-slate-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar px-5 py-4">{children}</div>

            {footer ? (
              <div className="shrink-0 px-5 py-3.5 border-t border-slate-200 dark:border-slate-800">
                {footer}
              </div>
            ) : null}
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
