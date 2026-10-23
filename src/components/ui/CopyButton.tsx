"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Tombol salin kecil (clipboard) untuk nomor pesanan / nomor resi.
 * Memakai `currentColor` supaya ikut warna teks di tema ops, panel, admin, dan customer.
 */
export default function CopyButton({
  value,
  label,
  className = "",
}: {
  value?: string | null;
  /** Nama yang dibacakan untuk aksesibilitas, mis. "nomor pesanan". */
  label: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const text = String(value ?? "").trim();
  if (!text) return null;

  async function copy(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard bisa diblokir browser — tidak perlu mengganggu layar */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? `${label} tersalin` : `Salin ${label}`}
      title={copied ? "Tersalin" : `Salin ${label}`}
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md opacity-60 transition-opacity hover:opacity-100 ${className}`}
    >
      {copied ? <Check size={13} strokeWidth={2.6} /> : <Copy size={13} strokeWidth={2.2} />}
    </button>
  );
}
