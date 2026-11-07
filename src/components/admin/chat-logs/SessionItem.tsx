"use client";

import type { SessionGroup } from "./types";
import { formatTime, initialOf, statusOfSession } from "./utils";
import StatusBadge from "./StatusBadge";

export default function SessionItem({
  session,
  active,
  onSelect,
}: {
  session: SessionGroup;
  active: boolean;
  onSelect: (key: string) => void;
}) {
  const last = [...session.items]
    .reverse()
    .find((item) => item.question?.trim() || (item.question_images?.length ?? 0) > 0);
  const preview =
    last?.question?.trim() ||
    (last?.question_images?.length ? "(gambar)" : "(tanpa pertanyaan)");

  return (
    <button
      type="button"
      onClick={() => onSelect(session.key)}
      className="mb-1 w-full rounded-xl px-3 py-2.5 text-left transition-colors"
      style={{ background: active ? "#F6F3EC" : "transparent" }}
    >
      <div className="flex items-start gap-2.5">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
          style={{ background: "#EEE9DF", color: "#6B6A64" }}
        >
          {initialOf(session.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-semibold" style={{ color: "#141414" }}>
              {session.name || "Pengunjung"}
            </p>
            <span className="shrink-0 text-[11px]" style={{ color: "#6B6A64" }}>
              {formatTime(session.lastAt)}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs" style={{ color: "#6B6A64" }}>
            {preview}
          </p>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <StatusBadge status={statusOfSession(session)} small />
            <span className="text-[10px]" style={{ color: "#6B6A64" }}>
              {session.items.length} pesan
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}
