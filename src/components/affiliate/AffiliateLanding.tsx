"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { portalBaseFor, portalPath } from "@/lib/affiliate/site";
import { getWhatsAppLink } from "@/lib/store-settings";
import hero from "./AffiliateHero.module.css";
import why from "./AffiliateWhyJoin.module.css";
import how from "./AffiliateHowItWorks.module.css";
import faq from "./AffiliateFaq.module.css";
import cta from "./AffiliateCta.module.css";

/**
 * Landing page publik SAMAQU Affiliate Center — port 1:1 dari mockup
 * "samaqu-affiliate-mockup/pages/index.html" (tema di-scope lewat `.af-public`
 * di src/app/affiliate/public.css).
 *
 * Semua CTA mengarah ke halaman daftar/masuk portal. Angka di mockup tidak
 * ditampilkan sebagai janji; tidak ada persentase komisi di halaman ini.
 */

const CHECK_MARK = <path d="M5 12.5 9.5 17 19 7.5" />;

const DUTIES = [
  { full: "Bagikan link referral", short: "Bagikan link" },
  { full: "Ceritakan produk yang kamu pakai", short: "Ceritakan produknya" },
  { full: "Terima komisinya", short: "Terima komisi" },
];

const SAMAQU_DUTIES = [
  {
    label: "Stok barang",
    icon: (
      <>
        <path d="M21 8.5 12 3 3 8.5v7L12 21l9-5.5v-7Z" />
        <path d="m3.3 8.6 8.7 4.9 8.7-4.9M12 21v-7.5" />
      </>
    ),
  },
  {
    label: "Pengiriman paket",
    icon: (
      <>
        <path d="M3 16V6h11v10M14 9h4l3 3v4" />
        <circle cx="7" cy="18" r="2" />
        <circle cx="17.5" cy="18" r="2" />
      </>
    ),
  },
  {
    label: "Pembayaran",
    icon: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 9h18M7 15h4" />
      </>
    ),
  },
];

const WHY_FEATURES = [
  {
    title: "Link referral pribadi",
    text: "Setiap belanja lewat linkmu tercatat atas namamu.",
    icon: (
      <>
        <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
        <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
      </>
    ),
  },
  {
    title: "Pantau performa",
    text: "Lihat link mana yang paling banyak menghasilkan.",
    icon: (
      <>
        <path d="M4 19V5M4 19h16" />
        <path d="m7 15 4-4 3 3 5-6" />
      </>
    ),
  },
  {
    title: "Komisi transparan",
    text: "Status setiap komisi jelas, tanpa hitung manual.",
    icon: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <circle cx="12" cy="12" r="3.2" />
      </>
    ),
  },
  {
    title: "Riwayat lengkap",
    text: "Transaksi dan komisi tersimpan, cek kapan saja.",
    icon: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" />
      </>
    ),
  },
];

const WHY_AUDIENCE = [
  "Mahasiswa",
  "Karyawan",
  "Ibu rumah tangga",
  "Content creator",
  "Santri",
];

const CHART_BARS = [30, 45, 38, 60, 52, 75, 92];

const STAT_LABELS = ["Klik", "Transaksi", "Komisi"];

const STEPS = [
  {
    n: "01",
    title: "Kenali produk",
    text: "Pilih koleksi yang paling ingin kamu rekomendasikan.",
  },
  {
    n: "02",
    title: "Beli minimal 1 produk",
    text: "Rasakan sendiri kualitasnya, biar rekomendasimu tulus.",
    key: true,
  },
  {
    n: "03",
    title: "Daftar affiliate",
    text: "Akunmu diverifikasi dan disetujui admin.",
  },
  {
    n: "04",
    title: "Share & raih komisi",
    text: "Komisi hingga 20% dari setiap transaksi yang memenuhi syarat.",
  },
];

