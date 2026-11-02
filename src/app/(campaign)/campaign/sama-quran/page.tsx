import type { Metadata } from "next";
import { SQ_ASSETS } from "@/lib/campaign/sama-quran-content";
import s from "./sama-quran.module.css";
import {
  HeroSection,
  StorySection,
  MaknaSection,
  NilaiSection,
  JourneySection,
  JourneyDarkSection,
  HarapanSection,
  KoleksiSection,
  ClosingCtaSection,
  SiteFooter,
} from "./_sections/Sections";
import { katalogHref } from "./_data/links";
import { loadCsWhatsappLink } from "./_data/whatsapp";

/**
 * Halaman kampanye Sama Quran — `/campaign/sama-quran`.
 *
 * TAMBAHAN dan berdiri sendiri:
 *  - tanpa prefix locale (middleware sudah mengecualikan `/campaign`)
 *  - memakai root layout `(campaign)` yang sama dengan kampanye Create Your Price:
 *    tanpa Navbar/Footer situs, tanpa bottom nav, `noindex, nofollow`
 *  - tidak menyentuh halaman /id/sama-quran, katalog, checkout, atau admin
 *
 * Query UTM dari URL kampanye diteruskan ke tautan katalog (`katalogHref`).
 */
export const metadata: Metadata = {
  title: "Sama Quran — Samaqu",
  description:
    "Bukan soal sudah hafal berapa juz. Tapi menjadikan Quran bagian dari hidup, mulai dari yang bisa kamu lakukan hari ini.",
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    locale: "id_ID",
    title: "Sama Quran — Samaqu",
    description:
      "Bukan soal sudah hafal berapa juz. Tapi menjadikan Quran bagian dari hidup, mulai dari yang bisa kamu lakukan hari ini.",
    // Cover video hero dipakai sebagai gambar OG.
    images: [{ url: SQ_ASSETS.heroPoster }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sama Quran — Samaqu",
    description:
      "Bukan soal sudah hafal berapa juz. Tapi menjadikan Quran bagian dari hidup, mulai dari yang bisa kamu lakukan hari ini.",
    images: [SQ_ASSETS.heroPoster],
  },
};

export default async function SamaQuranCampaignPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const katalog = katalogHref(params);
  const waHref = await loadCsWhatsappLink();

  return (
    <main className={s.sq}>
      {/* 1. Hero gelap */}
      <HeroSection katalog={katalog} />

      {/* 2. Cerita Sama Quran (video, klik untuk putar) */}
      <StorySection />

      {/* 3. Makna Sama Quran */}
      <MaknaSection />

      {/* 4. Enam nilai */}
      <NilaiSection />

      {/* 5. Perjalanan kita — 3 kartu */}
      <JourneySection />

      {/* 6. Apa pun perjalananmu, tetap Sama Quran */}
      <JourneyDarkSection />

      {/* 7. Dari nilai ke karya */}
      <HarapanSection />

      {/* 8. Koleksi Samaqu */}
      <KoleksiSection katalog={katalog} />

      {/* 9. CTA penutup */}
      <ClosingCtaSection katalog={katalog} waHref={waHref} />

      {/* 10. Footer kecil + sticky CTA */}
      <SiteFooter katalog={katalog} waHref={waHref} />
    </main>
  );
}
