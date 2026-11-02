"use client";

import s from "./drawer-menu.module.css";

/**
 * Kartu program "Gratis Cover Hanger" di drawer mobile.
 *
 * Menonjol dibanding kartu lain: background krem, border + glow hijau, ikon hanger
 * di kotak hijau, bar kuota, dan tombol "Ambil Bonus".
 *
 * ANIMASI (kilau, titik berdenyut, hanger bergoyang, panah maju-mundur) hanya
 * berjalan saat `animating` true (drawer terbuka). `prefers-reduced-motion`
 * dimatikan lewat CSS.
 */
export default function FchCard({
  href,
  eyebrow,
  titlePre,
  titleAccent,
  note,
  priceBefore,
  priceFree,
  quotaText,
  cta,
  quotaPct,
  showQuota,
  animating,
  onNavigate,
}: {
  href: string;
  eyebrow: string;
  titlePre: string;
  titleAccent: string;
  note: string;
  priceBefore: string;
  priceFree: string;
  /** Teks "Tinggal 34/100 bonus" — null kalau kuota tidak tersedia. */
  quotaText: string | null;
  cta: string;
  /** 0–100, lebar bar kuota. */
  quotaPct: number;
  showQuota: boolean;
  animating: boolean;
  onNavigate: () => void;
}) {
  return (
    <a
      href={href}
      onClick={onNavigate}
      className={s.fchCard}
      data-anim={animating || undefined}
    >
      <span className={s.fchShine} aria-hidden="true" />

      <div className={s.fchHead}>
        <span className={s.fchIcon}>
          <svg
            className={s.fchHanger}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10 6.5a2 2 0 1 1 2.8 1.8c-.5.3-.8.8-.8 1.4V11" />
            <path d="M12 11L3.2 17.2c-.8.6-.4 1.8.6 1.8h16.4c1 0 1.4-1.2.6-1.8L12 11z" />
          </svg>
        </span>

        <div className={s.fchCopy}>
          <span className={s.fchEyebrow}>
            <span className={s.fchDot} aria-hidden="true" />
            {eyebrow}
          </span>
          <span className={s.fchTitle}>
            {titlePre} <span className={s.fchAccent}>{titleAccent}</span>
          </span>
          <span className={s.fchNote}>
            {note}
            <span className={s.fchStrike}>{priceBefore}</span>
            <span className={s.fchFree}>{priceFree}</span>
          </span>
        </div>
      </div>

      <div className={s.fchFoot}>
        {showQuota ? (
          <div className={s.fchQuota}>
            <span className={s.fchBar}>
              <span className={s.fchBarFill} style={{ width: `${quotaPct}%` }} />
            </span>
            {quotaText ? <span className={s.fchQuotaText}>{quotaText}</span> : null}
          </div>
        ) : null}

        <span className={s.fchCta} data-grow={showQuota ? undefined : "1"}>
          {cta}
          <svg
            className={s.fchNudge}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </div>
    </a>
  );
}
