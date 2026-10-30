"use client";

import type { ReactNode } from "react";
import type { RsStatus } from "@/lib/reseller/format";

/** Badge status dengan nada warna portal reseller. */
export function StatusBadge({ status, fallback }: { status: RsStatus; fallback?: string }) {
  return <span className={`badge ${status.tone}`}>{status.label || fallback || "—"}</span>;
}

/** Kotak pesan inline (kuning/merah/hijau). */
export function Note({ tone, children }: { tone: "ok" | "warn" | "err"; children: ReactNode }) {
  return <div className={`note ${tone}`}>{children}</div>;
}

/** Empty state standar portal. */
export function EmptyState({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <p>{text}</p>
      {action ? <div style={{ marginTop: 12 }}>{action}</div> : null}
    </div>
  );
}

/** Skeleton baris daftar selama data dimuat. */
export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="sk sk-row" />
      ))}
    </div>
  );
}

/** Skeleton kartu statistik. */
export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid-stats" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="sk" style={{ height: 86 }} />
      ))}
    </div>
  );
}
