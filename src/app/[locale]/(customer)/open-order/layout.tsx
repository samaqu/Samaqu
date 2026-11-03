import type { Metadata } from "next";
import { localePageMetadata } from "@/lib/seo-metadata";

/**
 * Metadata halaman Open Order (id + en).
 *
 * Judul & deskripsi khusus halaman ini (bukan mewarisi judul homepage) supaya hasil
 * pencarian tidak kembar. Teksnya tidak menulis angka harga spesifik — cukup
 * "mulai dari harga minimal" — karena harga berubah sewaktu-waktu sedangkan
 * halaman ini ikut diindeks mesin pencari.
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
    title: meta.title,
    description: meta.description,
    robots: { index: true, follow: true },
    openGraph: {
      ...base.openGraph,
      title: meta.title,
      description: meta.description,
    },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
