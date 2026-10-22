"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { portalBaseFor, portalPath } from "@/lib/affiliate/site";

/**
 * Kerangka halaman legal portal affiliate — port 1:1 dari mockup
 * "samaqu-affiliate-mockup/pages/{syarat-ketentuan,kebijakan-privasi}".
 * Halaman ini publik (tanpa sesi); AffiliateShell melewatkannya lewat isPublicPath.
 */
export default function LegalPage({
  title,
  description,
  updated,
  toc,
  notice,
  children,
}: {
  title: ReactNode;
  description: string;
  updated?: string;
  toc: { href: string; label: string }[];
  notice: ReactNode;
  children: ReactNode;
}) {
  const [base, setBase] = useState("/affiliate");
  useEffect(() => {
    setBase(portalBaseFor(window.location.hostname));
  }, []);

  return (
    <div className="af-public min-h-screen bg-white">
      <header className="nav solid">
        <div className="container h-full flex items-center justify-between">
          <Link href={portalPath(base)} className="wordmark">
            SAMAQU
          </Link>
          <div className="flex items-center gap-2">
            <Link href={portalPath(base)} className="link hidden sm:inline mr-4">
              ← Beranda
            </Link>
            <Link href={portalPath(base, "daftar")} className="btn btn-sm btn-primary">
              Gabung Affiliate
            </Link>
          </div>
        </div>
      </header>

      <main style={{ paddingTop: "var(--nav-h)" }}>
        <section className="border-b" style={{ borderColor: "var(--c-bg-3)" }}>
          <div className="container" style={{ paddingTop: "5rem", paddingBottom: "5rem" }}>
            <p className="eyebrow mb-5">Dokumen program</p>
            <h1 className="display text-5xl sm:text-7xl max-w-4xl">{title}</h1>
            <p
              className="mt-6 max-w-2xl text-lg leading-relaxed"
              style={{ color: "var(--c-text-2)" }}
            >
              {description}
            </p>
            {updated ? (
              <p className="mt-6 text-sm" style={{ color: "var(--c-muted)" }}>
                Terakhir diperbarui: <span className="tbd">{updated}</span>
              </p>
            ) : null}
            <div className="notice mt-8 max-w-2xl">{notice}</div>
          </div>
        </section>

        <div
          className="container grid lg:grid-cols-12 gap-12"
          style={{ paddingTop: "5rem", paddingBottom: "6rem" }}
        >
          <nav className="lg:col-span-3 hidden lg:block" aria-label="Daftar isi">
            <div className="sticky top-28 toc">
              <p className="eyebrow mb-4">Daftar isi</p>
              {toc.map((item) => (
                <a key={item.href} href={item.href}>
                  {item.label}
                </a>
              ))}
            </div>
          </nav>

          <article className="terms lg:col-span-8 lg:col-start-5 max-w-3xl">{children}</article>
        </div>
      </main>

      <footer className="bg-black text-white on-dark">
        <div
          className="container py-8 text-xs flex flex-col sm:flex-row justify-between gap-2"
          style={{ color: "#94969a" }}
        >
          <p>© {new Date().getFullYear()} SAMAQU. Hak cipta dilindungi.</p>
          <div className="flex gap-6">
            <Link href={portalPath(base, "syarat-ketentuan")} className="link">
              Syarat &amp; Ketentuan
            </Link>
            <Link href={portalPath(base, "kebijakan-privasi")} className="link">
              Kebijakan Privasi
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
