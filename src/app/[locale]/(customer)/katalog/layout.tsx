import { Metadata } from "next";
import { SITE_URL, OG_IMAGE, localeAlternates } from "@/lib/site-config";

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
    description:
      "Jelajahi koleksi busana pria muslim premium SAMAQU. Thobe, Kandora, Koko, Vest, Kabak, Cover Hanger — bahan pilihan, jahitan rapi.",
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

/**
 * Layout induk katalog.
 *
 * Sengaja TIDAK merender JSON-LD lagi. Schema daftar (CollectionPage + breadcrumb
 * 2 tingkat) dipasang oleh KatalogCollectionSchema di halaman daftar saja,
 * sedangkan halaman detail produk punya Product + breadcrumb 3 tingkat miliknya.
 *
 * Sebelumnya keduanya ter-render bersamaan di halaman produk, sehingga satu halaman
 * membawa dua BreadcrumbList yang saling bertabrakan.
 */
export default function KatalogLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}