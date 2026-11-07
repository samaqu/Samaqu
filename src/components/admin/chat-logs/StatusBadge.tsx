"use client";

import type { StatusTone } from "./types";

const STYLES: Record<StatusTone, { background: string; color: string; label: string }> = {
  answered: { background: "#E3F2E8", color: "#22603A", label: "Terjawab AI" },
  escalated: { background: "#FBEFD9", color: "#8A5A12", label: "Diarahkan ke admin" },
  failed: { background: "#FCE8E8", color: "#9B2C2C", label: "Gagal" },
};

export default function StatusBadge({
  status,
  small = false,
}: {
  status: StatusTone;
  small?: boolean;
}) {
  const style = STYLES[status];
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full font-semibold ${
        small ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"
      }`}
      style={{ background: style.background, color: style.color }}
    >
      {style.label}
    </span>
  );
}
