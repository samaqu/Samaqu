import type { Metadata } from "next";
import { headers } from "next/headers";
import localFont from "next/font/local";
import Providers from "@/components/Providers";
import VercelAnalytics from "@/components/VercelAnalytics";
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION, SITE_CONTACT, OG_IMAGE } from "@/lib/site-config";
import "./globals.css";

const inter = localFont({
  src: [
    { path: "../../public/fonts/inter_24pt-light.woff2", weight: "300", style: "normal" },
    { path: "../../public/fonts/inter_24pt-lightitalic.woff2", weight: "300", style: "italic" },
    { path: "../../public/fonts/inter_24pt-regular.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/inter_24pt-italic.woff2", weight: "400", style: "italic" },
    { path: "../../public/fonts/inter_24pt-medium.woff2", weight: "500", style: "normal" },
    { path: "../../public/fonts/inter_24pt-mediumitalic.woff2", weight: "500", style: "italic" },
    { path: "../../public/fonts/inter_24pt-semibold.woff2", weight: "600", style: "normal" },
    { path: "../../public/fonts/inter_24pt-semibolditalic.woff2", weight: "600", style: "italic" },
    { path: "../../public/fonts/inter_24pt-bold.woff2", weight: "700", style: "normal" },
    { path: "../../public/fonts/inter_24pt-bolditalic.woff2", weight: "700", style: "italic" },
  ],
  variable: "--font-inter",
  display: "swap",
});

const cormorant = localFont({
  src: [
    { path: "../../public/fonts/cormorantgaramond-wght--light.woff2", weight: "300", style: "normal" },
    { path: "../../public/fonts/cormorantgaramond-wght--lightitalic.woff2", weight: "300", style: "italic" },
    { path: "../../public/fonts/cormorantgaramond-wght--regular.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/cormorantgaramond-wght--italic.woff2", weight: "400", style: "italic" },
    { path: "../../public/fonts/cormorantgaramond-wght--medium.woff2", weight: "500", style: "normal" },
    { path: "../../public/fonts/cormorantgaramond-wght--mediumitalic.woff2", weight: "500", style: "italic" },
    { path: "../../public/fonts/cormorantgaramond-wght--semibold.woff2", weight: "600", style: "normal" },
    { path: "../../public/fonts/cormorantgaramond-wght--semibolditalic.woff2", weight: "600", style: "italic" },
    { path: "../../public/fonts/cormorantgaramond-wght--bold.woff2", weight: "700", style: "normal" },
    { path: "../../public/fonts/cormorantgaramond-wght--bolditalic.woff2", weight: "700", style: "italic" },
  ],
  variable: "--font-cormorant",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "SAMAQU — Busana Muslim Pria Premium | Thobe, Kandora, Koko",
    template: "%s | SAMAQU",
  },
  description:
    "SAMAQU — busana muslim pria premium. Thobe, Kandora, Koko, Vest, Kabak, Cover Hanger. Bahan pilihan, jahitan rapi, cocok untuk ibadah dan acara istimewa. Pesan via WhatsApp.",
  keywords: ["SAMAQU", "busana muslim pria", "thobe", "kandora", "baju koko", "vest muslim", "premium menswear", "muslim fashion"],
  metadataBase: new URL(SITE_URL),
  icons: {
    icon: "/favicon.svg",
    apple: "/favicon.svg",
  },
  openGraph: {
    type: "website",
    locale: "id_ID",
    siteName: "SAMAQU",
    title: "SAMAQU — Busana Muslim Pria Premium",
    description: "Thobe, Kandora, Koko, Vest, Kabak. Bahan pilihan, jahitan rapi, dibuat untuk momen istimewa.",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "SAMAQU — Busana Muslim Pria Premium",
    description: "Thobe, Kandora, Koko, Vest, Kabak. Bahan pilihan, jahitan rapi, dibuat untuk momen istimewa.",
  },
  robots: { index: true, follow: true },
  other: {
    "theme-color": "#000000",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Bahasa halaman mengikuti prefix URL (/id, /en) supaya sinyal bahasa benar.
  const pathname = (await headers()).get("x-pathname") || "";
  const lang = pathname.split("/")[1] === "en" ? "en" : "id";

  return (
    <html lang={lang} className={`${inter.variable} ${cormorant.variable}`}>
      <head>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              "@id": `${SITE_URL}#organization`,
              name: SITE_NAME,
              description: SITE_DESCRIPTION,
              url: SITE_URL,
              logo: { "@type": "ImageObject", url: `${SITE_URL}/logo.svg` },
              email: SITE_CONTACT.email,
              areaServed: "ID",
              sameAs: [SITE_CONTACT.instagram],
              contactPoint: { "@type": "ContactPoint", telephone: "+62-85212150100", contactType: "customer service", availableLanguage: ["Indonesian", "English"] },
            },
            {
              "@type": "WebSite",
              "@id": `${SITE_URL}#website`,
              name: SITE_NAME,
              url: SITE_URL,
              inLanguage: ["id", "en"],
              publisher: { "@id": `${SITE_URL}#organization` },
              potentialAction: {
                "@type": "SearchAction",
                target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/katalog?q={search_term_string}` },
                "query-input": "required name=search_term_string",
              },
            },
          ],
        }) }} />
      </head>
      <body>
        <Providers>
          {children}
        </Providers>
        <VercelAnalytics />
      </body>
    </html>
  );
}