const FAQ = [
  {
    q: "Berapa komisi yang bisa saya dapat?",
    a: "Hingga 20% dari setiap transaksi yang memenuhi syarat. Besaran detailnya mengikuti ketentuan program.",
  },
  {
    q: "Apakah harus beli produk dulu?",
    a: "Ya, minimal satu produk SAMAQU. Supaya kamu kenal langsung produk yang kamu rekomendasikan.",
  },
  {
    q: "Ada biaya pendaftaran?",
    a: "Tidak ada. Daftar affiliate SAMAQU gratis.",
  },
  {
    q: "Bagaimana cara daftarnya?",
    a: "Setelah syarat pembelian terpenuhi, klik “Gabung Sekarang” dan isi formulirnya. Pengajuanmu diproses tim SAMAQU.",
  },
  {
    q: "Apakah akun langsung aktif?",
    a: "Belum. Akun diverifikasi dan disetujui admin dulu. Link referral bisa dipakai setelah akun aktif.",
  },
  {
    q: "Bagaimana memantau penjualan?",
    a: "Lewat Dashboard Affiliate. Ada performa link, riwayat transaksi, dan status komisi.",
  },
  {
    q: "Kapan komisi bisa dicairkan?",
    a: "Jadwal pencairan mengikuti ketentuan resmi program dan diinformasikan ke affiliate yang sudah aktif.",
  },
];

function Arrow() {
  return (
    <span className="arr" aria-hidden="true">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </span>
  );
}

const KATALOG = "https://www.samaqu.id/id/katalog";

