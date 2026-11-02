"use client";

import { User, MessageCircle } from "lucide-react";
import type { Locale } from "@/i18n/config";
import s from "./drawer-menu.module.css";

/**
 * Baris bawah drawer: toggle bahasa + tombol bulat Akun + tombol "Chat Admin".
 * Logic ganti bahasa, Akun, dan tautan WhatsApp TIDAK berubah — hanya tampilannya
 * mengikuti referensi (satu baris, Akun jadi tombol bulat ikon).
 */
export default function MenuFooter({
  locale,
  locales,
  accountLabel,
  chatLabel,
  chatHref,
  switchLocale,
  onNavigate,
}: {
  locale: Locale;
  locales: readonly Locale[];
  accountLabel: string;
  chatLabel: string;
  chatHref: string;
  switchLocale: (locale: Locale) => void;
  onNavigate: () => void;
}) {
  return (
    <div className={s.menuFooter}>
      <div className={s.langSwitch} role="group" aria-label="Bahasa">
        {locales.map((loc) => (
          <button
            key={loc}
            type="button"
            className={s.langButton}
            aria-pressed={locale === loc}
            onClick={() => {
              onNavigate();
              switchLocale(loc);
            }}
          >
            {loc.toUpperCase()}
          </button>
        ))}
      </div>

      <a
        href={`/${locale}/akun`}
        className={s.accountBtn}
        aria-label={accountLabel}
        title={accountLabel}
        onClick={onNavigate}
      >
        <User size={16} aria-hidden="true" />
      </a>

      <a
        href={chatHref}
        target="_blank"
        rel="noopener"
        className={s.chatButton}
        onClick={onNavigate}
      >
        <MessageCircle size={15} aria-hidden="true" />
        {chatLabel}
      </a>
    </div>
  );
}
