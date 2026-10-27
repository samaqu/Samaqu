"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { portalBaseFor, portalPath } from "@/lib/affiliate/site";

/**
 * Landing page publik SAMAQU Affiliate Center — port 1:1 dari mockup
 * "samaqu-affiliate-mockup/pages/index.html" (tema di-scope lewat `.af-public`
 * di src/app/affiliate/public.css).
 *
 * Semua CTA mengarah ke halaman daftar/masuk portal. Angka di mockup tidak
 * ditampilkan sebagai janji; tidak ada persentase komisi di halaman ini.
 */

const BENEFITS = [
  {
    title: "Link Referral Pribadi",
    text: "Link unik milikmu sendiri. Siapa pun yang belanja lewat link ini tercatat sebagai hasil rekomendasimu.",
    icon: (
      <>
        <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
        <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
      </>
    ),
  },
  {
    title: "Pantau Performa Penjualan",
    text: "Lihat link mana yang paling banyak menghasilkan transaksi.",
    icon: (
      <>
        <path d="M4 19V5M4 19h16" />
        <path d="M8 15l4-4 3 3 5-6" />
      </>
    ),
  },
  {
    title: "Komisi yang Transparan",
    text: "Status komisi setiap transaksi jelas, tanpa hitung-hitungan manual.",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v10M9.5 9.5c0-1 1-1.8 2.5-1.8s2.5.8 2.5 1.8-1 1.6-2.5 2-2.5 1-2.5 2 1 1.8 2.5 1.8 2.5-.8 2.5-1.8" />
      </>
    ),
  },
  {
    title: "Dashboard Affiliate",
    text: "Semua aktivitasmu dalam satu layar: link, ringkasan, dan info akun.",
    icon: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18M9 9v11" />
      </>
    ),
  },
  {
    title: "Riwayat Transaksi & Komisi",
    text: "Setiap transaksi dan komisi tersimpan rapi, bisa kamu cek kapan saja.",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  },
];

const STEPS = [
  {
    n: "01",
    title: "Kenali Produk SAMAQU",
    text: "Pelajari koleksinya dan pilih produk yang paling ingin kamu rekomendasikan.",
  },
  {
    n: "02",
    title: "Beli Minimal Satu Produk",
    text: "Wajib sebelum bergabung. Rasakan sendiri kualitasnya, supaya rekomendasimu tulus dan meyakinkan.",
    key: true,
  },
  {
    n: "03",
    title: "Daftar Jadi Affiliate",
    text: "Ajukan pendaftaran. Akunmu akan diverifikasi dan disetujui admin sesuai ketentuan program.",
  },
  {
    n: "04",
    title: "Bagikan & Raih Komisi",
    text: "Akun aktif, link siap dibagikan. Dapatkan komisi dari setiap transaksi yang memenuhi syarat.",
  },
];

