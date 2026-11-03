import type { Metadata } from "next";
import { localePageMetadata } from "@/lib/seo-metadata";

/**
 * Metadata halaman Open Order.
 *
 * Judul & deskripsi khusus halaman ini (bukan mewarisi judul homepage) supaya hasil
 * pencarian tidak kembar. Sengaja TANPA harga spesifik: harga berubah sewaktu-waktu,
 * sedangkan halaman ini ter-cache 180 detik dan ikut diindeks mesin pencari.
 */
const OPEN_ORDER_TITLE = "Open Order SAMAQU — Pesan Busana Muslim Pria Premium";
const OPEN_ORDER_DESCRIPTION =
  "Ikut Open Order SAMAQU: pilih thobe, kandora, koko, dan vest pilihan, tentukan kain serta ukuran, lalu selesaikan pesanan langsung dari halaman ini. Periode dan kuota Open Order dibuka berkala.";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    ...localePageMetadata(locale, "/open-order"),
    title: OPEN_ORDER_TITLE,
    description: OPEN_ORDER_DESCRIPTION,
    robots: { index: true, follow: true },
    openGraph: {
      ...localePageMetadata(locale, "/open-order").openGraph,
      title: OPEN_ORDER_TITLE,
      description: OPEN_ORDER_DESCRIPTION,
    },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
