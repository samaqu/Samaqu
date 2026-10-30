import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { locales } from "@/i18n/config";
import { RootDocument, ROOT_METADATA } from "@/components/RootDocument";
import { SITE_NAME, OG_IMAGE } from "@/lib/site-config";
import "@/app/globals.css";

/** Semua halaman ber-locale bisa diprerender untuk id + en. */
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isEn = locale === "en";

  // Canonical/hreflang + og:url per halaman dihitung oleh layout masing-masing
  // (params locale + slug route), bukan dengan membaca x-pathname dari header.
  return {
    ...ROOT_METADATA,
    // Sama persis dengan metadata locale lama: OG halaman (url/title) diisi layout rute,
    // sedangkan field umum di bawah ini menjadi fallback.
    openGraph: {
      type: "website",
      locale: isEn ? "en_US" : "id_ID",
      alternateLocale: [isEn ? "id_ID" : "en_US"],
      siteName: SITE_NAME,
      images: [OG_IMAGE],
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!locales.includes(locale as (typeof locales)[number])) {
    notFound();
  }

  // next-intl butuh ini agar getMessages() tidak jatuh ke dynamic rendering.
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <RootDocument lang={locale}>
      <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
    </RootDocument>
  );
}
