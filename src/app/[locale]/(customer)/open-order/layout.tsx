import type { Metadata } from "next";
import { localePageMetadata } from "@/lib/seo-metadata";

/**
 * Metadata halaman Open Order (id + en).
 *
 * Halaman ini adalah alur transaksi (step 1–6, keranjang, harga pilihan sendiri),
 * bukan halaman konten — konten produk kanonik ada di /katalog/<produk>. Karena itu
 * halaman ini `noindex, follow`: deep link tetap bisa dibagikan, tapi tidak bersaing
 * dengan halaman katalog di mesin pencari (menghindari duplikat & thin content).
 */
const META = {
  id: {
    title: "Open Order SAMAQU | Thobe & Kandora, Pilih Harga Sendiri",
    description:
      "Pesan thobe dan kandora SAMAQU lewat Open Order. Ada produk pilihan yang harganya bisa kamu tentukan sendiri, mulai dari harga minimal. Bahan premium, pesan mudah via website atau WhatsApp.",
  },
  en: {
    title: "SAMAQU Open Order | Thobe & Kandora, Set Your Own Price",
    description:
      "Order SAMAQU thobe and kandora through Open Order. Selected pieces let you set the price yourself, starting from a minimum price. Premium fabric, easy ordering via website or WhatsApp.",
  },
} as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const meta = locale === "en" ? META.en : META.id;
  const base = localePageMetadata(locale, "/open-order");

  return {
    ...base,
    // `absolute` supaya template "%s | SAMAQU" dari ROOT_METADATA tidak menempel lagi
    // (dulu jadi "…, Pilih Harga Sendiri | SAMAQU").
    title: { absolute: meta.title },
    description: meta.description,
    robots: { index: false, follow: true },
    openGraph: {
      ...base.openGraph,
      title: meta.title,
      description: meta.description,
    },
    // Twitter card masih mewarisi judul/deskripsi homepage — samakan dengan halaman ini.
    twitter: {
      title: meta.title,
      description: meta.description,
    },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
