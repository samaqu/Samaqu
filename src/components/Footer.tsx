"use client";

import { useStoreSettings, getWhatsAppLink } from "@/lib/store-settings";
import { useSafeTranslations } from "@/lib/safe-i18n";
import s from "./Footer.module.css";

function getNavLinks(t: (key: string) => string) {
  return [
    { href: "/katalog", label: t("nav.katalog") },
    { href: "/testimoni", label: t("nav.testimoni") },
    { href: "/tentang-kami", label: t("nav.tentang") },
    { href: "/faq", label: t("nav.faq") },
  ];
}

function getHelpLinks(t: (key: string) => string) {
  return [
    { href: "/cek-resi", label: t("nav.cek_resi") },
    { href: "/cara-pesan", label: t("nav.cara_pesan") },
    { href: "/faq", label: t("nav.faq") },
    { href: "/panduan-ukuran", label: t("nav.panduan") },
    { href: "/create-your-price", label: t("nav.cyp") },
  ];
}

export default function Footer() {
  const t = useSafeTranslations();
  const settings = useStoreSettings();
  const instagramUrl = settings.instagram_url || "";
  const navLinks = getNavLinks(t);
  const helpLinks = getHelpLinks(t);

  return (
    <footer className={s.footer}>
      <div className={s.container}>
        <div className={s.main}>
          <div className={s.brandBlock}>
            <img src="/logo.svg" alt="SAMAQU" className={s.logo} style={{ filter: "invert(1) brightness(0.9)" }} />
            <p className={s.tagline}>{t("footer.tagline")}</p>

            <div className={s.connect}>
              <p className={s.heading}>{t("footer.connected")}</p>
              <div className={s.socials}>
                {instagramUrl && (
                  <a
                    href={instagramUrl}
                    target="_blank"
                    rel="noopener"
                    aria-label="Instagram"
                    className={s.social}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="2" y="2" width="20" height="20" rx="5" />
                      <circle cx="12" cy="12" r="5" />
                      <circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" stroke="none" />
                    </svg>
                  </a>
                )}
                <a
                  href={getWhatsAppLink("Halo Admin SAMAQU, saya tertarik dengan koleksi Anda dan ingin bertanya soal pemesanan.")}
                  target="_blank"
                  rel="noopener"
                  aria-label="WhatsApp Admin SAMAQU"
                  className={s.social}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" />
                    <path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1zm0 0a5 5 0 0 0 5 5m0 0a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1h1z" />
                  </svg>
                </a>
              </div>
            </div>
          </div>

          <div className={s.linkColumns}>
            <nav aria-label="Navigasi footer" className={s.linkColumn}>
              <p className={s.heading}>{t("footer.nav")}</p>
              <ul className={s.links}>
                {navLinks.map((link) => (
                  <li key={link.href}>
                    <a href={link.href} className={s.link}>
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            <nav aria-label="Bantuan footer" className={s.linkColumn}>
              <p className={s.heading}>{t("footer.help")}</p>
              <ul className={s.links}>
                {helpLinks.map((link) => (
                  <li key={link.href}>
                    <a href={link.href} className={s.link}>
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>

        <div className={s.bottom}>
          <p className={s.copyright}>{t("footer.copyright")}</p>
        </div>
      </div>
    </footer>
  );
}
