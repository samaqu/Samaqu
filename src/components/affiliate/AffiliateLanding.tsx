"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { portalBaseFor, portalPath } from "@/lib/affiliate/site";

/**
 * Landing page publik SAMAQU Affiliate Center (`/affiliate` sebelum login).
 *
 * Semua CTA mengarah ke halaman login/daftar yang sudah ada. Angka di bagian
 * "Pratinjau dashboard" adalah ILUSTRASI dan diberi label jelas — tidak ada
 * persentase komisi atau janji penghasilan.
 */

const TEAL = "#1f6274";
const INK = "#111827";
const MUTED = "#6b7280";

const BENEFITS = [
  {
    title: "Link referral pribadi",
    text: "Setiap affiliate mendapat kode sendiri. Bagikan link produk ke WhatsApp, Instagram, atau komunitasmu.",
  },
  {
    title: "Pemantauan penjualan",
    text: "Lihat klik dan pesanan yang masuk dari link kamu, tanpa perlu hitung manual.",
  },
  {
    title: "Laporan komisi",
    text: "Komisi tercatat per pesanan beserta statusnya: menunggu validasi, disetujui, atau dibayarkan.",
  },
  {
    title: "Pengajuan pencairan",
    text: "Ajukan pencairan saldo komisi langsung dari dashboard, lalu pantau prosesnya.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Daftar menjadi affiliate",
    text: "Isi data diri, lalu tim SAMAQU memverifikasi riwayat pembelianmu sebagai syarat bergabung.",
  },
  {
    n: "02",
    title: "Bagikan link referral",
    text: "Pilih produk, buat link, dan bagikan ke orang-orang yang mungkin tertarik.",
  },
  {
    n: "03",
    title: "Pantau penjualan & komisi",
    text: "Semua klik, pesanan, dan komisi terlihat di dashboard — termasuk pengajuan pencairan.",
  },
];

const FAQ = [
  {
    q: "Bagaimana cara kerja referral SAMAQU?",
    a: "Kamu membagikan link affiliate. Saat ada orang membuka link lalu membeli produk SAMAQU, pesanan itu tercatat atas nama akun affiliate kamu dan masuk ke dashboard.",
  },
  {
    q: "Bagaimana komisi dihitung?",
    a: "Besar komisi mengikuti ketentuan Program Affiliate yang berlaku dan dihitung otomatis oleh sistem dari nilai pesanan yang valid. Nilai ketentuan ditetapkan oleh SAMAQU, jadi bisa berubah sesuai kebijakan program.",
  },
  {
    q: "Kapan komisi bisa dicairkan?",
    a: "Komisi berstatus disetujui bisa diajukan pencairan lewat menu Penarikan Dana. Pengajuan diproses admin dan statusnya bisa kamu pantau di dashboard.",
  },
  {
    q: "Apakah wajib pernah membeli produk SAMAQU?",
    a: "Ya. Minimal satu pembelian valid (bukan pesanan yang dibatalkan atau direfund) menjadi syarat bergabung. Kalau riwayatmu belum bisa diverifikasi otomatis, pendaftaran tetap bisa dikirim dan admin akan memeriksanya.",
  },
];

function SectionTitle({
  eyebrow,
  title,
  text,
}: {
  eyebrow: string;
  title: string;
  text?: string;
}) {
  return (
    <div className="max-w-[620px]">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: TEAL }}>
        {eyebrow}
      </p>
      <h2 className="mt-2 text-[26px] md:text-[34px] font-extrabold leading-[1.15]" style={{ color: INK }}>
        {title}
      </h2>
      {text ? (
        <p className="mt-3 text-[14px] leading-relaxed" style={{ color: MUTED }}>
          {text}
        </p>
      ) : null}
    </div>
  );
}