export default function AffiliateLanding() {
  const [base, setBase] = useState("/affiliate");
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [sticky, setSticky] = useState(false);
  const [activeSection, setActiveSection] = useState("beranda");
  const [cookieVisible, setCookieVisible] = useState(false);
  const [cookieIn, setCookieIn] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);

  const daftarHref = portalPath(base, "daftar");
  const loginHref = portalPath(base, "login");
  const syaratHref = portalPath(base, "syarat-ketentuan");
  const kebijakanHref = portalPath(base, "kebijakan-privasi");

  useEffect(() => {
    setBase(portalBaseFor(window.location.hostname));
  }, []);

  // Nav solid saat discroll + sticky CTA di mobile (sama seperti mockup).
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 40);
      const hero = heroRef.current;
      const end = document.getElementById("gabung");
      const past = hero ? y > hero.offsetHeight * 0.8 : false;
      const atEnd = end ? end.getBoundingClientRect().top < window.innerHeight : false;
      setSticky(past && !atEnd);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Kunci scroll saat menu mobile terbuka.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    const onResize = () => {
      if (window.innerWidth >= 1024) setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [menuOpen]);

  // Sorot menu sesuai section yang terlihat.
  useEffect(() => {
    const sections = Array.from(
      rootRef.current?.querySelectorAll("main section[id]") || [],
    ) as HTMLElement[];
    if (!sections.length || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        });
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    sections.forEach((section) => io.observe(section));
    return () => io.disconnect();
  }, []);

  // Scroll reveal.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;
    const root = rootRef.current;
    if (!root) return;

    const groups = [".faq-item"];
    const singles = [
      "main section:not(.hero) .eyebrow",
      "main section:not(.hero) h2",
      "main section:not(.hero) h2 + p",
      "#gabung p",
      "#gabung .flex",
    ];
    const targets: HTMLElement[] = [];
    const skipped = (el: HTMLElement) => !!el.closest("[data-reveal-skip]");
    groups.forEach((selector) => {
      root.querySelectorAll<HTMLElement>(selector).forEach((el, index) => {
        if (skipped(el)) return;
        el.style.setProperty("--d", `${(index % 5) * 0.09}s`);
        targets.push(el);
      });
    });
    singles.forEach((selector) => {
      root.querySelectorAll<HTMLElement>(selector).forEach((el) => {
        if (!skipped(el)) targets.push(el);
      });
    });

    const ro = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            ro.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.1 },
    );
    targets.forEach((el) => {
      el.classList.add("reveal");
      ro.observe(el);
    });
    return () => ro.disconnect();
  }, []);

  // Banner cookie (sama seperti mockup: pilihan disimpan di localStorage).
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("samaqu_cookie_consent");
    } catch {
      /* localStorage bisa diblokir */
    }
    if (saved) return;
    setCookieVisible(true);
    const frame = requestAnimationFrame(() => setCookieIn(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const chooseCookie = (value: string) => {
    try {
      localStorage.setItem("samaqu_cookie_consent", value);
    } catch {
      /* abaikan */
    }
    setCookieIn(false);
    window.setTimeout(() => setCookieVisible(false), 300);
  };

  const navLink = (href: string, label: string, id: string) => (
    <a
      href={href}
      className="link"
      data-nav=""
      aria-current={activeSection === id ? "true" : "false"}
      onClick={() => setMenuOpen(false)}
    >
      {label}
    </a>
  );

  return (
    <div ref={rootRef} className={`af-public ${menuOpen ? "menu-open" : ""}`}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:bg-white focus:text-black focus:px-4 focus:py-2 focus:rounded-full"
      >
        Lewati ke konten
      </a>

      <header className={`nav ${scrolled ? "scrolled" : ""}`}>
        <div className="container h-full flex items-center justify-between gap-6">
          <a href="#beranda" className="wordmark" aria-label="SAMAQU, ke beranda">
            SAMAQU
          </a>
          <nav aria-label="Navigasi utama" className="hidden lg:flex items-center gap-9">
            {navLink("#beranda", "Beranda", "beranda")}
            {navLink("#keuntungan", "Keuntungan", "keuntungan")}
            {navLink("#cara-kerja", "Cara Kerja", "cara-kerja")}
            {navLink("#faq", "FAQ", "faq")}
          </nav>
          <div className="hidden lg:flex items-center gap-2">
            <Link href={loginHref} className="btn btn-sm btn-outline btn-nav-o">
              Masuk
            </Link>
            <Link href={daftarHref} className="btn btn-sm btn-nav">
              Gabung Affiliate
            </Link>
          </div>
          <button
            className="nav-toggle lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? "Tutup menu" : "Buka menu"}
            onClick={() => setMenuOpen((v) => !v)}
            type="button"
          >
            <span />
          </button>
        </div>
      </header>

      <div id="mobile-menu" className={`mobile-menu lg:hidden ${menuOpen ? "open" : ""}`} aria-hidden={!menuOpen}>
        <a href="#beranda" className="m-link" onClick={() => setMenuOpen(false)}>
          Beranda
        </a>
        <a href="#keuntungan" className="m-link" onClick={() => setMenuOpen(false)}>
          Keuntungan
        </a>
        <a href="#cara-kerja" className="m-link" onClick={() => setMenuOpen(false)}>
          Cara Kerja
        </a>
        <a href="#faq" className="m-link" onClick={() => setMenuOpen(false)}>
          FAQ
        </a>
        <div className="mt-auto grid gap-3">
          <Link href={daftarHref} className="btn btn-primary" onClick={() => setMenuOpen(false)}>
            Gabung Affiliate
          </Link>
          <Link href={loginHref} className="btn btn-outline" onClick={() => setMenuOpen(false)}>
            Masuk
          </Link>
        </div>
      </div>

      <main id="main">
        {/* HERO */}
        <section
          id="beranda"
          className={`${hero.root} on-dark`}
          ref={heroRef}
          aria-labelledby="affiliate-hero-title"
        >
          <div className={hero.inner}>
            <div className={hero.grid}>
              <div className={hero.copy}>
                <span className={hero.badge}>
                  <span className={hero.dot} aria-hidden="true" />
                  SAMAQU Affiliate Program
                </span>

                <h1 id="affiliate-hero-title" className={hero.title}>
                  Komisi hingga <span className={hero.highlight}>20%</span>
                  <span className={hero.titleLine}>dari setiap rekomendasi.</span>
                </h1>

                <p className={hero.sub}>
                  Gabung sekarang, bagikan link, raih komisinya. Tanpa modal stok, sisanya kami
                  yang urus.
                </p>

                <div className={hero.actions}>
                  <Link href={daftarHref} className={hero.primary}>
                    Gabung Sekarang
                  </Link>
                  <a href="#cara-kerja" className={hero.secondary}>
                    Lihat cara kerja
                  </a>
                </div>

                <p className={hero.fine}>
                  Gratis daftar · Tanpa stok · Cair ke rekening sendiri
                </p>
              </div>

              <div className={hero.demoWrap} aria-hidden="true">
                <div className={hero.demo}>
                  <p className={hero.demoLabel}>LINK REFERRAL KAMU</p>
                  <div className={hero.linkRow}>
                    <span className={hero.linkText}>
                      <span className={hero.linkPrefix}>samaqu.id/r/</span>
                      <span className={hero.linkName}>
                        namakamu<span className={hero.caret} />
                      </span>
                    </span>
                    <span className={hero.share}>Bagikan</span>
                  </div>
                </div>

                <div className={hero.note}>
                  <span className={hero.noteIcon}>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  </span>
                  Komisi baru tercatat
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* WHY / BENEFITS */}
        <section
          id="keuntungan"
          className={why.root}
          aria-labelledby="why-join-title"
          data-reveal-skip
        >
          <div className={why.inner}>
            <div className={`${why.header} ${why.reveal}`}>
              <p className={why.eyebrow}>KENAPA GABUNG</p>
              <h2 id="why-join-title" className={why.title}>
                Kamu cukup share.
                <span className={why.titleMuted}>Sisanya kami yang urus.</span>
              </h2>
            </div>

            <div className={`${why.dutyGrid} ${why.reveal}`}>
              <article className={`${why.card} ${why.dutyCard}`}>
                <h3 className={why.cardLabel}>TUGAS KAMU</h3>
                <ul className={why.dutyList}>
                  {DUTIES.map((duty) => (
                    <li key={duty.full} className={why.dutyItem}>
                      <span className={why.dutyIcon} aria-hidden="true">
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          {CHECK_MARK}
                        </svg>
                      </span>
                      <span className={why.itemFull}>{duty.full}</span>
                      <span className={why.itemShort}>{duty.short}</span>
                    </li>
                  ))}
                </ul>
              </article>

              <article className={`${why.card} ${why.oursCard}`}>
                <h3 className={why.cardLabel}>URUSAN SAMAQU</h3>
                <ul className={why.dutyList}>
                  {SAMAQU_DUTIES.map((item) => (
                    <li key={item.label} className={why.dutyItem}>
                      <span className={why.dutyIcon} aria-hidden="true">
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          {item.icon}
                        </svg>
                      </span>
                      <span>{item.label}</span>
                    </li>
                  ))}
                </ul>
              </article>
            </div>

            <div className={why.bento}>
              <article className={`${why.bentoCard} ${why.dashboard} ${why.reveal}`}>
                <div className={why.dashHead}>
                  <h3 className={why.dashTitle}>Dashboard Affiliate</h3>
                  <p className={why.dashDesc}>Link, performa, dan komisi dalam satu layar.</p>
                </div>

                <div className={why.mock} aria-hidden="true">
                  <div className={why.stats}>
                    {STAT_LABELS.map((label, index) => (
                      <div
                        key={label}
                        className={`${why.stat} ${
                          index === 2 ? why.statDark : why.statLight
                        }`}
                      >
                        <span className={why.statLabel}>{label}</span>
                        <span className={why.statBar} />
                      </div>
                    ))}
                  </div>
                  <div className={why.chart}>
                    {CHART_BARS.map((height, index) => (
                      <span
                        key={index}
                        className={`${why.bar} ${
                          index === 5 ? why.barMid : index === 6 ? why.barDark : ""
                        }`}
                        style={{ height: `${height}%` }}
                      />
                    ))}
                  </div>
                </div>
              </article>

              <div className={why.featureList}>
                {WHY_FEATURES.map((feature) => (
                  <article
                    key={feature.title}
                    className={`${why.feature} ${why.bentoCard} ${why.reveal}`}
                  >
                    <span className={why.featureIcon} aria-hidden="true">
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        {feature.icon}
                      </svg>
                    </span>
                    <h3 className={why.featureTitle}>{feature.title}</h3>
                    <p className={why.featureText}>{feature.text}</p>
                  </article>
                ))}
              </div>
            </div>

            <div className={`${why.audience} ${why.reveal}`}>
              <p className={why.audienceLabel}>Cocok buat</p>
              <ul className={why.chips}>
                {WHY_AUDIENCE.map((item) => (
                  <li key={item} className={why.chip}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS + FIRST STEP */}
        <section
          id="cara-kerja"
          className={how.root}
          aria-labelledby="how-title"
          data-reveal-skip
        >
          <div className={how.inner}>
            <div className={`${how.header} ${how.reveal}`}>
              <p className={how.eyebrow}>CARA KERJA</p>
              <h2 id="how-title" className={how.title}>
                Empat langkah.
                <span className={how.titleMuted}>Mulai hari ini.</span>
              </h2>
            </div>

            <div className={how.stepsWrap}>
              <span className={how.thread} aria-hidden="true" />
              <ol className={how.steps}>
                {STEPS.map((step, index) => (
                  <li
                    key={step.n}
                    className={`${how.step} ${step.key ? how.stepKey : ""} ${
                      index === STEPS.length - 1 ? how.stepLast : ""
                    } ${how.reveal}`}
                  >
                    <span className={how.circle} aria-hidden="true">
                      {step.n}
                    </span>
                    <div className={how.stepBody}>
                      <div className={how.stepHeading}>
                        <h3 className={how.stepTitle}>
                          <span className="sr-only">Langkah {step.n}: </span>
                          {step.title}
                        </h3>
                        {step.key ? <span className={how.badge}>Syarat wajib</span> : null}
                      </div>
                      <p className={how.stepDesc}>{step.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className={`${how.ctaGrid} ${how.reveal}`}>
              <article className={how.quoteCard}>
                <svg
                  className={how.quoteIcon}
                  viewBox="0 0 36 28"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M0 17.2C0 10.8 3.7 5.5 9.6 2.4l2.6 4.4c-3.4 2.1-5.3 4.7-5.6 7.5h4.8V28H0V17.2Zm20 0c0-6.4 3.7-11.7 9.6-14.8l2.6 4.4c-3.4 2.1-5.3 4.7-5.6 7.5H32V28H20V17.2Z" />
                </svg>
                <blockquote className={how.quote}>
                  Orang lebih percaya pada yang sudah memakai,
                  <span className={how.quoteMuted}>bukan yang cuma menjual.</span>
                </blockquote>
              </article>

              <div className={how.inviteWrap}>
                <article className={how.inviteCard}>
                  <div className={how.inviteText}>
                    <p className={how.inviteLabel}>Belum punya produk SAMAQU?</p>
                    <h3 className={how.inviteTitle}>Mulai dari koleksi favoritmu</h3>
                  </div>
                  <a href={KATALOG} className={`${how.cardButton} ${how.btnOutline}`}>
                    Lihat Koleksi
                    <svg
                      className={how.btnIcon}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M7 17 17 7M9 7h8v8" />
                    </svg>
                  </a>
                </article>

                <article className={how.inviteCard}>
                  <div className={how.inviteText}>
                    <p className={how.inviteLabel}>Sudah pernah beli?</p>
                    <h3 className={how.inviteTitle}>Tinggal satu langkah lagi</h3>
                  </div>
                  <Link href={daftarHref} className={`${how.cardButton} ${how.btnSolid}`}>
                    Gabung Sekarang
                    <svg
                      className={how.btnIcon}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </Link>
                </article>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className={faq.root} aria-labelledby="faq-title" data-reveal-skip>
          <div className={faq.inner}>
            <div className={faq.grid}>
              <div className={faq.left}>
                <div className={`${faq.header} ${faq.reveal}`}>
                  <p className={faq.eyebrow}>FAQ</p>
                  <h2 id="faq-title" className={faq.title}>
                    Masih ragu?
                    <span className={faq.titleMuted}>Kami jawab.</span>
                  </h2>
                </div>

                <p className={`${faq.skText} ${faq.reveal}`}>
                  Detail lengkap ada di{" "}
                  <Link href={syaratHref} className={faq.skLink}>
                    Syarat &amp; Ketentuan
                  </Link>{" "}
                  program.
                </p>

                <div className={`${faq.help} ${faq.reveal}`}>
                  <h3 className={faq.helpTitle}>Pertanyaanmu belum terjawab?</h3>
                  <p className={faq.helpText}>Tim kami siap bantu lewat chat.</p>
                  <a
                    href={getWhatsAppLink("Halo Admin SAMAQU, saya butuh bantuan.")}
                    target="_blank"
                    rel="noopener"
                    className={faq.helpButton}
                  >
                    <svg
                      className={faq.helpIcon}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M21 11.5a7.5 7.5 0 0 1-10.9 6.7L4 20l1.8-4.2A7.5 7.5 0 1 1 21 11.5Z" />
                      <path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" />
                    </svg>
                    Chat Admin
                  </a>
                </div>
              </div>

              <div className={`${faq.list} ${faq.reveal}`}>
                {FAQ.map((item, index) => (
                  <details key={item.q} className={faq.item} open={index === 0}>
                    <summary className={faq.summary}>
                      <span className={faq.question}>{item.q}</span>
                      <span className={faq.icon} aria-hidden="true" />
                    </summary>
                    <div className={faq.answer}>
                      <p>{item.a}</p>
                    </div>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section
          id="gabung"
          className={`${cta.root} on-dark`}
          aria-labelledby="cta-title"
          data-reveal-skip
        >
          <div className={cta.inner}>
            <div className={cta.grid}>
              <div className={`${cta.content} ${cta.reveal}`}>
                <p className={cta.eyebrow}>MULAI SEKARANG</p>
                <h2 id="cta-title" className={cta.title}>
                  Komisi pertamamu
                  <span className={cta.titleMuted}>dimulai dari satu link.</span>
                </h2>
                <p className={cta.sub}>
                  Gabung gratis, bagikan link, dan raih komisi hingga 20% dari setiap transaksi
                  yang memenuhi syarat.
                </p>
                <div className={cta.actions}>
                  <Link href={daftarHref} className={`${cta.button} ${cta.primary}`}>
                    Gabung Sekarang
                    <svg
                      className={cta.arrow}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </Link>
                  <a href={KATALOG} className={`${cta.button} ${cta.secondary}`}>
                    Lihat Koleksi
                  </a>
                </div>
                <p className={cta.small}>
                  Sudah punya akun?{" "}
                  <Link href={loginHref} className={cta.loginLink}>
                    Masuk
                  </Link>
                </p>
              </div>

              <div className={cta.number} aria-hidden="true">
                20%
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#0a0a0b] text-white on-dark">
        <div className="container py-14 lg:py-16 grid gap-10 md:grid-cols-12 md:gap-8 border-t border-white/10">
          <div className="md:col-span-5">
            <a href="#beranda" className="wordmark">
              SAMAQU
            </a>
            <p
              className="mt-4 max-w-xs text-[0.85rem] leading-relaxed"
              style={{ color: "var(--c-on-dark)" }}
            >
              Busana muslim pria premium: thobe, kandora, koko, vest, dan kabak. Untuk orang
              biasa yang sedang bertumbuh.
            </p>
            <p
              className="mt-6 text-[0.7rem] tracking-[0.14em] uppercase"
              style={{ color: "#6f7278" }}
            >
              Program affiliate resmi
            </p>
          </div>
          <nav className="md:col-span-3 md:col-start-7" aria-label="Navigasi footer">
            <p className="eyebrow mb-4" style={{ color: "#94969a" }}>
              Halaman
            </p>
            <ul className="grid gap-2.5">
              <li>
                <a href="#beranda" className="link text-[0.85rem]">
                  Beranda
                </a>
              </li>
              <li>
                <a href="#keuntungan" className="link text-[0.85rem]">
                  Keuntungan
                </a>
              </li>
              <li>
                <a href="#cara-kerja" className="link text-[0.85rem]">
                  Cara Kerja
                </a>
              </li>
              <li>
                <a href="#faq" className="link text-[0.85rem]">
                  FAQ
                </a>
              </li>
            </ul>
          </nav>
          <nav className="md:col-span-3" aria-label="Affiliate">
            <p className="eyebrow mb-4" style={{ color: "#94969a" }}>
              Affiliate
            </p>
            <ul className="grid gap-2.5">
              <li>
                <a href={KATALOG} className="link text-[0.85rem]">
                  Koleksi Produk
                </a>
              </li>
              <li>
                <Link href={daftarHref} className="link text-[0.85rem]">
                  Gabung Affiliate
                </Link>
              </li>
              <li>
                <Link href={loginHref} className="link text-[0.85rem]">
                  Masuk
                </Link>
              </li>
              <li>
                <Link href={syaratHref} className="link text-[0.85rem]">
                  Syarat &amp; Ketentuan
                </Link>
              </li>
              <li>
                <Link href={kebijakanHref} className="link text-[0.85rem]">
                  Kebijakan Privasi
                </Link>
              </li>
            </ul>
          </nav>
        </div>
        <div
          className="container py-5 pb-24 lg:pb-5 border-t border-white/10 flex flex-col sm:flex-row justify-between gap-2 text-[0.72rem]"
          style={{ color: "#7c7f85" }}
        >
          <p>© {new Date().getFullYear()} SAMAQU. Hak cipta dilindungi.</p>
          <p>samaqu.id</p>
        </div>
      </footer>

      <div className="sticky-cta lg:hidden">
        <Link href={daftarHref} className="btn btn-primary w-full shadow-2xl">
          Mulai Jadi Affiliate <Arrow />
        </Link>
      </div>

      {cookieVisible ? (
        <div
          className={`cookie-banner${cookieIn ? " show" : ""}`}
          role="region"
          aria-label="Persetujuan cookie"
        >
          <p>
            Kami memakai cookie untuk mencatat link referral
            <span className="cookie-extra"> dan meningkatkan pengalamanmu</span>. Baca{" "}
            <Link href={kebijakanHref}>Kebijakan Privasi</Link>.
          </p>
          <div className="cookie-actions">
            <button type="button" className="cookie-btn ghost" onClick={() => chooseCookie("ditolak")}>
              Tolak
            </button>
            <button type="button" className="cookie-btn" onClick={() => chooseCookie("diterima")}>
              Terima
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
