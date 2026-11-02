"use client";

import s from "./drawer-menu.module.css";

/**
 * Kartu program "Create Your Price" di drawer mobile.
 * Gaya mengikuti referensi: kartu hitam, eyebrow kecil, kata "Price" di-highlight
 * putih, ikon panah bulat di kanan.
 */
export default function CypCard({
  href,
  eyebrow,
  lead,
  accent,
  onNavigate,
  active,
}: {
  href: string;
  eyebrow: string;
  lead: string;
  accent: string;
  onNavigate: () => void;
  active: boolean;
}) {
  return (
    <a
      href={href}
      onClick={onNavigate}
      className={s.cypCard}
      aria-current={active ? "page" : undefined}
    >
      <span className={s.cypCopy}>
        <span className={s.cypEyebrow}>{eyebrow}</span>
        <span className={s.cypTitle}>
          {lead} <span className={s.cypAccent}>{accent}</span>
        </span>
      </span>
      <span className={s.cypArrow} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 17L17 7M9 7h8v8" />
        </svg>
      </span>
    </a>
  );
}
