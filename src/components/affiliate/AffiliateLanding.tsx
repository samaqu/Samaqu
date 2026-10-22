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
          <div className="container hero-inner w-full pt-40 pb-24 lg:pt-48 lg:pb-32">
            <div className="grid lg:grid-cols-12 gap-10 items-end">
              <div className="lg:col-span-7">
                <span className="pill glass text-white mb-7">
                  <span className="w-2 h-2 rounded-full bg-white" />
                  Pendaftaran affiliate dibuka
                </span>
                <h1 className="display text-white text-[2.6rem] sm:text-6xl xl:text-[5.25rem]">
                  Jadi Bagian dari SAMAQU, Raih{" "}
                  <span className="serif font-normal">Penghasilan Tambahan</span> dari Setiap
                  Penjualan.
                </h1>
                <p
                  className="mt-7 text-lg sm:text-xl leading-relaxed max-w-xl"
                  style={{ color: "var(--c-on-dark)" }}
                >
                  Kamu sudah sering merekomendasikan barang ke teman. Sekarang, rekomendasimu
                  bisa dihitung. Bagikan link referral milikmu dan dapatkan komisi dari setiap
                  transaksi yang memenuhi syarat.
                </p>
                <div className="mt-10 flex flex-col sm:flex-row gap-3">
                  <Link href={daftarHref} className="btn btn-light">
                    Mulai Jadi Affiliate <Arrow />
                  </Link>
                  <a href="#cara-kerja" className="btn btn-ghost">
                    Pelajari Cara Kerjanya
                  </a>
                </div>
              </div>
              <div className="lg:col-span-4 lg:col-start-9 grid gap-3 mt-6 lg:mt-0">
                <div className="glass p-5">
                  <p
                    className="text-xs font-semibold tracking-widest uppercase"
                    style={{ color: "var(--c-on-dark)" }}
                  >
                    Link referral kamu
                  </p>
                  <div className="mt-3 flex items-center justify-between gap-3 bg-white text-black rounded-full pl-5 pr-1.5 py-1.5">
                    <code className="text-sm font-semibold truncate">samaqu.id/r/namakamu</code>
                    <span className="pill bg-black text-white text-xs">Bagikan</span>
                  </div>
                  <p className="mt-3 text-sm" style={{ color: "var(--c-on-dark)" }}>
                    Satu link. Kirim lewat WhatsApp, Instagram, atau TikTok. Setiap transaksi
                    tercatat atas namamu.
                  </p>
                </div>
                <div className="glass p-5 flex items-center gap-4">
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#fff"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    <path d="M6 7h12l-1 13H7L6 7z" />
                    <path d="M9 7a3 3 0 0 1 6 0" />
                  </svg>
                  <p className="text-sm text-white">
                    Syarat gabung: beli minimal <b>1 produk SAMAQU</b> dulu.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* WHY / BENEFITS */}
        <section id="keuntungan" className="section">
          <div className="container">
            <div className="grid lg:grid-cols-12 gap-8 mb-14 items-end">
              <div className="lg:col-span-7">
                <p className="eyebrow mb-5">Kenapa gabung</p>
                <h2 className="display text-5xl sm:text-6xl">
                  Tanpa stok barang. <span className="serif font-normal">Cukup</span> satu link
                  dan kepercayaan teman-temanmu.
                </h2>
              </div>
              <p
                className="lg:col-span-4 lg:col-start-9 text-lg leading-relaxed"
                style={{ color: "var(--c-text-2)" }}
              >
                Kamu tidak perlu buka toko, kirim paket, atau urus pembayaran. Tugasmu cuma
                satu: ceritakan produk yang sudah kamu pakai sendiri.
              </p>
            </div>

            <div className="grid md:grid-cols-6 gap-4">
              <article className="tile tile-dark md:col-span-4 md:row-span-2 min-h-[420px] flex flex-col justify-between">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/affiliate/mockup/visual-login.png"
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 w-full h-full object-cover opacity-45"
                />
                <div className="relative ico text-white">
                  <svg viewBox="0 0 24 24">{BENEFITS[0].icon}</svg>
                </div>
                <div className="relative max-w-md">
                  <h3 className="text-3xl sm:text-4xl">{BENEFITS[0].title}</h3>
                  <p className="mt-3 leading-relaxed" style={{ color: "var(--c-on-dark)" }}>
                    {BENEFITS[0].text}
                  </p>
                </div>
              </article>
              {BENEFITS.slice(1, 3).map((benefit) => (
                <article key={benefit.title} className="tile md:col-span-2">
                  <div className="ico">
                    <svg viewBox="0 0 24 24">{benefit.icon}</svg>
                  </div>
                  <h3 className="mt-8 text-black">{benefit.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--c-text-2)" }}>
                    {benefit.text}
                  </p>
                </article>
              ))}
              {BENEFITS.slice(3).map((benefit) => (
                <article key={benefit.title} className="tile md:col-span-3">
                  <div className="ico">
                    <svg viewBox="0 0 24 24">{benefit.icon}</svg>
                  </div>
                  <h3 className="mt-8 text-black">{benefit.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--c-text-2)" }}>
                    {benefit.text}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="cara-kerja" className="section pt-0">
          <div className="container">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-12">
              <div className="max-w-2xl">
                <p className="eyebrow mb-5">Cara kerja</p>
                <h2 className="display text-5xl sm:text-6xl">Empat langkah. Mulai hari ini.</h2>
              </div>
              <Link href={daftarHref} className="btn btn-primary self-start lg:self-auto">
                Gabung Sekarang <Arrow />
              </Link>
            </div>
            <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 list-none p-0">
              {STEPS.map((step) => (
                <li key={step.n} className={`step${step.key ? " key" : ""}`}>
                  <span className="step-num" aria-hidden="true">
                    {step.n}
                  </span>
                  <h3 className="mt-10 text-xl font-extrabold tracking-tight">
                    <span className="sr-only">{`Langkah ${Number(step.n)}: `}</span>
                    {step.title}
                  </h3>
                  <p
                    className="mt-3 text-sm leading-relaxed"
                    style={{ color: step.key ? "var(--c-on-dark)" : "var(--c-text-2)" }}
                  >
                    {step.text}
                  </p>
                  {step.key ? (
                    <span className="pill bg-white text-black mt-6 self-start">Syarat wajib</span>
                  ) : null}
                </li>
              ))}
            </ol>
            <p className="swipe-hint" aria-hidden="true">
              Geser untuk lanjut{" "}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </p>
          </div>
        </section>

        {/* PURCHASE REQUIREMENT */}
        <section id="persyaratan" className="pb-24">
          <div className="container">
            <div className="grid lg:grid-cols-2 rounded-[28px] overflow-hidden bg-black text-white on-dark">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/affiliate/mockup/requirement.png"
                alt="Pelanggan membawa garment bag SAMAQU"
                className="w-full h-72 sm:h-[420px] lg:h-full object-cover"
              />
              <div className="p-8 sm:p-12 lg:p-16 flex flex-col justify-center">
                <p className="eyebrow mb-5" style={{ color: "var(--c-on-dark)" }}>
                  Langkah pertamamu
                </p>
                <h2 className="display text-white text-4xl sm:text-5xl">
                  Mulai dari Mengenal Produk, Lanjut Jadi Partner SAMAQU.
                </h2>
                <p className="mt-6 leading-relaxed text-lg" style={{ color: "var(--c-on-dark)" }}>
                  Sebelum bergabung sebagai affiliate, pastikan kamu sudah membeli minimal satu
                  produk SAMAQU. Dengan begitu, kamu bisa mengenal produk yang akan kamu
                  rekomendasikan kepada calon pelanggan.
                </p>
                <p className="mt-4 font-semibold">
                  Orang lebih percaya pada yang sudah memakai, bukan yang cuma menjual.
                </p>
                <a href={KATALOG} className="btn btn-light mt-9 self-start">
                  Lihat Koleksi SAMAQU <Arrow />
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="section" style={{ background: "var(--c-bg-2)" }}>
          <div className="container grid lg:grid-cols-12 gap-10">
            <div className="lg:col-span-4">
              <p className="eyebrow mb-5">FAQ</p>
              <h2 className="display text-5xl">Masih ragu? Kami jawab.</h2>
              <p className="mt-5 leading-relaxed" style={{ color: "var(--c-text-2)" }}>
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
            <div className="lg:col-span-7 lg:col-start-6 bg-white rounded-[28px] px-6 sm:px-10 py-2">
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
        <section id="gabung" className="relative bg-black text-white on-dark overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/affiliate/mockup/visual-cta.png"
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover opacity-35"
            style={{ objectPosition: "50% 25%" }}
          />
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(0deg,#0a0a0b 10%,rgba(10,10,11,.4))" }}
          />
          <div className="container relative py-28 lg:py-40 text-center">
            <h2 className="display text-white text-5xl sm:text-7xl lg:text-8xl max-w-5xl mx-auto">
              Siap Memulai Perjalananmu <span className="serif font-normal">Bersama</span> SAMAQU?
            </h2>
            <p
              className="mt-7 text-lg max-w-xl mx-auto leading-relaxed"
              style={{ color: "var(--c-on-dark)" }}
            >
              Kenali produk SAMAQU, penuhi persyaratan pembelian, dan mulai langkahmu untuk
              menjadi bagian dari program affiliate.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
              <a href={KATALOG} className="btn btn-light">
                Jelajahi Produk <Arrow />
              </a>
              <Link href={loginHref} className="btn btn-ghost">
                Masuk Affiliate
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-black text-white on-dark">
        <div className="container pt-16 pb-10 grid md:grid-cols-12 gap-10 border-t border-white/10">
          <div className="md:col-span-5">
            <a href="#beranda" className="wordmark">
              SAMAQU
            </a>
            <p className="mt-4 text-sm leading-relaxed max-w-sm" style={{ color: "var(--c-on-dark)" }}>
              Busana muslim pria premium: thobe, kandora, koko, vest, dan kabak. Untuk orang
              biasa yang sedang bertumbuh.
            </p>
          </div>
          <nav className="md:col-span-3 md:col-start-7" aria-label="Navigasi footer">
            <p className="eyebrow mb-4" style={{ color: "#94969a" }}>
              Halaman
            </p>
            <ul className="grid gap-2">
              <li>
                <a href="#beranda" className="link">
                  Beranda
                </a>
              </li>
              <li>
                <a href="#keuntungan" className="link">
                  Keuntungan
                </a>
              </li>
              <li>
                <a href="#cara-kerja" className="link">
                  Cara Kerja
                </a>
              </li>
              <li>
                <a href="#faq" className="link">
                  FAQ
                </a>
              </li>
            </ul>
          </nav>
          <nav className="md:col-span-3" aria-label="Affiliate">
            <p className="eyebrow mb-4" style={{ color: "#94969a" }}>
              Affiliate
            </p>
            <ul className="grid gap-2">
              <li>
                <a href={KATALOG} className="link">
                  Koleksi Produk
                </a>
              </li>
              <li>
                <Link href={daftarHref} className="link">
                  Gabung Affiliate
                </Link>
              </li>
              <li>
                <Link href={loginHref} className="link">
                  Masuk
                </Link>
              </li>
              <li>
                <Link href={syaratHref} className="link">
                  Syarat &amp; Ketentuan
                </Link>
              </li>
              <li>
                <Link href={kebijakanHref} className="link">
                  Kebijakan Privasi
                </Link>
              </li>
            </ul>
          </nav>
        </div>
        <div
          className="container pb-24 lg:pb-8 text-xs flex flex-col sm:flex-row justify-between gap-2"
          style={{ color: "#94969a" }}
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
