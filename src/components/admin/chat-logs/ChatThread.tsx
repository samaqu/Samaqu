"use client";

import type { ReactNode } from "react";
import { ChevronLeft, MessageCircle } from "lucide-react";
import type { SessionGroup } from "./types";
import { formatDateTime, groupLogsByDate, initialOf, waDigits } from "./utils";
import MessageBubble from "./MessageBubble";

export default function ChatThread({
  session,
  onBack,
  onAddToFaq,
  addingId,
  mobileDetails,
}: {
  session: SessionGroup | null;
  onBack: () => void;
  onAddToFaq: (id: string) => void;
  addingId: string | null;
  mobileDetails?: ReactNode;
}) {
  if (!session) {
    return (
      <div
        className="flex h-full min-h-[520px] items-center justify-center rounded-2xl border bg-white p-6 text-sm"
        style={{ borderColor: "#E7E6E1", color: "#6B6A64" }}
      >
        Pilih sesi di kiri untuk melihat riwayat percakapan.
      </div>
    );
  }

  const wa = waDigits(session.phone);
  const groups = groupLogsByDate(session.items);

  return (
    <div
      className="flex h-full min-h-[520px] flex-col overflow-hidden rounded-2xl border bg-white"
      style={{ borderColor: "#E7E6E1" }}
    >
      <div
        className="flex flex-wrap items-center gap-2.5 border-b p-4"
        style={{ borderColor: "#E7E6E1" }}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label="Kembali ke daftar sesi"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border lg:hidden"
          style={{ borderColor: "#E7E6E1", color: "#141414" }}
        >
          <ChevronLeft size={18} />
        </button>

        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
          style={{ background: "#EEE9DF", color: "#6B6A64" }}
        >
          {initialOf(session.name)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold" style={{ color: "#141414" }}>
              {session.name || "Pengunjung"}
            </p>
            {session.phone ? (
              <span className="text-xs" style={{ color: "#6B6A64" }}>
                {session.phone}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-[11px]" style={{ color: "#6B6A64" }}>
            {formatDateTime(session.lastAt)} · ID {session.key}
          </p>
        </div>

        {wa ? (
          <a
            href={`https://wa.me/${wa}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold"
            style={{ background: "#1F7A4D", color: "#fff" }}
          >
            <MessageCircle size={14} />
            Chat WhatsApp
          </a>
        ) : null}
      </div>

      {mobileDetails ? <div className="lg:hidden">{mobileDetails}</div> : null}

      <div className="flex-1 overflow-y-auto p-4" style={{ background: "#FAF9F6" }}>
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.label} className="space-y-3">
              <div className="flex justify-center">
                <span
                  className="rounded-full border bg-white px-3 py-1 text-[11px] font-medium"
                  style={{ borderColor: "#E7E6E1", color: "#6B6A64" }}
                >
                  {group.label}
                </span>
              </div>
              {group.items.map((log) => (
                <MessageBubble
                  key={log.id}
                  log={log}
                  onAddToFaq={onAddToFaq}
                  adding={addingId === log.id}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
