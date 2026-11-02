"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * Tautan WhatsApp CS untuk halaman kampanye.
 *
 * `href` diisi hasil `loadCsWhatsapp()` (server) — nomornya dibaca dari `store_settings.whatsapp`,
 * bukan hardcode. Kalau nomor belum diisi, tombol tetap tampil tapi tidak mengarah ke
 * `wa.me/` kosong (dimatikan + ditandai nonaktif).
 */
export default function CampaignWaLink({
  children,
  style,
  href,
  ariaLabel,
}: {
  children: ReactNode;
  style?: CSSProperties;
  href?: string | null;
  ariaLabel?: string;
}) {
  if (!href) {
    return (
      <span
        style={{ ...style, opacity: 0.5, cursor: "not-allowed" }}
        aria-label={ariaLabel}
        role="link"
        aria-disabled="true"
      >
        {children}
      </span>
    );
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={ariaLabel} style={style}>
      {children}
    </a>
  );
}
