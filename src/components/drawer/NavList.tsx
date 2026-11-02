"use client";

import s from "./drawer-menu.module.css";
import { DRAWER_NAV, DRAWER_HELP } from "./drawer-nav";

/** Menu utama drawer — baris link besar dengan garis pemisah. */
export function NavList({
  locale,
  homeHref,
  currentPath,
  onNavigate,
  t,
}: {
  locale: string;
  homeHref: string;
  currentPath: string;
  onNavigate: () => void;
  t: (key: string) => string;
}) {
  const hrefOf = (path: string) => (path ? `/${locale}${path}` : homeHref);

  return (
    <nav className={s.navList} aria-label="Menu utama">
      {DRAWER_NAV.map((item) => {
        const href = hrefOf(item.path);
        return (
          <a
            key={item.labelKey}
            href={href}
            onClick={onNavigate}
            className={s.navLink}
            aria-current={currentPath === href ? "page" : undefined}
          >
            {t(item.labelKey)}
          </a>
        );
      })}
    </nav>
  );
}

/** Grid Bantuan 3 kolom × 2 baris. */
export function HelpGrid({
  locale,
  onNavigate,
  t,
}: {
  locale: string;
  onNavigate: () => void;
  t: (key: string) => string;
}) {
  return (
    <div className={s.helpSection}>
      <span className={s.sectionLabel}>{t("nav.bantuan_label")}</span>
      <div className={s.helpGrid}>
        {DRAWER_HELP.map((item) => (
          <a
            key={item.labelKey}
            href={item.external ? item.path : `/${locale}${item.path}`}
            className={s.helpLink}
            onClick={onNavigate}
            {...(item.external ? { target: "_blank", rel: "noopener" } : {})}
          >
            {t(item.labelKey)}
            {item.external ? <span aria-hidden="true"> ↗</span> : null}
          </a>
        ))}
      </div>
    </div>
  );
}