const FAQ = [
  {
    q: "Apa itu SAMAQU Affiliate?",
    a: "Program untuk kamu yang ingin dapat penghasilan tambahan dengan merekomendasikan produk SAMAQU lewat link referral pribadi. Kamu memperoleh komisi dari transaksi yang memenuhi syarat.",
  },
  {
    q: "Bagaimana cara mendapatkan komisi?",
    a: "Setelah akunmu aktif, bagikan link referral milikmu. Komisi diberikan untuk transaksi melalui link tersebut yang memenuhi syarat sesuai ketentuan program.",
  },
  {
    q: "Apakah harus membeli produk terlebih dahulu?",
    a: "Ya. Calon affiliate wajib membeli minimal satu produk SAMAQU sebelum mendaftar, agar mengenal langsung produk yang akan direkomendasikan.",
  },
  {
    q: "Bagaimana cara mendaftar?",
    a: "Setelah syarat pembelian terpenuhi, klik “Gabung Affiliate” dan lengkapi formulir pendaftaran. Pengajuanmu akan diproses oleh tim SAMAQU.",
  },
  {
    q: "Apakah pendaftaran langsung membuat akun aktif?",
    a: "Belum. Setiap pendaftaran melalui verifikasi dan persetujuan admin sesuai ketentuan program. Link referral bisa digunakan setelah akun disetujui dan aktif.",
  },
  {
    q: "Bagaimana cara mengetahui performa penjualan?",
    a: "Lewat Dashboard Affiliate. Di sana kamu bisa memantau performa, riwayat transaksi, dan status komisi setelah akun aktif.",
  },
  {
    q: "Kapan komisi dapat dicairkan?",
    a: "Jadwal dan mekanisme pencairan mengikuti ketentuan resmi program SAMAQU Affiliate, yang akan diinformasikan kepada affiliate yang sudah aktif.",
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
  const [openFaq, setOpenFaq] = useState<number | null>(null);
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

    const groups = ["#keuntungan .tile", "#cara-kerja .step", ".faq-item"];
    const singles = [
      "main section:not(.hero) .eyebrow",
      "main section:not(.hero) h2",
      "main section:not(.hero) h2 + p",
      "#keuntungan .lg\\:col-span-4",
      "#persyaratan .grid",
      "#gabung p",
      "#gabung .flex",
      "#cara-kerja .btn",
    ];
    const targets: HTMLElement[] = [];
    groups.forEach((selector) => {
      root.querySelectorAll<HTMLElement>(selector).forEach((el, index) => {
        el.style.setProperty("--d", `${(index % 5) * 0.09}s`);
        targets.push(el);
      });
    });
    singles.forEach((selector) => {
      root.querySelectorAll<HTMLElement>(selector).forEach((el) => targets.push(el));
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
        <section id="beranda" className="hero on-dark" ref={heroRef}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/affiliate/mockup/hero.png"
            alt="Model mengenakan thobe SAMAQU warna maroon"
            className="hero-bg"
          />
          <div className="container hero-inner w-full pt-40 pb-20 lg:pt-48 lg:pb-28">
            <div className="grid lg:grid-cols-12 gap-12 lg:gap-10 items-end">
              <div className="lg:col-span-7">
                <span className="pill glass text-white mb-7">
                  <span className="w-2 h-2 rounded-full bg-white" />
                  Pendaftaran affiliate dibuka
                </span>
                <h1 className="display text-white mt-1 sm:mt-7 text-[clamp(2.1rem,4.7vw,3.55rem)] leading-[1.05] tracking-[-0.03em]">
                  Jadi bagian dari SAMAQU,{" "}
                  <span className="serif font-normal">raih penghasilan tambahan</span> dari
                  setiap penjualan.
                </h1>
                <p
                  className="mt-6 text-[0.98rem] sm:text-[1.05rem] leading-relaxed max-w-[46ch]"
                  style={{ color: "var(--c-on-dark)" }}
                >
                  Kamu sudah sering merekomendasikan barang ke teman. Sekarang rekomendasimu
                  bisa dihitung — bagikan link referral dan dapatkan komisi dari setiap transaksi
                  yang memenuhi syarat.
                </p>
                <div className="mt-8 flex flex-col sm:flex-row sm:items-center gap-3">
                  <Link href={daftarHref} className="btn btn-light">
                    Mulai Jadi Affiliate <Arrow />
                  </Link>
                  <a href="#cara-kerja" className="btn btn-ghost">
                    Pelajari cara kerjanya
                  </a>
                </div>
                <ul
                  className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.78rem]"
                  style={{ color: "var(--c-on-dark)" }}
                >
                  {["Gratis gabung", "Tanpa stok barang", "Cair ke rekening sendiri"].map((item, i) => (
                    <li key={item} className="flex items-center gap-5">
                      {i > 0 && (
                        <span
                          aria-hidden
                          className="w-px h-3"
                          style={{ background: "rgba(255,255,255,.25)" }}
                        />
                      )}
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="lg:col-span-5 lg:col-start-8 mt-8 lg:mt-0">
                <div className="glass p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <p
                      className="text-[0.66rem] font-semibold tracking-[0.18em] uppercase"
                      style={{ color: "var(--c-on-dark)" }}
                    >
                      Link referral kamu
                    </p>
                    <span
                      className="text-[0.66rem] tracking-[0.12em] uppercase"
                      style={{ color: "rgba(255,255,255,.45)" }}
                    >
                      contoh
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2 bg-white text-black rounded-full pl-4 pr-1.5 py-1.5">
                    <code className="text-[0.8rem] font-semibold truncate">
                      samaqu.id/r/namakamu
                    </code>
                    <span className="pill bg-black text-white text-[0.68rem]">Bagikan</span>
                  </div>

                  <div
                    className="mt-5 pt-5 grid gap-4"
                    style={{ borderTop: "1px solid rgba(255,255,255,.14)" }}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className="shrink-0 w-8 h-8 rounded-full grid place-items-center"
                        style={{ background: "rgba(255,255,255,.1)" }}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#fff"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          aria-hidden="true"
                        >
                          <path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" />
                          <path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" />
                        </svg>
                      </span>
                      <p
                        className="text-[0.82rem] leading-relaxed"
                        style={{ color: "var(--c-on-dark)" }}
                      >
                        Satu link untuk WhatsApp, Instagram, atau TikTok. Setiap transaksi
                        tercatat atas namamu.
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <span
                        className="shrink-0 w-8 h-8 rounded-full grid place-items-center"
                        style={{ background: "rgba(255,255,255,.1)" }}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#fff"
                          strokeWidth="1.7"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M6 7h12l-1 13H7L6 7z" />
                          <path d="M9 7a3 3 0 0 1 6 0" />
                        </svg>
                      </span>
                      <p className="text-[0.82rem] leading-relaxed text-white">
                        Syarat gabung: sudah pernah beli minimal{" "}
                        <b className="font-semibold">1 produk SAMAQU</b>.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* WHY / BENEFITS */}
        <section id="keuntungan" className="section">
          <div className="container">
            <div className="grid lg:grid-cols-12 gap-6 lg:gap-10 items-end mb-10 lg:mb-14">
              <div className="lg:col-span-7">
                <p className="eyebrow">01 — Kenapa gabung</p>
                <h2 className="display mt-4 text-[clamp(1.75rem,3.3vw,2.6rem)] leading-[1.1] tracking-[-0.03em]">
                  Tanpa stok barang. <span className="serif font-normal">Cukup</span> satu link
                  dan kepercayaan teman-temanmu.
                </h2>
              </div>
              <p
                className="lg:col-span-4 lg:col-start-9 text-[0.95rem] leading-relaxed"
                style={{ color: "var(--c-text-2)" }}
              >
                Kamu tidak perlu buka toko, kirim paket, atau urus pembayaran — cukup ceritakan
                produk yang sudah kamu pakai sendiri.
              </p>
            </div>

            <div className="grid gap-3 lg:grid-cols-12">
              <article className="relative overflow-hidden rounded-[24px] bg-[#0a0a0b] text-white lg:col-span-7 lg:row-span-2 min-h-[360px] sm:min-h-[420px] flex flex-col justify-between p-7 sm:p-8">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/affiliate/mockup/visual-login.png"
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 w-full h-full object-cover opacity-50"
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(180deg,rgba(10,10,11,.15) 0%,rgba(10,10,11,.55) 55%,rgba(10,10,11,.95) 100%)",
                  }}
                />
                <span
                  className="relative shrink-0 w-11 h-11 rounded-2xl grid place-items-center"
                  style={{
                    background: "rgba(255,255,255,.12)",
                    border: "1px solid rgba(255,255,255,.18)",
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="w-5 h-5"
                    fill="none"
                    stroke="#fff"
                    strokeWidth={1.6}
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    {BENEFITS[0].icon}
                  </svg>
                </span>
                <div className="relative max-w-md">
                  <h3 className="text-[1.55rem] sm:text-[1.8rem] font-extrabold leading-[1.15] tracking-[-0.02em]">
                    {BENEFITS[0].title}
                  </h3>
                  <p
                    className="mt-3 text-[0.9rem] leading-relaxed"
                    style={{ color: "var(--c-on-dark)" }}
                  >
                    {BENEFITS[0].text}
                  </p>
                </div>
              </article>

              {BENEFITS.slice(1, 3).map((benefit) => (
                <article
                  key={benefit.title}
                  className="rounded-[24px] border border-[#e8e8e9] bg-white p-6 sm:p-7 lg:col-span-5 flex gap-4 transition-colors hover:border-black"
                >
                  <span className="shrink-0 w-10 h-10 rounded-xl grid place-items-center border border-[#e8e8e9]">
                    <svg
                      viewBox="0 0 24 24"
                      className="w-5 h-5"
                      fill="none"
                      stroke="#000"
                      strokeWidth={1.6}
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      {benefit.icon}
                    </svg>
                  </span>
                  <div>
                    <h3 className="text-[1rem] font-bold tracking-[-0.01em]">{benefit.title}</h3>
                    <p
                      className="mt-1.5 text-[0.85rem] leading-relaxed"
                      style={{ color: "var(--c-text-2)" }}
                    >
                      {benefit.text}
                    </p>
                  </div>
                </article>
              ))}

              {BENEFITS.slice(3).map((benefit) => (
                <article
                  key={benefit.title}
                  className="rounded-[24px] border border-[#e8e8e9] bg-white p-6 sm:p-7 lg:col-span-6 flex gap-4 transition-colors hover:border-black"
                >
                  <span className="shrink-0 w-10 h-10 rounded-xl grid place-items-center border border-[#e8e8e9]">
                    <svg
                      viewBox="0 0 24 24"
                      className="w-5 h-5"
                      fill="none"
                      stroke="#000"
                      strokeWidth={1.6}
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      {benefit.icon}
                    </svg>
                  </span>
                  <div>
                    <h3 className="text-[1rem] font-bold tracking-[-0.01em]">{benefit.title}</h3>
                    <p
                      className="mt-1.5 text-[0.85rem] leading-relaxed"
                      style={{ color: "var(--c-text-2)" }}
                    >
                      {benefit.text}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="cara-kerja" className="section pt-0">
          <div className="container">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-10">
              <div className="max-w-2xl">
                <p className="eyebrow">02 — Cara kerja</p>
                <h2 className="display mt-4 text-[clamp(1.75rem,3.3vw,2.6rem)] leading-[1.1] tracking-[-0.03em]">
                  Empat langkah. <span className="serif font-normal">Mulai</span> hari ini.
                </h2>
              </div>
              <Link href={daftarHref} className="btn btn-primary self-start lg:self-auto">
                Gabung Sekarang <Arrow />
              </Link>
            </div>

            <div
              role="list"
              className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px overflow-hidden rounded-[24px] border border-[#e8e8e9]"
              style={{ background: "#e8e8e9" }}
            >
              {STEPS.map((step) => (
                <article
                  key={step.n}
                  role="listitem"
                  className={`flex flex-col p-6 sm:p-7 ${
                    step.key ? "bg-[#0a0a0b] text-white" : "bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[0.66rem] font-semibold tracking-[0.18em] uppercase ${
                        step.key ? "text-white/60" : "text-neutral-500"
                      }`}
                    >
                      Langkah {step.n}
                    </span>
                    <span
                      className={`w-8 h-8 rounded-full grid place-items-center text-[0.7rem] font-bold ${
                        step.key ? "bg-white text-black" : "border border-[#e8e8e9] text-black"
                      }`}
                    >
                      {step.n}
                    </span>
                  </div>
                  <h3 className="mt-8 text-[1.02rem] font-bold leading-snug tracking-[-0.01em]">
                    <span className="sr-only">{`Langkah ${Number(step.n)}: `}</span>
                    {step.title}
                  </h3>
                  <p
                    className="mt-2 text-[0.85rem] leading-relaxed"
                    style={{ color: step.key ? "var(--c-on-dark)" : "var(--c-text-2)" }}
                  >
                    {step.text}
                  </p>
                  {step.key ? (
                    <span className="pill bg-white text-black mt-5 self-start text-[0.68rem]">
                      Syarat wajib
                    </span>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* PURCHASE REQUIREMENT */}
        <section id="persyaratan" className="pb-20 lg:pb-24">
          <div className="container">
            <div className="grid lg:grid-cols-2 overflow-hidden rounded-[28px] bg-[#0a0a0b] text-white on-dark">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/affiliate/mockup/requirement.png"
                alt="Pelanggan membawa garment bag SAMAQU"
                className="w-full h-64 sm:h-[380px] lg:h-full object-cover"
              />
              <div className="p-7 sm:p-12 lg:p-14 xl:p-16 flex flex-col justify-center">
                <p className="eyebrow" style={{ color: "var(--c-on-dark)" }}>
                  03 — Langkah pertamamu
                </p>
                <h2 className="display text-white mt-4 text-[clamp(1.6rem,3vw,2.35rem)] leading-[1.15] tracking-[-0.025em] max-w-[22ch]">
                  Mulai dari mengenal produk, lanjut jadi partner SAMAQU.
                </h2>
                <p
                  className="mt-5 max-w-md text-[0.95rem] leading-relaxed"
                  style={{ color: "var(--c-on-dark)" }}
                >
                  Sebelum bergabung sebagai affiliate, pastikan kamu sudah membeli minimal satu
                  produk SAMAQU. Dengan begitu, kamu bisa mengenal produk yang akan kamu
                  rekomendasikan kepada calon pelanggan.
                </p>
                <p className="mt-4 max-w-md text-[0.9rem] font-semibold">
                  Orang lebih percaya pada yang sudah memakai, bukan yang cuma menjual.
                </p>
                <a href={KATALOG} className="btn btn-light mt-8 self-start">
                  Lihat Koleksi SAMAQU <Arrow />
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="section" style={{ background: "var(--c-bg-2)" }}>
          <div className="container grid lg:grid-cols-12 gap-8 lg:gap-10">
            <div className="lg:col-span-4 lg:sticky lg:top-28 self-start">
              <p className="eyebrow">04 — FAQ</p>
              <h2 className="display mt-4 text-[clamp(1.75rem,3vw,2.4rem)] leading-[1.1] tracking-[-0.03em]">
                Masih ragu? <span className="serif font-normal">Kami jawab.</span>
              </h2>
              <p className="mt-5 text-[0.9rem] leading-relaxed" style={{ color: "var(--c-text-2)" }}>
                Selengkapnya baca{" "}
                <Link
                  href={syaratHref}
                  className="font-semibold text-black underline underline-offset-4"
                >
                  Syarat &amp; Ketentuan program
                </Link>
                .
              </p>
            </div>
            <div className="lg:col-span-7 lg:col-start-6 bg-white rounded-[24px] border border-[#e8e8e9] px-5 sm:px-8 py-2">
              {FAQ.map((item, index) => {
                const open = openFaq === index;
                return (
                  <div className={`faq-item${open ? " open" : ""}`} key={item.q}>
                    <h3>
                      <button
                        className="faq-q"
                        aria-expanded={open}
                        aria-controls={`faq-${index + 1}`}
                        onClick={() => setOpenFaq(open ? null : index)}
                        type="button"
                      >
                        {item.q}
                        <span className="faq-icon" aria-hidden="true" />
                      </button>
                    </h3>
                    <div id={`faq-${index + 1}`} className="faq-a" aria-hidden={!open}>
                      <div>
                        <p>{item.a}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section id="gabung" className="relative bg-[#0a0a0b] text-white on-dark overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/affiliate/mockup/visual-cta.png"
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover opacity-30"
            style={{ objectPosition: "50% 25%" }}
          />
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg,rgba(10,10,11,.95) 0%,rgba(10,10,11,.75) 45%,rgba(10,10,11,.2) 85%)",
            }}
          />
          <div className="container relative py-24 lg:py-32">
            <div className="max-w-2xl">
              <p className="eyebrow" style={{ color: "var(--c-on-dark)" }}>
                Mulai sekarang
              </p>
              <h2 className="display text-white mt-5 text-[clamp(2rem,4.2vw,3.4rem)] leading-[1.05] tracking-[-0.03em]">
                Siap memulai perjalananmu{" "}
                <span className="serif font-normal">bersama</span> SAMAQU?
              </h2>
              <p
                className="mt-5 max-w-xl text-[0.98rem] leading-relaxed"
                style={{ color: "var(--c-on-dark)" }}
              >
                Kenali produk SAMAQU, penuhi persyaratan pembelian, dan mulai langkahmu untuk
                menjadi bagian dari program affiliate.
              </p>
              <div className="mt-9 flex flex-col sm:flex-row gap-3">
                <a href={KATALOG} className="btn btn-light">
                  Jelajahi Produk <Arrow />
                </a>
                <Link href={loginHref} className="btn btn-ghost">
                  Masuk Affiliate
                </Link>
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
            Kami memakai cookie untuk mencatat link referral dan meningkatkan pengalamanmu. Baca{" "}
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
