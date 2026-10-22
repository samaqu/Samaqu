"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import LegalPage from "@/components/affiliate/LegalPage";
import { portalBaseFor, portalPath } from "@/lib/affiliate/site";

const TOC = [
  { href: "#definisi", label: "1. Definisi" },
  { href: "#kepesertaan", label: "2. Syarat Kepesertaan" },
  { href: "#pendaftaran", label: "3. Pendaftaran & Verifikasi" },
  { href: "#referral", label: "4. Link Referral" },
  { href: "#komisi", label: "5. Komisi" },
  { href: "#pencairan", label: "6. Pencairan Komisi" },
  { href: "#promosi", label: "7. Etika Promosi" },
  { href: "#larangan", label: "8. Larangan" },
  { href: "#penghentian", label: "9. Penangguhan & Penghentian" },
  { href: "#data", label: "10. Data Pribadi" },
  { href: "#perubahan", label: "11. Perubahan Ketentuan" },
  { href: "#kontak", label: "12. Kontak" },
];

const KATALOG = "https://www.samaqu.id/id/katalog";

export default function SyaratKetentuanPage() {
  const [base, setBase] = useState("/affiliate");
  useEffect(() => {
    setBase(portalBaseFor(window.location.hostname));
  }, []);

  return (
    <LegalPage
      title={
        <>
          Syarat &amp; Ketentuan <span className="serif font-normal">SAMAQU Affiliate</span>
        </>
      }
      description="Baca dengan teliti sebelum mendaftar. Dengan mengajukan pendaftaran, kamu dianggap telah membaca dan menyetujui ketentuan ini."
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
            dilengkapi dan ditinjau tim SAMAQU (dan sebaiknya penasihat hukum) sebelum
            dipublikasikan.
          </span>
        </>
      }
    >
      <section id="definisi">
        <h2>1. Definisi</h2>
        <ul>
          <li>
            <b>Program</b> adalah program SAMAQU Affiliate yang dikelola oleh SAMAQU.
          </li>
          <li>
            <b>Affiliate</b> adalah peserta yang pendaftarannya telah disetujui dan akunnya
            aktif.
          </li>
          <li>
            <b>Link Referral</b> adalah tautan unik yang diberikan kepada Affiliate untuk
            mencatat transaksi hasil rekomendasinya.
          </li>
          <li>
            <b>Transaksi yang Memenuhi Syarat</b> adalah pembelian melalui Link Referral yang
            memenuhi kriteria pada Bagian 5.
          </li>
        </ul>
      </section>

      <section id="kepesertaan">
        <h2>2. Syarat Kepesertaan</h2>
        <ol>
          <li>
            Calon Affiliate <b>wajib telah membeli minimal satu produk SAMAQU</b> sebelum
            mengajukan pendaftaran.
          </li>
          <li>
            Calon Affiliate berusia minimal <span className="tbd">[usia minimum]</span> tahun
            dan memiliki data diri yang valid.
          </li>
          <li>Satu orang hanya diperbolehkan memiliki satu akun Affiliate.</li>
        </ol>
      </section>

      <section id="pendaftaran">
        <h2>3. Pendaftaran &amp; Verifikasi</h2>
        <ol>
          <li>
            Pendaftaran dilakukan melalui formulir resmi di halaman{" "}
            <Link href={portalPath(base, "daftar")} className="underline underline-offset-4 font-semibold">
              Daftar Affiliate
            </Link>
            .
          </li>
          <li>
            Setiap pendaftaran melalui proses verifikasi data dan bukti pembelian oleh admin
            SAMAQU.
          </li>
          <li>
            Pendaftaran tidak otomatis membuat akun aktif. Akun aktif setelah disetujui admin
            sesuai ketentuan program.
          </li>
          <li>
            SAMAQU berhak menolak pendaftaran yang tidak memenuhi syarat. Lama proses
            verifikasi: <span className="tbd">[estimasi waktu]</span>.
          </li>
        </ol>
      </section>

      <section id="referral">
        <h2>4. Link Referral</h2>
        <ol>
          <li>Link Referral hanya dapat digunakan setelah akun Affiliate aktif.</li>
          <li>Link Referral bersifat pribadi dan tidak boleh dipindahtangankan.</li>
          <li>
            Transaksi dicatat berdasarkan Link Referral yang digunakan pembeli, dengan masa
            pelacakan <span className="tbd">[durasi cookie/atribusi]</span>.
          </li>
        </ol>
      </section>

      <section id="komisi">
        <h2>5. Komisi</h2>
        <ol>
          <li>
            Komisi diberikan atas Transaksi yang Memenuhi Syarat yang tercatat melalui Link
            Referral.
          </li>
          <li>
            Besaran komisi: <span className="tbd">[besaran/skema komisi resmi]</span>.
          </li>
          <li>
            Transaksi yang dibatalkan, dikembalikan (retur), atau tidak dibayar tidak dihitung
            sebagai Transaksi yang Memenuhi Syarat. Kriteria tambahan:{" "}
            <span className="tbd">[kriteria lain]</span>.
          </li>
          <li>
            Pembelian oleh Affiliate menggunakan Link Referral miliknya sendiri{" "}
            <span className="tbd">[dihitung / tidak dihitung]</span>.
          </li>
          <li>Status komisi dapat dipantau melalui Dashboard Affiliate.</li>
          <li>
            Program ini tidak menjamin besaran penghasilan tertentu. Hasil bergantung pada
            transaksi yang memenuhi syarat.
          </li>
        </ol>
      </section>

      <section id="pencairan">
        <h2>6. Pencairan Komisi</h2>
        <ol>
          <li>
            Jadwal pencairan: <span className="tbd">[jadwal resmi]</span>.
          </li>
          <li>
            Batas minimum pencairan: <span className="tbd">[nominal minimum, jika ada]</span>.
          </li>
          <li>
            Metode pencairan: <span className="tbd">[rekening bank / e-wallet]</span>.
            Affiliate bertanggung jawab atas kebenaran data rekening.
          </li>
          <li>
            Ketentuan pajak: <span className="tbd">[ketentuan perpajakan yang berlaku]</span>.
          </li>
        </ol>
      </section>

      <section id="promosi">
        <h2>7. Etika Promosi</h2>
        <ul>
          <li>Promosikan produk secara jujur, sesuai informasi resmi SAMAQU.</li>
          <li>Jangan menjanjikan diskon, hadiah, atau manfaat yang tidak ditawarkan SAMAQU.</li>
          <li>Gunakan aset visual dan nama SAMAQU sesuai panduan brand yang diberikan.</li>
        </ul>
      </section>

      <section id="larangan">
        <h2>8. Larangan</h2>
        <ul>
          <li>Membuat transaksi palsu, fiktif, atau manipulatif untuk memperoleh komisi.</li>
          <li>Spam, menyesatkan, atau menyamar sebagai akun resmi SAMAQU.</li>
          <li>
            Menggunakan iklan berbayar dengan kata kunci merek SAMAQU tanpa izin{" "}
            <span className="tbd">[sesuaikan kebijakan]</span>.
          </li>
          <li>Menyebarkan konten yang melanggar hukum, SARA, atau norma kesopanan.</li>
        </ul>
      </section>

      <section id="penghentian">
        <h2>9. Penangguhan &amp; Penghentian</h2>
        <ol>
          <li>SAMAQU berhak menangguhkan atau menonaktifkan akun yang melanggar ketentuan ini.</li>
          <li>Komisi dari transaksi yang terbukti melanggar dapat dibatalkan.</li>
          <li>
            Affiliate dapat berhenti dari program dengan mengajukan permintaan melalui{" "}
            <span className="tbd">[kanal resmi]</span>.
          </li>
        </ol>
      </section>

      <section id="data">
        <h2>10. Data Pribadi</h2>
        <p className="mt-4 leading-relaxed">
          Data yang kamu berikan digunakan untuk verifikasi, pengelolaan akun, dan pencairan
          komisi, sesuai{" "}
          <Link
            href={portalPath(base, "kebijakan-privasi")}
            className="font-semibold text-black underline underline-offset-4"
          >
            Kebijakan Privasi SAMAQU
          </Link>{" "}
          dan peraturan perundang-undangan yang berlaku.
        </p>
      </section>

      <section id="perubahan">
        <h2>11. Perubahan Ketentuan</h2>
        <p className="mt-4 leading-relaxed">
          SAMAQU dapat memperbarui ketentuan ini sewaktu-waktu. Perubahan akan diumumkan
          melalui halaman ini dan/atau kanal komunikasi resmi kepada Affiliate.
        </p>
      </section>

      <section id="kontak">
        <h2>12. Kontak</h2>
        <p className="mt-4 leading-relaxed">
          Pertanyaan seputar program dapat disampaikan melalui{" "}
          <span className="tbd">[email / WhatsApp resmi SAMAQU]</span>.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-3">
          <Link href={portalPath(base, "daftar")} className="btn btn-primary">
            Saya Paham, Daftar Sekarang{" "}
            <span className="arr" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </span>
          </Link>
          <a href={KATALOG} className="btn btn-outline">
            Lihat Koleksi Dulu
          </a>
        </div>
      </section>
    </LegalPage>
  );
}
