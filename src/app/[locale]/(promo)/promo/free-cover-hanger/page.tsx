import type { Metadata } from "next";
import { localeAlternates, SITE_URL, SITE_NAME, SITE_CONTACT } from "@/lib/site-config";
import { PROMO_META, PROMO_ASSETS, PROMO_FAQ, PROMO_TERMS } from "@/lib/promo/free-cover-hanger";
import { FREE_COVER_HANGER_CSS } from "@/lib/promo/free-cover-hanger-styles";
import { PromoNav } from "@/components/promo/free-cover-hanger/PromoNav";
import { PromoHero } from "@/components/promo/free-cover-hanger/PromoHero";
import { PromoStory } from "@/components/promo/free-cover-hanger/PromoStory";
import { PromoCompare } from "@/components/promo/free-cover-hanger/PromoCompare";
import { PromoSteps } from "@/components/promo/free-cover-hanger/PromoSteps";
import { PromoCollections } from "@/components/promo/free-cover-hanger/PromoCollections";
import { PromoTerms } from "@/components/promo/free-cover-hanger/PromoTerms";
import { PromoFaq } from "@/components/promo/free-cover-hanger/PromoFaq";
import { PromoClosing } from "@/components/promo/free-cover-hanger/PromoClosing";
import { PromoFooter } from "@/components/promo/free-cover-hanger/PromoFooter";
import { PromoStickyBar } from "@/components/promo/free-cover-hanger/PromoStickyBar";
import { PromoCatalogParams } from "@/components/promo/free-cover-hanger/PromoCatalogParams";
import { PromoPixel } from "@/components/promo/free-cover-hanger/PromoPixel";

const PROMO_PATH = "/promo/free-cover-hanger";

/**
 * URL publik kanonik halaman ini = TANPA prefix bahasa, karena itulah URL yang dibagikan
 * di iklan/WhatsApp. Sebelumnya `og:url` memakai `/id/promo/...`, sehingga Facebook dan
 * WhatsApp menganggapnya URL berbeda dan cache preview-nya tidak pernah cocok.
 */
const PUBLIC_URL = `${SITE_URL}${PROMO_PATH}`;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const ogImage = `${SITE_URL}${PROMO_ASSETS.poster}`;
  const alternates = localeAlternates(locale, PROMO_PATH);

  return {
    title: PROMO_META.title,
    description: PROMO_META.description,
    keywords: [...PROMO_META.keywords],
    // Canonical menunjuk URL tanpa prefix (sama dengan yang dibagikan) walau halaman
    // di-render di /<locale>/promo/...; hreflang tetap lengkap untuk kedua bahasa.
    alternates: { ...alternates, canonical: PUBLIC_URL },
    robots: PROMO_META.noindex
      ? { index: false, follow: true, nocache: true }
      : { index: true, follow: true },
    authors: [{ name: SITE_NAME, url: SITE_URL }],
    openGraph: {
      type: "website",
      locale: locale === "en" ? "en_US" : "id_ID",
      url: PUBLIC_URL,
      siteName: SITE_NAME,
      title: PROMO_META.ogTitle,
      description: PROMO_META.ogDescription,
      images: [
        {
          url: ogImage,
          width: PROMO_META.ogImageWidth,
          height: PROMO_META.ogImageHeight,
          type: PROMO_META.ogImageType,
          alt: PROMO_META.ogTitle,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: PROMO_META.ogTitle,
      description: PROMO_META.ogDescription,
      images: [{ url: ogImage, alt: PROMO_META.ogTitle }],
    },
  };
}

/**
 * Structured data halaman promo.
 *
 * - `FAQPage` dari daftar FAQ yang benar-benar tampil (bukan data karangan).
 * - `Product` + `Offer` untuk program bonusnya (harga 0 = gratis, syarat dari hang tag).
 * - `BreadcrumbList` supaya posisi halaman jelas di hasil pencarian.
 */
function promoStructuredData(locale: string) {
  const katalogUrl = `${SITE_URL}/${locale}/katalog`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        "@id": `${PUBLIC_URL}#faq`,
        mainEntity: PROMO_FAQ.items.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      },
      {
        "@type": "Product",
        "@id": `${PUBLIC_URL}#promo`,
        name: "Free Cover Hanger — Pembelian Pertama",
        description: PROMO_META.description,
        image: [`${SITE_URL}${PROMO_ASSETS.poster}`],
        brand: { "@type": "Brand", name: SITE_NAME },
        category: "Busana Muslim Pria",
        offers: {
          "@type": "Offer",
          url: PUBLIC_URL,
          price: 0,
          priceCurrency: "IDR",
          availability: "https://schema.org/InStock",
          itemCondition: "https://schema.org/NewCondition",
          seller: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
        },
        additionalProperty: PROMO_TERMS.rows.map((row) => ({
          "@type": "PropertyValue",
          name: row.key,
          value: row.value,
        })),
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${PUBLIC_URL}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Beranda", item: `${SITE_URL}/${locale}` },
          { "@type": "ListItem", position: 2, name: "Katalog", item: katalogUrl },
          { "@type": "ListItem", position: 3, name: "Free Cover Hanger", item: PUBLIC_URL },
        ],
      },
      {
        "@type": "Organization",
        "@id": `${SITE_URL}#organization-promo`,
        name: SITE_NAME,
        url: SITE_URL,
        email: SITE_CONTACT.email,
        sameAs: [SITE_CONTACT.instagram],
      },
    ],
  };
}

export default async function FreeCoverHangerPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  return (
    <main
      className="fch-root"
      lang={locale}
      style={{
        fontFamily: "var(--font-instrument-sans), system-ui, sans-serif",
      }}
    >
      <style>{FREE_COVER_HANGER_CSS}</style>
      <style>{`.fch-disp{font-family:var(--font-big-shoulders),Impact,sans-serif}`}</style>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(promoStructuredData(locale)) }}
      />
      <PromoCatalogParams />
      <PromoPixel />

      <div className="fch-cq">
        <PromoNav locale={locale} />
        <PromoHero locale={locale} />
        <PromoStory />
        <PromoCompare />
        <PromoSteps />
        <PromoCollections locale={locale} />
        <PromoTerms />
        <PromoFaq />
        <PromoClosing locale={locale} />
        <PromoFooter />
        <PromoStickyBar locale={locale} />
      </div>
    </main>
  );
}
