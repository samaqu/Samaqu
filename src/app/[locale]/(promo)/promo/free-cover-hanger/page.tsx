import type { Metadata } from "next";
import { localeAlternates, SITE_URL } from "@/lib/site-config";
import { PROMO_META, PROMO_ASSETS } from "@/lib/promo/free-cover-hanger";
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

const PROMO_PATH = "/promo/free-cover-hanger";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const ogImage = `${SITE_URL}${PROMO_ASSETS.poster}`;

  return {
    title: PROMO_META.title,
    description: PROMO_META.description,
    alternates: localeAlternates(locale, PROMO_PATH),
    robots: PROMO_META.noindex
      ? { index: false, follow: false, nocache: true }
      : { index: true, follow: true },
    openGraph: {
      type: "website",
      locale: locale === "en" ? "en_US" : "id_ID",
      url: `${SITE_URL}/${locale}${PROMO_PATH}`,
      siteName: "SAMAQU",
      title: PROMO_META.ogTitle,
      description: PROMO_META.ogDescription,
      images: [{ url: ogImage, width: 1200, height: 630, alt: PROMO_META.ogTitle }],
    },
    twitter: {
      card: "summary_large_image",
      title: PROMO_META.ogTitle,
      description: PROMO_META.ogDescription,
      images: [ogImage],
    },
  };
}

export default async function FreeCoverHangerPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  return (
    <main
      className="fch-root"
      style={{
        fontFamily: "var(--font-instrument-sans), system-ui, sans-serif",
      }}
    >
      <style>{FREE_COVER_HANGER_CSS}</style>
      <style>{`.fch-disp{font-family:var(--font-big-shoulders),Impact,sans-serif}`}</style>
      <PromoCatalogParams />

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
