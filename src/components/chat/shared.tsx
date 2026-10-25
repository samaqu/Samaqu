"use client";

import { Fragment } from "react";
import type { ChatProductCard } from "@/lib/chat-tools";

export interface Msg {
  role: "user" | "assistant";
  content: string;
  products?: ChatProductCard[];
  images?: string[];
}

// Tombol "Lanjut chat ke WhatsApp admin" di panel chat — dimatikan sementara.
export const SHOW_WHATSAPP_HANDOFF = false;

/** Kunci localStorage riwayat chat (biar percakapan awet saat refresh). */
export const HISTORY_KEY = "samaqu_chat_history";
/** Batas pesan yang disimpan/ditampilkan dari riwayat. */
export const HISTORY_MAX = 30;

/** Empat pertanyaan cepat yang muncul di awal percakapan. */
export const SUGGESTION_KEYS = ["suggestStock", "suggestSize", "suggestOrder", "suggestPay"] as const;

export function RobotIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 6.5V4" />
      <circle cx="12" cy="3" r="1.1" fill="currentColor" stroke="none" />
      <rect x="4" y="6.5" width="16" height="11.5" rx="3.2" />
      <circle cx="9" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <path d="M9.5 15.6h5" />
      <path d="M4 11.5H2.4M20 11.5h1.6" />
    </svg>
  );
}

/** Tebal `**text**` → <strong>. Tanpa HTML mentah. */
export function renderInline(text: string, keyBase: string) {
  return text.split(/(\*\*[^*\n]+\*\*)/g).filter(Boolean).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={`${keyBase}-${i}`}>{part.slice(2, -2)}</strong>
    ) : (
      <Fragment key={`${keyBase}-${i}`}>{part}</Fragment>
    )
  );
}

/** Render sederhana: baris kosong jadi jarak, bullet/nomor jadi daftar. */
export function renderRichText(text: string) {
  return text.split("\n").map((line, i) => {
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const numbered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);

    if (bullet || numbered) {
      const content = bullet ? bullet[1] : numbered![2];
      return (
        <span key={i} className="flex gap-2">
          <span aria-hidden style={{ opacity: 0.6 }}>{bullet ? "•" : `${numbered![1]}.`}</span>
          <span className="min-w-0">{renderInline(content, `l${i}`)}</span>
        </span>
      );
    }
    if (!line.trim()) return <span key={i} className="block h-1.5" />;
    return (
      <span key={i} className="block">
        {renderInline(line, `l${i}`)}
      </span>
    );
  });
}
