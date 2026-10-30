import type { Metadata } from "next";
import { SITE_URL, localeAlternates, OG_IMAGE } from "@/lib/site-config";
import FaqClient from "./FaqClient";
import { fetchFaqItems } from "./faq-data";
import idMessages from "@/i18n/messages/id.json";
import enMessages from "@/i18n/messages/en.json";

// FAQ jarang berubah; konten di-cache dan diperbarui tiap 5 menit.
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const copy = ((locale === "en" ? enMessages : idMessages) as Record<string, any>)?.faqFull ?? {};
  const title = copy.metaTitle || copy.title || "FAQ";
  const description = copy.metaDescription || copy.desc || "";
  return {
    title,
    description,
    alternates: localeAlternates(locale, "/faq"),
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/${locale}/faq`,
      locale: locale === "en" ? "en_US" : "id_ID",
      images: [OG_IMAGE],
    },
  };
}

export default async function FaqPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  // FAQ di-render server-side supaya isinya ada di HTML awal (crawler & AI tidak eksekusi JS).
  const faqs = await fetchFaqItems();

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: locale,
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    inLanguage: locale,
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/${locale}` },
      { "@type": "ListItem", position: 2, name: "FAQ", item: `${SITE_URL}/${locale}/faq` },
    ],
  };

  return (
    <>
      {faqs.length > 0 && (
        <>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
          />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
          />
        </>
      )}
      <FaqClient initialFaqs={faqs} />
    </>
  );
}
