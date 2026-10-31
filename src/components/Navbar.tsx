"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSafeLocale, useSafeTranslations } from "@/lib/safe-i18n";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { MobileDrawer, MobileDrawerCtx } from "@/components/ui/drawer";
import {
  Storefront,
  BookOpen,
  Ruler,
  ListChecks,
  Question,
  ChatCircle as MessageCircle,
  CaretDown,
  Bag,
  User,
} from "@phosphor-icons/react";
import { ShieldCheckIcon } from "@phosphor-icons/react/dist/csr/ShieldCheck";
import HouseIcon from "@/components/icons/HouseIcon";
import menu from "@/components/MobileMenu.module.css";
import ProfileDropdown from "@/components/ProfileDropdown";
import { CartBadge } from "@/components/CartBadge";
import CartDrawer from "@/components/CartDrawer";
import { getWhatsAppLink } from "@/lib/store-settings";
import { locales, type Locale } from "@/i18n/config";

/* ── Language flag icons ── */
const FLAG_LABELS: Record<Locale, string> = {
  id: "Bahasa Indonesia",
  en: "English",
};

function LocaleFlag({ code }: { code: Locale }) {
  if (code === "id") {
    return (
      <svg viewBox="0 0 18 12" className="block h-3 w-[18px]" aria-hidden="true">
        <rect width="18" height="6" fill="#CE1126" />
        <rect y="6" width="18" height="6" fill="#fff" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 18 12" className="block h-3 w-[18px]" aria-hidden="true">
      <rect width="18" height="12" fill="#012169" />
      <path d="M0 0 L18 12 M18 0 L0 12" stroke="#fff" strokeWidth="3" />
      <path d="M0 0 L18 12 M18 0 L0 12" stroke="#C8102E" strokeWidth="1.5" />
      <path d="M9 0 V12 M0 6 H18" stroke="#fff" strokeWidth="4" />
      <path d="M9 0 V12 M0 6 H18" stroke="#C8102E" strokeWidth="2" />
    </svg>
  );
}

/* ── Nav data ── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IconComponent = React.ComponentType<any>;

type MenuIconProps = {
  size?: number;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
};

function TruckIcon({ size = 16, className, "aria-hidden": ariaHidden }: MenuIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={ariaHidden}
    >
      <path d="M3 6h11v10H3zM14 10h4l3 3v3h-7z" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </svg>
  );
}
type NavItem = { label: string; href: string; hasDropdown?: false; Icon?: IconComponent } | { label: string; hasDropdown: true; Icon?: IconComponent };

function getNavItems(t: (key: string) => string): NavItem[] {
  return [
    { label: t("nav.home"), href: "/", Icon: HouseIcon },
    { label: t("nav.katalog"), href: "/katalog", Icon: Storefront },
    { label: t("nav.testimoni"), href: "/testimoni", Icon: MessageCircle },
    { label: t("nav.sama_quran"), href: "/sama-quran", Icon: BookOpen },
    { label: t("nav.bantuan"), hasDropdown: true, Icon: Question },
  ];
}

function getBantuanLinks(t: (key: string) => string) {
  return [
    { label: t("nav.panduan"), href: "/panduan-ukuran", Icon: Ruler },
    { label: t("nav.cara_pesan"), href: "/cara-pesan", Icon: ListChecks },
    { label: t("nav.faq"), href: "/faq", Icon: Question },
    { label: t("nav.cek_resi"), href: "/cek-resi", Icon: Bag },
    { label: t("nav.garansi_retur"), href: "/garansi-retur", Icon: Question },
    { label: t("nav.cyp"), href: "/create-your-price", Icon: Question },
  ];
}

/* ── Resolve anchor href: if not on home, prefix with / ── */
function resolveHref(href: string, isHome: boolean): string {
  if (href.startsWith("/#")) return isHome ? href.slice(1) : href;
  return href;
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const locale = useSafeLocale() as Locale;
  const t = useSafeTranslations();
  const isHome = pathname === `/${locale}` || pathname === "/";
  /*
   * Beranda & logo SELALU menuju halaman utama (`/`), termasuk untuk customer yang sudah
   * login. Dulu keduanya dialihkan ke dashboard akun (`/akun`), sehingga customer tidak bisa
   * kembali ke beranda lewat logo/nav — dashboard tetap bisa dibuka dari ikon akun.
   */
  const homeHref = `/${locale}`;
  const [openDropdown, setOpenDropdown] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const navItems = getNavItems(t);
  const bantuanLinks = getBantuanLinks(t);

  /* ── Scroll: transparent over hero → solid after hero ── */
  const onScroll = useCallback(() => {
    if (!isHome) { setScrolled(true); return; }
    const hero = document.getElementById("hero");
    const threshold = hero ? hero.offsetHeight - 90 : 200;
    setScrolled(window.scrollY > threshold);
  }, [isHome]);

  useEffect(() => {
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [onScroll]);

  /* ── Close desktop dropdown on outside click ── */
  useEffect(() => {
    if (!openDropdown) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [openDropdown]);

  /* ── Switch locale ── */
  function switchLocale(nextLocale: Locale) {
    // Remove current locale prefix from pathname
    const pathWithoutLocale = pathname.replace(new RegExp(`^/(id|en)`), "") || "/";
    router.push(`/${nextLocale}${pathWithoutLocale}`);
  }

  /* ── Styles ── */
  const shellStyle = scrolled
    ? {
        background: "rgba(243,243,243,.92)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(0,0,0,.35)",
        boxShadow: "0 8px 32px -16px rgba(0,0,0,.12)",
      }
    : {
        background: "transparent",
        backdropFilter: "none",
        WebkitBackdropFilter: "none",
        borderBottom: "1px solid rgba(0,0,0,.06)",
        boxShadow: "none",
      };

  // Hero sekarang terang & teksnya hitam, jadi navbar (transparan di atas hero) juga dibuat
  // gelap supaya logo & menu tetap kebaca — dulu light karena hero-nya gelap.
  const linkColor = "var(--espresso)";
  const ctaColor = "var(--espresso)";

  return (
    <MobileDrawerCtx.Provider value={{ open: menuOpen, setOpen: setMenuOpen }}>
      {/* ── Navbar: fixed, z-50 ── */}
      <header id="top" className="fixed top-0 inset-x-0 z-50">
        <div className="transition-all duration-500" style={shellStyle}>
          <div className="max-w-[1200px] mx-auto px-6 sm:px-10 lg:px-14">
            <nav
              className="flex items-center justify-between gap-4 h-[72px] sm:h-[84px]"
              role="navigation"
              aria-label="Navigasi utama"
            >
              {/* Logo */}
              <a
                href={homeHref}
                className="inline-flex items-center leading-none shrink-0 cursor-pointer"
                aria-label="SAMAQU — kembali ke beranda"
              >
                <img
                  src="/logo.svg"
                  alt="SAMAQU"
                  className="h-8 sm:h-10 w-auto"
                />
              </a>

              {/* Desktop nav */}
              <nav className="hidden lg:flex items-center gap-1" style={{ color: linkColor }}>
                {navItems.map((item) => {
                  const href = item.hasDropdown
                    ? "#"
                    : item.href === "/"
                      ? homeHref
                      : `/${locale}${item.href}`;
                  if (!item.hasDropdown) {
                    const isActive = pathname === href || pathname === `${href}/`;
                    return (
                      <Link
                        key={item.label}
                        href={href}
                        className={`rounded-full px-4 py-2 text-[13px] tracking-[0.14em] uppercase font-ui font-medium transition-colors ${
                          isActive ? "text-gold" : "hover:text-gold"
                        }`}
                        style={{ color: "inherit" }}
                      >
                        {item.label}
                      </Link>
                    );
                  }

                  // Bantuan dropdown (desktop)
                  return (
                    <div key={item.label} className="relative" ref={dropdownRef}>
                      <button
                        onClick={() => setOpenDropdown((v) => !v)}
                        aria-expanded={openDropdown}
                        className={`flex items-center gap-1 rounded-full px-4 py-2 text-[13px] tracking-[0.14em] uppercase font-ui font-medium transition-colors ${
                          openDropdown ? "text-gold" : "hover:text-gold"
                        }`}
                        style={{ color: "inherit" }}
                      >
                        {item.label}
                        <CaretDown
                          className={`h-3.5 w-3.5 transition-transform duration-300 ${
                            openDropdown ? "rotate-180" : ""
                          }`}
                        />
                      </button>

                      <AnimatePresence>
                        {openDropdown && (
                          <motion.div
                            initial={{ opacity: 0, y: -8, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -8, scale: 0.97 }}
                            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                            className="absolute right-0 top-full z-20 mt-2 w-52 overflow-hidden rounded-2xl border p-1.5 shadow-lg"
                            style={{
                              background: "rgba(243,243,243,.97)",
                              borderColor: "rgba(0,0,0,.3)",
                              backdropFilter: "blur(16px)",
                            }}
                          >
                            {bantuanLinks.map((link) => (
                              <Link
                                key={link.label}
                                href={`/${locale}${resolveHref(link.href, isHome)}`}
                                onClick={() => setOpenDropdown(false)}
                                className="flex w-full items-center rounded-xl px-3.5 py-2.5 text-sm font-ui font-medium transition-colors hover:bg-[rgba(0,0,0,.15)]"
                                style={{ color: "var(--espresso)" }}
                              >
                                {link.label}
                              </Link>
                            ))}
                            <div className="mt-1 border-t pt-1.5" style={{ borderColor: "rgba(0,0,0,.2)" }}>
                              <a
                                href={getWhatsAppLink("Halo Admin SAMAQU, saya butuh bantuan.")}
                                target="_blank"
                                rel="noopener"
                                onClick={() => setOpenDropdown(false)}
                                className="flex w-full items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-ui font-medium transition-colors hover:bg-[rgba(0,0,0,.15)]"
                                style={{ color: "var(--gold)" }}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M17.6 6.3A7.85 7.85 0 0 0 12 4a7.94 7.94 0 0 0-6.9 11.9L4 20l4.2-1.1A7.9 7.9 0 0 0 12 19.9 7.94 7.94 0 0 0 17.6 6.3Z" />
                                </svg>
                                {t("nav.chat_admin")}
                              </a>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </nav>

              {/* Right: language switcher + profile (desktop) + cart + hamburger */}
              <div className="flex items-center gap-3 sm:gap-4">
                {/* Language switcher */}
                <div className="flex items-center rounded-full overflow-hidden" style={{ border: "1px solid rgba(0,0,0,.2)" }}>
                  {locales.map((loc) => (
                    <button
                      key={loc}
                      onClick={() => switchLocale(loc)}
                      aria-label={FLAG_LABELS[loc]}
                      title={FLAG_LABELS[loc]}
                      className="grid place-items-center px-2.5 py-1.5 transition-all duration-200"
                      style={{
                        background: locale === loc ? "var(--espresso)" : "transparent",
                        opacity: locale === loc ? 1 : 0.6,
                      }}
                    >
                      <LocaleFlag code={loc} />
                    </button>
                  ))}
                </div>

                {/* Profile — desktop only (di mobile disembunyikan; Akun tetap ada di drawer) */}
                <div className="hidden lg:block">
                  <ProfileDropdown />
                </div>

                <button
                  onClick={() => setCartOpen(true)}
                  className="relative grid place-items-center w-10 h-10 rounded-full transition-colors duration-500 cursor-pointer"
                  style={{ color: ctaColor }}
                  aria-label="Keranjang belanja"
                >
                  <Bag size={20} />
                  <CartBadge />
                </button>
                <button
                  className="lg:hidden grid place-items-center w-10 h-10 -mr-2 rounded-full transition-colors duration-500"
                  style={{ color: ctaColor }}
                  aria-label="Buka menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen(true)}
                >
                  <span className="nav-hamburger" data-open={menuOpen || undefined}>
                    <span />
                    <span />
                    <span />
                  </span>
                </button>
              </div>
            </nav>
          </div>
        </div>
      </header>

      {/* ── Mobile Drawer ── */}
      <MobileDrawer title="SAMAQU">
        <DrawerNavContent
          onClose={() => setMenuOpen(false)}
          homeHref={homeHref}
          locale={locale}
          t={t}
          switchLocale={switchLocale}
        />
      </MobileDrawer>

      {/* ── Cart Drawer ── */}
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </MobileDrawerCtx.Provider>
  );
}

/* ── Mobile drawer nav content ── */
function DrawerNavContent({
  onClose,
  homeHref,
  locale,
  t,
  switchLocale,
}: {
  onClose: () => void;
  homeHref: string;
  locale: Locale;
  t: (key: string) => string;
  switchLocale: (locale: Locale) => void;
}) {
  const pathname = usePathname();
  const currentPath = (pathname || "").replace(/\/$/, "");
  const createYourPriceHref = `/${locale}/create-your-price`;

  const mainLinks = [
    { label: t("nav.home"), href: homeHref },
    { label: t("nav.katalog"), href: `/${locale}/katalog` },
    { label: t("nav.testimoni"), href: `/${locale}/testimoni` },
    { label: t("nav.sama_quran"), href: `/${locale}/sama-quran` },
    { label: t("nav.tentang"), href: `/${locale}/tentang-kami` },
  ];

  const helpLinks: { label: string; href: string; Icon: React.ComponentType<MenuIconProps> }[] = [
    { label: t("nav.panduan"), href: `/${locale}/panduan-ukuran`, Icon: Ruler },
    { label: t("nav.cara_pesan"), href: `/${locale}/cara-pesan`, Icon: Bag },
    { label: t("nav.faq"), href: `/${locale}/faq`, Icon: Question },
    { label: t("nav.cek_resi"), href: `/${locale}/cek-resi`, Icon: TruckIcon },
    { label: t("nav.garansi_retur"), href: `/${locale}/garansi-retur`, Icon: ShieldCheckIcon },
  ];

  const isActive = (href: string) =>
    currentPath === href ||
    (href !== `/${locale}` && currentPath.startsWith(`${href}/`));

  return (
    <nav className={menu.nav} aria-label="Menu utama">
      <a
        href={createYourPriceHref}
        className={menu.createCard}
        onClick={onClose}
        aria-current={currentPath === createYourPriceHref ? "page" : undefined}
      >
        <span className={menu.createCopy}>
          <span className={menu.createLabel}>{t("nav.program")}</span>
          <span className={menu.createTitle}>
            {t("nav.cyp_lead")}{" "}
            <span className={menu.priceWord}>{t("nav.cyp_accent")}</span>
          </span>
        </span>
        <span className={menu.createArrow} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 17 17 7M9 7h8v8" />
          </svg>
        </span>
      </a>

      <ul className={menu.mainList}>
        {mainLinks.map((item) => (
          <li key={item.href} className={menu.mainItem}>
            <a
              href={item.href}
              className={menu.mainLink}
              onClick={onClose}
              aria-current={isActive(item.href) ? "page" : undefined}
            >
              <span className={menu.mainTextMask}>
                <span className={menu.mainText}>{item.label}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>

      <div className={menu.helpSection}>
        <p className={menu.helpLabel}>{t("nav.bantuan")}</p>
        <div className={menu.helpGrid}>
          {helpLinks.map((item, index) => (
            <a
              key={item.href}
              href={item.href}
              className={`${menu.helpLink} ${index === helpLinks.length - 1 ? menu.helpLinkWide : ""}`}
              onClick={onClose}
            >
              <item.Icon size={16} className={menu.helpIcon} aria-hidden="true" />
              <span>{item.label}</span>
            </a>
          ))}
        </div>

        <a
          href="https://affiliate.samaqu.id/"
          target="_blank"
          rel="noopener"
          className={menu.affiliateBox}
          onClick={onClose}
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={menu.affiliateIcon}
            aria-hidden="true"
          >
            <circle cx="9" cy="7" r="3" />
            <path d="M3 20c0-4 2.8-7 6-7 2.2 0 4.2 1.2 5.3 3" />
            <path d="M18 8v6M15 11h6" />
          </svg>
          <span>{t("nav.affiliate_program")}</span>
          <span className={menu.affiliateArrow} aria-hidden="true">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 17 17 7M9 7h8v8" />
            </svg>
          </span>
        </a>
      </div>

      <div className={menu.bottom}>
        <div className={menu.bottomRow}>
          <div className={menu.langSwitch} role="group" aria-label="Bahasa">
            {locales.map((loc) => (
              <button
                key={loc}
                type="button"
                className={menu.langButton}
                aria-pressed={locale === loc}
                onClick={() => {
                  onClose();
                  switchLocale(loc);
                }}
              >
                {loc.toUpperCase()}
              </button>
            ))}
          </div>

          <a href={`/${locale}/akun`} className={menu.accountLink} onClick={onClose}>
            <User size={16} className={menu.accountIcon} aria-hidden="true" />
            <span>{t("nav.account")}</span>
          </a>
        </div>

        <a
          href={getWhatsAppLink("Halo Admin SAMAQU, saya tertarik dengan koleksi Anda dan ingin bertanya soal pemesanan.")}
          target="_blank"
          rel="noopener"
          className={menu.chatButton}
          onClick={onClose}
        >
          <MessageCircle size={18} className={menu.chatIcon} aria-hidden="true" />
          <span>{t("nav.chat_admin")}</span>
        </a>
      </div>
    </nav>
  );
}

/* ── Cart badge — pindah ke src/components/CartBadge.tsx (dipakai bersama
      dengan ikon keranjang halaman detail produk, mobile). ── */

