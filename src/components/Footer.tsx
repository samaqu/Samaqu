"use client";

import { useStoreSettings, getWhatsAppLink } from "@/lib/store-settings";
import { useSafeLocale, useSafeTranslations } from "@/lib/safe-i18n";
import s from "./Footer.module.css";

/** Satu baris link di kolom footer. */
interface FooterLink {
  /** Path internal TANPA prefix bahasa (mis. "/katalog"), atau URL absolut untuk tautan luar. */
  path: string;
  /** Key terjemahan namespace `nav`. */
  labelKey: string;
  /** true = buka di tab baru (tautan luar seperti portal affiliate). */
  external?: boolean;
}

interface FooterColumn {
  /** Key terjemahan judul kolom, namespace `footer`. */
  headingKey: string;
  /** aria-label kolom. */
  ariaKey: string;
  links: FooterLink[];
}

/**
 * SUSUNAN LINK FOOTER — satu sumber data.
 *
 * Untuk menambah link: cukup tambah satu entri di kolom yang dituju, lalu tambahkan
 * key terjemahannya di `src/i18n/messages/{id,en}.json` (namespace `nav`). Komponen
 * tidak perlu disentuh.
 *
 * Urutan kolom = urutan render (kiri → kanan di desktop).
 */
const FOOTER_COLUMNS: FooterColumn[] = [
  {
    headingKey: "footer.nav",
    ariaKey: "Navigasi footer",
    links: [
      // FAQ sengaja tidak di sini — sudah ada di kolom Bantuan.
      { path: "/katalog", labelKey: "nav.katalog" },
      { path: "/testimoni", labelKey: "nav.testimoni" },
      { path: "/tentang-kami", labelKey: "nav.tentang" },
    ],
  },
  {
    headingKey: "nav.program",
    ariaKey: "Program footer",
    links: [
      { path: "/create-your-price", labelKey: "nav.cyp" },
      { path: "/promo/free-cover-hanger", labelKey: "nav.free_cover_hanger" },
      { path: "/sama-quran", labelKey: "nav.sama_quran" },
      { path: "https://affiliate.samaqu.id/", labelKey: "nav.affiliate_program", external: true },
    ],
  },
  {
    headingKey: "footer.help",
    ariaKey: "Bantuan footer",
    links: [
      { path: "/cek-resi", labelKey: "nav.cek_resi" },
      { path: "/cara-pesan", labelKey: "nav.cara_pesan" },
      { path: "/faq", labelKey: "nav.faq" },
      { path: "/panduan-ukuran", labelKey: "nav.panduan" },
    ],
  },
];

/** Path internal → ikut prefix bahasa yang sedang aktif, sama seperti link footer sebelumnya. */
function localizeHref(locale: string, path: string): string {
  return `/${locale}${path}`;
}

export default function Footer() {
  const t = useSafeTranslations();
  const locale = useSafeLocale();
  const settings = useStoreSettings();
  const instagramUrl = settings.instagram_url || "";

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
            {FOOTER_COLUMNS.map((column) => (
              <nav key={column.headingKey} aria-label={column.ariaKey} className={s.linkColumn}>
                <p className={s.heading}>{t(column.headingKey)}</p>
                <ul className={s.links}>
                  {column.links.map((link) => (
                    <li key={link.path}>
                      <a
                        href={link.external ? link.path : localizeHref(locale, link.path)}
                        className={s.link}
                        {...(link.external ? { target: "_blank", rel: "noopener" } : {})}
                      >
                        {t(link.labelKey)}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className={s.bottom}>
          <p className={s.copyright}>{t("footer.copyright")}</p>
        </div>
      </div>
    </footer>
  );
}
