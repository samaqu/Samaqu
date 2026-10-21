"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Kerangka halaman auth portal affiliate.
 *
 * Mengikuti referensi desain terbaru: halaman gelap, satu kartu putih dengan panel kiri
 * menyudut (teal) berisi brand + headline, dan panel kanan berisi formulir. Dibuat polos
 * dan lapang supaya mudah dibaca — tanpa foto, avatar, sosial, atau elemen dekoratif lain.
 */

const WHATSAPP_URL = "https://wa.me/6285212150100";

export default function AuthLayout({
  title,
  subtitle,
  children,
  footerLink,
  heroTitle = "Program Affiliate SAMAQU.",
  heroSubtitle = "Bagikan produk, dapatkan komisi.",
  aside,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  /** Link kecil di bawah form (mis. "Belum punya akun? Daftar"). */
  footerLink: { text: string; link: string; linkLabel: string };
  heroTitle?: string;
  heroSubtitle?: string;
  /** Baris kecil tambahan di panel kanan (mis. link lupa kata sandi). */
  aside?: ReactNode;
}) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0b0b0c] p-4 md:p-8">
      <div className="w-full max-w-[1000px] rounded-[22px] bg-white p-2.5 md:p-3 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]">
        <div className="overflow-hidden rounded-[16px] flex flex-col md:flex-row md:min-h-[520px]">
          {/* Panel kiri — bersudut miring di desktop */}
          <div className="relative w-full md:w-[46%] min-h-[280px] md:min-h-0">
            <div
              className="absolute inset-0 md:hidden"
              style={{
                background: "linear-gradient(165deg, #2f7183 0%, #1f5a6c 42%, #123b49 100%)",
              }}
            />
            <div
              className="hidden md:block absolute inset-0"
              style={{
                background: "linear-gradient(165deg, #2f7183 0%, #1f5a6c 42%, #123b49 100%)",
                clipPath: "polygon(0 0, 100% 0, 84% 100%, 0 100%)",
              }}
            />
            <div className="relative flex h-full flex-col justify-between gap-10 p-7 md:p-9 md:pr-14">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-white text-[17px] font-black text-[#1f5a6c]">
                  S
                </span>
                <span className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/90">
                  SAMAQU
                </span>
              </div>

              <div>
                <h2 className="text-[30px] md:text-[38px] font-extrabold leading-[1.12] text-white">
                  {heroTitle}
                </h2>
                <p className="mt-3 max-w-[300px] text-[13px] md:text-[14px] leading-relaxed text-white/70">
                  {heroSubtitle}
                </p>
              </div>

              <p className="text-[12px] leading-relaxed text-white/60">
                Belum punya akses? Hubungi admin via{" "}
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-white underline decoration-white/40 underline-offset-2 hover:decoration-white"
                >
                  WhatsApp
                </a>
                .
              </p>
            </div>
          </div>

          {/* Panel kanan — formulir */}
          <div className="flex w-full md:w-[54%] flex-col justify-center bg-white px-6 py-9 md:px-12 md:py-12">
            <div className="w-full max-w-[360px]">
              <h1 className="text-[26px] md:text-[30px] font-extrabold leading-tight text-[#111827]">
                {title}
              </h1>
              <p className="mt-2 text-[13px] leading-relaxed text-[#6b7280]">{subtitle}</p>

              <div className="mt-7">{children}</div>

              {aside ? <div className="mt-3 text-right">{aside}</div> : null}

              <p className="mt-6 text-[12px] text-[#6b7280]">
                {footerLink.text}{" "}
                <Link
                  href={footerLink.link}
                  className="font-semibold text-[#111827] hover:underline"
                >
                  {footerLink.linkLabel} →
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
