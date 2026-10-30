import type { Metadata } from "next";
import { localePageMetadata } from "@/lib/seo-metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return localePageMetadata(locale, "/checkout/success");
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
