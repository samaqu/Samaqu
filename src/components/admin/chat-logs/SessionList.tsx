"use client";

import { Loader2 } from "lucide-react";
import type { SessionGroup } from "./types";
import { groupSessionsByDate } from "./utils";
import SessionItem from "./SessionItem";

export default function SessionList({
  sessions,
  selectedKey,
  onSelect,
  loading,
}: {
  sessions: SessionGroup[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  loading: boolean;
}) {
  const groups = groupSessionsByDate(sessions);
  const questions = sessions.reduce((total, session) => total + session.items.length, 0);

  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-2xl border bg-white"
      style={{ borderColor: "#E7E6E1" }}
    >
      <div className="border-b p-4" style={{ borderColor: "#E7E6E1" }}>
        <p className="text-sm font-semibold" style={{ color: "#141414" }}>
          Riwayat Sesi
        </p>
        <p className="mt-0.5 text-xs" style={{ color: "#6B6A64" }}>
          {sessions.length} sesi · {questions} pertanyaan
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading && sessions.length === 0 ? (
          <div className="flex items-center gap-2 p-4 text-sm" style={{ color: "#6B6A64" }}>
            <Loader2 size={16} className="animate-spin" /> Memuat...
          </div>
        ) : groups.length === 0 ? (
          <div className="p-4 text-sm" style={{ color: "#6B6A64" }}>
            Belum ada percakapan yang cocok.
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="mb-2">
              <p
                className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide"
                style={{ color: "#6B6A64" }}
              >
                {group.label}
              </p>
              {group.sessions.map((session) => (
                <SessionItem
                  key={session.key}
                  session={session}
                  active={session.key === selectedKey}
                  onSelect={onSelect}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
