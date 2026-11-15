"use client";

import { AlertTriangle } from "lucide-react";
import type { DuplicateMatch } from "@/lib/duplicate-order";

/**
 * Daftar pesanan terbuka yang mirip dengan pesanan yang sedang dicatat/disetujui.
 * Dipakai form Tambah Transaksi dan dialog Setujui di Perlu Review (satu tampilan, satu bahasa).
 */

const STATUS_LABEL: Record<string, string> = { pending: "Belum bayar", diproses: "Diproses" };

const rupiah = (value: number) => `Rp${Math.round(Number(value) || 0).toLocaleString("id-ID")}`;

function waktu(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function alasan(match: DuplicateMatch): string {
  if (match.reasons.includes("nomor") && match.reasons.includes("nama")) return "nomor HP dan nama sama";
  return match.reasons.includes("nomor") ? "nomor HP sama" : "nama sama";
}

export default function DuplicateOrderWarning({ matches }: { matches: DuplicateMatch[] }) {
  if (!matches?.length) return null;
  return (
    <div
      role="alert"
      data-testid="duplicate-warning"
      className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <p className="flex items-center gap-2 text-sm font-black">
        <AlertTriangle size={16} className="shrink-0" />
        Mungkin order dobel
      </p>
      <p className="mt-1 text-xs font-semibold">
        Ada pesanan yang masih terbuka dengan nomor HP atau nama yang sama. Cek dulu supaya tidak tercatat dua kali.
      </p>
      <ul className="mt-2 space-y-1.5">
        {matches.map((match) => (
          <li key={match.order_number} className="rounded-lg bg-white/70 px-2.5 py-1.5 text-xs dark:bg-black/20">
            <span className="font-mono font-bold">{match.order_number}</span>
            {match.is_preorder ? " · Pre-Order" : ""}
            <span className="font-semibold"> · {match.customer_name || "-"}</span>
            <span className="block opacity-80">
              {[STATUS_LABEL[match.status] || match.status, rupiah(match.total), waktu(match.created_at), alasan(match)]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
