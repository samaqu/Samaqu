"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Kerangka halaman auth portal affiliate — port 1:1 dari mockup
 * "samaqu-affiliate-mockup/pages/{masuk,daftar}": panel foto gelap di kiri,
 * formulir di kanan, dan header transparan di atas foto (desktop).
 */
export default function AuthLayout({
  backHref,
  eyebrow,
  title,
  subtitle,
  topSlot,
  visualImage,
  visualImageAlt,
  visualPosition,
  visualEyebrow,
  visualTitle,
  visualText,
  visualList,
  children,
}: {
  backHref: string;
  eyebrow: string;
  title: string;
  subtitle: ReactNode;
  /** Elemen di atas judul (mis. stepper pendaftaran). */
  topSlot?: ReactNode;
  visualImage: string;
  visualImageAlt: string;
  visualPosition?: string;
  visualEyebrow: string;
  visualTitle: ReactNode;
  visualText?: string;
  visualList?: string[];
  children: ReactNode;
}) {
  return (
    <div className="af-public min-h-screen bg-white">
      <header className="nav solid auth-nav">
        <div className="container h-full flex items-center justify-between">
          <Link href={backHref} className="wordmark" aria-label="SAMAQU, ke beranda">
            SAMAQU
          </Link>
          <Link href={backHref} className="link">
            ← Kembali ke beranda
          </Link>
        </div>
      </header>

      <main className="auth">
        <aside className="auth-visual on-dark hidden lg:block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={visualImage}
            alt={visualImageAlt}
            style={visualPosition ? { objectPosition: visualPosition } : undefined}
          />
          <div className="relative z-10 h-full flex flex-col justify-end p-14">
            <p className="eyebrow mb-4" style={{ color: "var(--c-on-dark)" }}>
              {visualEyebrow}
            </p>
            <h2 className="display text-white text-5xl xl:text-6xl max-w-lg">{visualTitle}</h2>
            {visualText ? (
              <p className="mt-5 max-w-md" style={{ color: "var(--c-on-dark)" }}>
                {visualText}
              </p>
            ) : null}
            {visualList ? (
              <ul className="mt-8 grid gap-3 max-w-md text-sm" style={{ color: "var(--c-on-dark)" }}>
                {visualList.map((item, index) => (
                  <li key={item} className="flex gap-3">
                    <span className="text-white font-bold">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </aside>

        <section className="auth-form">
          <div>
            {topSlot}
            <p className="eyebrow mb-4">{eyebrow}</p>
            <h1 className="display text-4xl sm:text-5xl">{title}</h1>
            <p className="mt-3" style={{ color: "var(--c-text-2)" }}>
              {subtitle}
            </p>
            {children}
          </div>
        </section>
      </main>
    </div>
  );
}
