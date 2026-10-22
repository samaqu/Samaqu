"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import LegalPage from "@/components/affiliate/LegalPage";
import { portalBaseFor, portalPath } from "@/lib/affiliate/site";

const TOC = [
  { href: "#cakupan", label: "1. Cakupan" },
  { href: "#data", label: "2. Data yang Dikumpulkan" },
  { href: "#tujuan", label: "3. Tujuan Penggunaan" },
  { href: "#referral", label: "4. Pelacakan Referral & Cookie" },
  { href: "#berbagi", label: "5. Berbagi Data" },
  { href: "#simpan", label: "6. Penyimpanan & Keamanan" },
  { href: "#hak", label: "7. Hak Kamu" },
  { href: "#perubahan", label: "8. Perubahan Kebijakan" },
  { href: "#kontak", label: "9. Kontak" },
];

export default function KebijakanPrivasiPage() {
  const [base, setBase] = useState("/affiliate");
  useEffect(() => {
    setBase(portalBaseFor(window.location.hostname));
  }, []);

  return (
    <LegalPage
      title={
        <>
          Kebijakan Privasi <span className="serif font-normal">SAMAQU Affiliate</span>
        </>
      }
      description="Kami menghargai kepercayaanmu. Halaman ini menjelaskan data apa yang kami kumpulkan, untuk apa digunakan, dan bagaimana kami menjaganya."
      updated="[tanggal berlaku]"
      toc={TOC}
      notice={
        <>
          <svg
            className="flex-none mt-0.5"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#000"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16h.01" />
          </svg>
          <span>
            <b>Draf mockup.</b> Bagian bertanda <span className="tbd">[ … ]</span> wajib
            dilengkapi dan ditinjau tim SAMAQU serta penasihat hukum, termasuk kesesuaian dengan
            UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi.
          </span>
        </>
      }
    >
      <p className="text-sm" style={{ color: "var(--c-muted)" }}>
        Lihat juga{" "}
        <Link
          href={portalPath(base, "syarat-ketentuan")}
          className="font-semibold text-black underline underline-offset-4"
        >
          Syarat &amp; Ketentuan
        </Link>
      </p>

      <section id="cakupan">
        <h2>1. Cakupan</h2>
        <p className="mt-4 leading-relaxed">
          Kebijakan ini berlaku untuk data calon Affiliate dan Affiliate yang dikumpulkan melalui
          halaman program SAMAQU Affiliate, formulir pendaftaran, dan Dashboard Affiliate.
        </p>
      </section>

      <section id="data">
        <h2>2. Data yang Dikumpulkan</h2>
        <ul>
          <li>
            <b>Data identitas &amp; kontak:</b> nama lengkap, email, dan nomor WhatsApp.
          </li>
          <li>
            <b>Data verifikasi:</b> nomor pesanan SAMAQU sebagai bukti syarat pembelian.
          </li>
          <li>
            <b>Data akun:</b> kata sandi (disimpan dalam bentuk terenkripsi) dan aktivitas login.
          </li>
          <li>
            <b>Data aktivitas referral:</b> klik dan transaksi yang tercatat melalui Link
            Referral.
          </li>
          <li>
            <b>Data pencairan komisi:</b>{" "}
            <span className="tbd">[rekening bank / e-wallet, NPWP jika diperlukan]</span>.
          </li>
        </ul>
      </section>

      <section id="tujuan">
        <h2>3. Tujuan Penggunaan</h2>
        <ul>
          <li>Memverifikasi pendaftaran dan syarat pembelian.</li>
          <li>Membuat dan mengelola akun serta Link Referral.</li>
          <li>Mencatat transaksi dan menghitung komisi sesuai ketentuan program.</li>
          <li>Memproses pencairan komisi.</li>
          <li>
            Menghubungimu terkait status akun, informasi program, dan perubahan ketentuan.
          </li>
          <li>Mencegah penyalahgunaan dan transaksi yang tidak sah.</li>
        </ul>
      </section>

      <section id="referral">
        <h2>4. Pelacakan Referral &amp; Cookie</h2>
        <p className="mt-4 leading-relaxed">
          Saat seseorang membuka Link Referral, kami menggunakan cookie atau teknologi serupa
          untuk mengaitkan transaksinya dengan Affiliate yang merekomendasikan, selama masa
          pelacakan <span className="tbd">[durasi atribusi]</span>. Data pembeli yang terlihat
          oleh Affiliate dibatasi pada{" "}
          <span className="tbd">[informasi yang ditampilkan di dashboard]</span>.
        </p>
      </section>

      <section id="berbagi">
        <h2>5. Berbagi Data</h2>
        <ul>
          <li>
            Kami <b>tidak menjual</b> data pribadimu.
          </li>
          <li>
            Data dapat dibagikan kepada penyedia layanan pendukung (misalnya hosting, pembayaran,
            dan komunikasi) sebatas yang diperlukan: <span className="tbd">[daftar pihak ketiga]</span>.
          </li>
          <li>
            Data dapat diungkapkan jika diwajibkan oleh hukum atau permintaan otoritas yang
            berwenang.
          </li>
        </ul>
      </section>

      <section id="simpan">
        <h2>6. Penyimpanan &amp; Keamanan</h2>
        <ul>
          <li>
            Data disimpan selama akun aktif dan <span className="tbd">[periode retensi]</span>{" "}
            setelahnya untuk keperluan administrasi dan hukum.
          </li>
          <li>
            Kami menerapkan langkah pengamanan yang wajar untuk melindungi data dari akses yang
            tidak sah.
          </li>
          <li>Jaga kerahasiaan kata sandimu dan jangan bagikan akses akun kepada orang lain.</li>
        </ul>
      </section>

      <section id="hak">
        <h2>7. Hak Kamu</h2>
        <ul>
          <li>Mengakses dan meminta salinan data pribadimu.</li>
          <li>Memperbarui atau memperbaiki data yang tidak akurat.</li>
          <li>
            Meminta penghapusan data atau penutupan akun, dengan memperhatikan kewajiban hukum
            yang berlaku.
          </li>
          <li>Menarik persetujuan atas komunikasi promosi.</li>
        </ul>
        <p className="mt-4 leading-relaxed">Permintaan dapat diajukan melalui kontak pada Bagian 9.</p>
      </section>

      <section id="perubahan">
        <h2>8. Perubahan Kebijakan</h2>
        <p className="mt-4 leading-relaxed">
          Kebijakan ini dapat diperbarui sewaktu-waktu. Perubahan penting akan diumumkan melalui
          halaman ini dan/atau kanal komunikasi resmi kepada Affiliate.
        </p>
      </section>

      <section id="kontak">
        <h2>9. Kontak</h2>
        <p className="mt-4 leading-relaxed">
          Pertanyaan atau permintaan terkait data pribadi dapat disampaikan melalui{" "}
          <span className="tbd">[email / WhatsApp resmi SAMAQU]</span>.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-3">
          <Link href={portalPath(base, "daftar")} className="btn btn-primary">
            Daftar Jadi Affiliate{" "}
            <span className="arr" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </span>
          </Link>
          <Link href={portalPath(base, "syarat-ketentuan")} className="btn btn-outline">
            Baca Syarat &amp; Ketentuan
          </Link>
        </div>
      </section>
    </LegalPage>
  );
}
