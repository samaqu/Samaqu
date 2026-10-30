import type { Metadata } from "next";
import { localePageMetadata } from "@/lib/seo-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return localePageMetadata(locale, "/panduan-ukuran");
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