export default function AffiliateLanding() {
  const [base, setBase] = useState("/affiliate");
  useEffect(() => {
    setBase(portalBaseFor(window.location.hostname));
  }, []);

  const daftarHref = portalPath(base, "daftar");
  const loginHref = portalPath(base, "login");

  return (
    <div className="min-h-screen w-full" style={{ background: "#FBFAF7", color: INK }}>
      {/* Navbar */}
      <header className="sticky top-0 z-30 border-b border-[#e8e3d9]/80 bg-[#FBFAF7]/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between px-5">
          <Link href="/affiliate" className="flex items-center gap-2.5">
            <span
              className="grid h-8 w-8 place-items-center rounded-md text-[14px] font-black text-white"
              style={{ background: TEAL }}
            >
              S
            </span>
            <span className="text-[13px] font-bold uppercase tracking-[0.16em]">SAMAQU</span>
          </Link>
          <nav className="hidden items-center gap-7 text-[13px] font-medium md:flex" style={{ color: MUTED }}>
            <a href="#keuntungan" className="hover:text-[#111827]">Keuntungan</a>
            <a href="#cara-kerja" className="hover:text-[#111827]">Cara kerja</a>
            <a href="#syarat" className="hover:text-[#111827]">Syarat</a>
            <a href="#faq" className="hover:text-[#111827]">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href={loginHref} className="hidden px-3 py-2 text-[13px] font-semibold sm:block">
              Masuk
            </Link>
            <Link
              href={daftarHref}
              className="rounded-lg px-4 py-2.5 text-[13px] font-bold text-white transition-opacity hover:opacity-90"
              style={{ background: TEAL }}
            >
              Daftar
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-[1120px] items-center gap-10 px-5 py-14 md:grid-cols-[1.05fr_0.95fr] md:py-20">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: TEAL }}>
            SAMAQU Affiliate Center
          </p>
          <h1 className="mt-3 text-[34px] md:text-[50px] font-extrabold leading-[1.08]">
            Dapatkan Penghasilan
            <br />
            Tambahan Bersama SAMAQU
          </h1>
          <p className="mt-5 max-w-[520px] text-[15px] leading-relaxed" style={{ color: MUTED }}>
            Bagikan produk SAMAQU kepada orang-orang di sekitarmu dan dapatkan komisi dari
            penjualan yang berhasil melalui link affiliate kamu.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href={daftarHref}
              className="rounded-lg px-6 py-3.5 text-[14px] font-bold text-white transition-opacity hover:opacity-90"
              style={{ background: TEAL }}
            >
              Daftar Sekarang
            </Link>
            <Link
              href={loginHref}
              className="rounded-lg border px-6 py-3.5 text-[14px] font-bold"
              style={{ borderColor: "#d9d3c7", color: INK }}
            >
              Sudah Punya Akun? Masuk
            </Link>
          </div>
          <p className="mt-4 text-[12px]" style={{ color: MUTED }}>
            Syarat bergabung: minimal 1 pembelian produk SAMAQU yang valid.
          </p>
        </div>

        {/* Visual produk asli SAMAQU */}
        <div className="relative">
          <div className="grid grid-cols-2 gap-3">
            <img
              src="/bio/thobe.png"
              alt="Thobe SAMAQU"
              className="h-[230px] w-full rounded-xl object-cover md:h-[290px]"
            />
            <div className="grid gap-3">
              <img
                src="/bio/kandora.png"
                alt="Kandora SAMAQU"
                className="h-[110px] w-full rounded-xl object-cover md:h-[139px]"
              />
              <img
                src="/bio/koko.png"
                alt="Koko SAMAQU"
                className="h-[110px] w-full rounded-xl object-cover md:h-[139px]"
              />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-xl border border-[#e8e3d9] bg-white px-4 py-3">
            <p className="text-[12px] font-semibold">Produk SAMAQU siap kamu promosikan</p>
            <span className="text-[11px]" style={{ color: MUTED }}>Thobe · Kandora · Koko · Vest</span>
          </div>
        </div>
      </section>

      {/* Keuntungan */}
      <section id="keuntungan" className="border-t border-[#ece7dd]">
        <div className="mx-auto max-w-[1120px] px-5 py-14 md:py-18">
          <SectionTitle
            eyebrow="Keuntungan"
            title="Yang kamu dapat sebagai affiliate"
            text="Semua fitur di bawah ini sudah tersedia di dashboard affiliate — bukan janji tambahan."
          />
          <div className="mt-9 grid gap-x-10 gap-y-8 md:grid-cols-2">
            {BENEFITS.map((item) => (
              <div key={item.title} className="border-l-2 pl-4" style={{ borderColor: TEAL }}>
                <h3 className="text-[16px] font-bold">{item.title}</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: MUTED }}>
                  {item.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cara kerja */}
      <section id="cara-kerja" className="border-t border-[#ece7dd]">
        <div className="mx-auto max-w-[1120px] px-5 py-14 md:py-18">
          <SectionTitle eyebrow="Cara kerja" title="Tiga langkah, tanpa ribet" />
          <div className="mt-9 grid gap-8 md:grid-cols-3">
            {STEPS.map((step) => (
              <div key={step.n}>
                <p className="text-[13px] font-black" style={{ color: TEAL }}>{step.n}</p>
                <h3 className="mt-2 text-[17px] font-bold">{step.title}</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: MUTED }}>
                  {step.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Syarat bergabung */}
      <section id="syarat" className="border-t border-[#ece7dd]">
        <div className="mx-auto max-w-[1120px] px-5 py-14 md:py-18">
          <div className="rounded-2xl border border-[#e3ddcf] bg-white p-6 md:p-9">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: TEAL }}>
              Syarat bergabung
            </p>
            <h2 className="mt-2 max-w-[720px] text-[24px] md:text-[30px] font-extrabold leading-[1.2]">
              Sudah menjadi pelanggan SAMAQU? Yuk, mulai dapatkan penghasilan tambahan
              dengan menjadi affiliate kami.
            </h2>
            <div className="mt-6 grid gap-6 md:grid-cols-[1fr_1fr]">
              <ul className="space-y-2.5 text-[13.5px]" style={{ color: "#374151" }}>
                {[
                  "Minimal pernah membeli 1 produk SAMAQU.",
                  "Pembelian harus valid, bukan pesanan yang dibatalkan atau direfund.",
                  "Setelah syarat terpenuhi, kamu bisa mengaktifkan akun affiliate dan membagikan link referral pribadi.",
                ].map((line) => (
                  <li key={line} className="flex gap-2.5">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: TEAL }} />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <div className="rounded-xl bg-[#f7f5ef] p-4">
                <p className="text-[12px] leading-relaxed" style={{ color: "#4b5563" }}>
                  Belum pernah membeli? Kamu bisa mulai dari katalog produk. Setelah pesanan
                  pertama selesai, kamu bisa mendaftar sebagai affiliate.
                </p>
                <a
                  href="https://www.samaqu.id/id/katalog"
                  className="mt-3 inline-flex rounded-lg border px-4 py-2.5 text-[12.5px] font-bold"
                  style={{ borderColor: "#cfc8ba", color: INK }}
                >
                  Lihat katalog produk →
                </a>
              </div>
            </div>
            <div className="mt-7">
              <Link
                href={daftarHref}
                className="inline-flex rounded-lg px-6 py-3.5 text-[14px] font-bold text-white"
                style={{ background: TEAL }}
              >
                Daftar Sekarang
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Pratinjau dashboard (ilustrasi) */}
      <section className="border-t border-[#ece7dd]">
        <div className="mx-auto max-w-[1120px] px-5 py-14 md:py-18">
          <SectionTitle
            eyebrow="Pratinjau dashboard"
            title="Semua angka penting dalam satu layar"
            text="Tampilan dashboard affiliate SAMAQU. Angka di bawah hanya ilustrasi."
          />
          <div className="mt-8 rounded-2xl border border-[#e3ddcf] bg-white p-4 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eef0f2] pb-3">
              <p className="text-[13px] font-bold">Ringkasan Affiliate</p>
              <span className="rounded-full bg-[#f2f6f7] px-2.5 py-1 text-[10.5px] font-bold" style={{ color: TEAL }}>
                Ilustrasi
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                ["Klik", "1.248"],
                ["Pesanan", "36"],
                ["Penjualan", "Rp 24.500.000"],
                ["Komisi", "Rp 1.225.000"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-[#eef0f2] px-3.5 py-3">
                  <p className="text-[11px]" style={{ color: MUTED }}>{label}</p>
                  <p className="mt-1 text-[16px] font-extrabold">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-[1.4fr_1fr]">
              <div className="rounded-xl border border-[#eef0f2] p-4">
                <div className="flex h-[110px] items-end gap-2">
                  {[34, 52, 40, 64, 58, 74, 66, 82, 70, 90].map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t"
                      style={{ height: `${h}%`, background: i % 2 ? "#cfe0e5" : TEAL }}
                    />
                  ))}
                </div>
                <p className="mt-2 text-[10.5px]" style={{ color: MUTED }}>Performa 10 hari terakhir (contoh)</p>
              </div>
              <div className="rounded-xl border border-[#eef0f2] p-4">
                <p className="text-[11px] font-bold" style={{ color: MUTED }}>Pencairan</p>
                <p className="mt-1 text-[15px] font-extrabold">Rp 750.000</p>
                <p className="mt-1 text-[11px]" style={{ color: MUTED }}>Contoh saldo siap diajukan</p>
                <span className="mt-3 inline-flex rounded-lg px-3 py-2 text-[11.5px] font-bold text-white" style={{ background: TEAL }}>
                  Ajukan pencairan
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-[#ece7dd]">
        <div className="mx-auto max-w-[860px] px-5 py-14 md:py-18">
          <SectionTitle eyebrow="FAQ" title="Pertanyaan yang sering muncul" />
          <div className="mt-7 divide-y divide-[#e8e3d9] border-y border-[#e8e3d9]">
            {FAQ.map((item) => (
              <details key={item.q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[14.5px] font-semibold">
                  {item.q}
                  <span className="text-[18px] font-normal transition-transform group-open:rotate-45" style={{ color: TEAL }}>
                    +
                  </span>
                </summary>
                <p className="mt-2 max-w-[720px] text-[13.5px] leading-relaxed" style={{ color: MUTED }}>
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA penutup */}
      <section className="border-t border-[#ece7dd]">
        <div className="mx-auto max-w-[1120px] px-5 py-14 md:py-18">
          <div className="rounded-2xl p-7 md:p-10" style={{ background: TEAL }}>
            <h2 className="max-w-[640px] text-[24px] md:text-[32px] font-extrabold leading-[1.15] text-white">
              Siap mulai menghasilkan dari produk SAMAQU?
            </h2>
            <p className="mt-3 max-w-[560px] text-[13.5px] leading-relaxed text-white/80">
              Daftar sebagai affiliate, dapatkan link pribadi, dan pantau komisi dari dashboard.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={daftarHref}
                className="rounded-lg bg-white px-6 py-3.5 text-[14px] font-bold"
                style={{ color: TEAL }}
              >
                Daftar Sekarang
              </Link>
              <Link
                href={loginHref}
                className="rounded-lg border border-white/40 px-6 py-3.5 text-[14px] font-bold text-white"
              >
                Masuk ke portal
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#ece7dd]">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-3 px-5 py-6 text-[12px]" style={{ color: MUTED }}>
          <p>© {new Date().getFullYear()} SAMAQU · Affiliate Center</p>
          <div className="flex gap-4">
            <a href="https://www.samaqu.id/id/katalog" className="hover:underline">Katalog</a>
            <a href="https://wa.me/6285212150100" target="_blank" rel="noopener noreferrer" className="hover:underline">
              WhatsApp
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
