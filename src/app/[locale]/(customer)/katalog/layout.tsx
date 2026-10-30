import { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION, localeAlternates, OG_IMAGE } from "@/lib/site-config";

// Shell halaman katalog boleh statis; produk baru langsung tampil dari client + revalidate admin.
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
  title: "Katalog Produk — SAMAQU",
  description: "Jelajahi koleksi busana pria muslim premium SAMAQU. Thobe, Kandora, Koko, Vest, Kabak, Cover Hanger — bahan pilihan, jahitan rapi.",
  keywords: ["katalog SAMAQU", "beli thobe", "kandora pria", "baju koko", "busana muslim"],
  openGraph: {
    title: "Katalog Produk — SAMAQU",
    description: "Koleksi busana pria muslim premium. Thobe, Kandora, Koko, Vest, Kabak.",
    url: `${SITE_URL}/${locale}/katalog`,
    locale: locale === "en" ? "en_US" : "id_ID",
    images: [OG_IMAGE],
  },
  alternates: localeAlternates(locale, "/katalog"),
  };
}

export default async function KatalogLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const { data: products } = await supabase.from("products").select("id, name, category, price, image").eq("is_published", true).order("created_at", { ascending: true }).limit(50);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}#organization`,
        name: SITE_NAME,
        url: SITE_URL,
      },
      {
        "@type": "CollectionPage",
        name: "Katalog Produk SAMAQU",
        description: "Koleksi busana pria muslim premium dari SAMAQU",
        url: `${SITE_URL}/${locale}/katalog`,
        inLanguage: locale,
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: products?.length || 0,
          itemListElement: (products || []).map((p, i) => ({
            "@type": "ListItem",
            position: i + 1,
            url: `${SITE_URL}/${locale}/katalog/${p.id}`,
            item: { "@type": "Product", name: p.name, sku: p.id, image: p.image?.startsWith("http") ? p.image : `${SITE_URL}${p.image || ""}`, offers: { "@type": "Offer", priceCurrency: "IDR", price: p.price, availability: "https://schema.org/InStock" } },
          })),
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: locale === "en" ? "Home" : "Beranda", item: `${SITE_URL}/${locale}` },
          { "@type": "ListItem", position: 2, name: locale === "en" ? "Catalog" : "Katalog", item: `${SITE_URL}/${locale}/katalog` },
        ],
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {children}
    </>
  );
}
