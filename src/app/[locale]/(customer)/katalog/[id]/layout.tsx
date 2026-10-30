import { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION, localeAlternates } from "@/lib/site-config";

// Shell + metadata produk di-cache; admin memanggil revalidatePath saat produk disimpan.
export const revalidate = 300;

/** Semua produk terbit diprerender saat build; produk baru dibuat on-demand lalu di-cache. */
export async function generateStaticParams() {
  const { data } = await supabase.from("products").select("id").eq("is_published", true);
  return (data ?? []).map((product) => ({ id: String(product.id) }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; id: string }> }): Promise<Metadata> {
  const { locale, id } = await params;
  const { data: product } = await supabase.from("products").select("id, name, description, category, image, price, colors").eq("id", id).eq("is_published", true).maybeSingle();

  if (!product) {
    return { title: "Produk Tidak Ditemukan — SAMAQU" };
  }

  const description = product.description || `${product.name} — ${product.category} premium dari ${SITE_NAME}. Bahan pilihan, jahitan rapi, cocok untuk ibadah dan acara istimewa.`;
  const ogImage = product.image || `${SITE_URL}/og-product.png`;

  return {
    title: `${product.name} — ${product.category} Premium`,
    description,
    keywords: [product.name, product.category, SITE_NAME, "Muslim Menswear", "Thobe", "Kandora", "Busana Muslim Pria", "Baju Koko", "Premium"],
    openGraph: {
      title: `${product.name} — ${SITE_NAME}`,
      description,
      url: `${SITE_URL}/${locale}/katalog/${product.id}`,
      siteName: SITE_NAME,
      images: [{ url: ogImage, width: 800, height: 1000, alt: product.name }],
      type: "website",
      locale: locale === "en" ? "en_US" : "id_ID",
    },
    twitter: {
      card: "summary_large_image",
      title: `${product.name} — ${SITE_NAME}`,
      description,
      images: [ogImage],
    },
    alternates: localeAlternates(locale, `/katalog/${product.id}`),
  };
}

export default async function ProductLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const { data: product } = await supabase.from("products").select("id, name, description, category, image, price, colors").eq("id", id).eq("is_published", true).maybeSingle();
  // Produk belum "tampil di website" (atau tidak ada) → 404 untuk customer.
  if (!product) notFound();

  const jsonLd = product ? {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}#organization`,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        url: SITE_URL,
        logo: { "@type": "ImageObject", url: `${SITE_URL}/logo.svg` },
        contactPoint: { "@type": "ContactPoint", telephone: "+62-85212150100", contactType: "customer service", availableLanguage: "Indonesian" },
      },
      {
        "@type": "Product",
        name: product.name,
        description: product.description || `${product.name} — ${product.category} premium dari ${SITE_NAME}`,
        image: product.image?.startsWith("http") ? product.image : `${SITE_URL}${product.image || "/images/og-product.png"}`,
        sku: product.id,
        brand: { "@type": "Brand", name: SITE_NAME },
        category: product.category,
        inLanguage: locale,
        color: Array.isArray(product.colors) ? product.colors.join(", ") : "",
        offers: {
          "@type": "Offer",
          url: `${SITE_URL}/${locale}/katalog/${product.id}`,
          priceCurrency: "IDR",
          price: product.price,
          availability: "https://schema.org/InStock",
          seller: { "@id": `${SITE_URL}#organization` },
          itemCondition: "https://schema.org/NewCondition",
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: locale === "en" ? "Home" : "Beranda", item: `${SITE_URL}/${locale}` },
          { "@type": "ListItem", position: 2, name: locale === "en" ? "Catalog" : "Katalog", item: `${SITE_URL}/${locale}/katalog` },
          { "@type": "ListItem", position: 3, name: product.name },
        ],
      },
    ],
  } : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      {children}
    </>
  );
}
