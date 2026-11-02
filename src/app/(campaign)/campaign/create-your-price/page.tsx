import type { Metadata } from "next";
import { CYP_ASSETS } from "@/lib/campaign/create-your-price-content";
import s from "./campaign.module.css";
import HeroSection from "./_sections/HeroSection";
import ProductsSection from "./_sections/ProductsSection";
import {
  InfoBarSection,
  VideoSection,
  StepsSection,
  MinimumPriceSection,
  NotPromoSection,
  GuaranteeSection,
  FaqSection,
  ClosingCtaSection,
  CampaignFooter,
} from "./_sections/Sections";
import { loadCampaignProducts } from "./_data/products";
import { loadCsWhatsappLink } from "./_data/whatsapp";
import { openOrderHref } from "./_data/order-href";

/**
 * Halaman kampanye Create Your Price — `/campaign/create-your-price`.
 *
 * Halaman TAMBAHAN dan berdiri sendiri:
 *  - tanpa prefix locale (lihat pengecualian `/campaign` di `src/middleware.ts`)
 *  - tanpa Navbar/Footer situs, tanpa bottom nav, tanpa chat widget (layout `(campaign)`)
 *  - `noindex, nofollow`, tidak masuk sitemap, tidak ada di menu mana pun
 *  - tidak menyentuh logic checkout/cart/Open Order/produk/admin — hanya MEMBACA katalog
 *    untuk section "Produk pilihan periode ini"
 *
 * Query UTM dari URL kampanye diteruskan ke tautan Open Order (`openOrderHref`).
 */
export const metadata: Metadata = {
  title: "Create Your Price — Samaqu",
  description:
    "Di Samaqu, kamu bisa memilih hargamu sendiri, mulai dari harga minimum. Produk dan kualitasnya tetap sama.",
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    locale: "id_ID",
    title: "Create Your Price — Samaqu",
    description: "Pilih hargamu sendiri, mulai dari harga minimum. Produk dan kualitasnya tetap sama.",
    images: [{ url: CYP_ASSETS.heroPhoto }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Create Your Price — Samaqu",
    description: "Pilih hargamu sendiri, mulai dari harga minimum. Produk dan kualitasnya tetap sama.",
    images: [CYP_ASSETS.heroPhoto],
  },
};

/**
 * Data dibaca di server tiap request (harga katalog bisa berubah kapan saja dari admin).
 * Kalau nanti mau di-cache, cukup tambahkan `export const revalidate = 60`.
 */
export default async function CreateYourPriceCampaignPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const orderHref = openOrderHref(params);

  const [products, waHref] = await Promise.all([loadCampaignProducts(), loadCsWhatsappLink()]);

  return (
    <main className={s.cyp}>
      {/* 1. Hero + kartu harga interaktif */}
      <HeroSection orderHref={orderHref} />

      {/* 2. Info bar */}
      <InfoBarSection />

      {/* 3. Video + 3 alasan */}
      <VideoSection />

      {/* 4. Produk pilihan periode ini — section ini disembunyikan (return null) bila kosong */}
      <ProductsSection products={products} />

      {/* 5. Cara kerja */}
      <StepsSection />

      {/* 6. Pilih harga minimum? Tentu boleh. */}
      <MinimumPriceSection />

      {/* 7. Bukan diskon. Bukan promo. */}
      <NotPromoSection />

      {/* 8. Jaminan */}
      <GuaranteeSection />

      {/* 9. FAQ */}
      <FaqSection />

      {/* 10. CTA penutup + video jahitan */}
      <ClosingCtaSection waHref={waHref} orderHref={orderHref} />

      {/* Footer ringkas + 11. Sticky CTA bawah */}
      <CampaignFooter waHref={waHref} orderHref={orderHref} />
    </main>
  );
}
