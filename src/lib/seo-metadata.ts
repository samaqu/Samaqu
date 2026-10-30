import type { Metadata } from "next";
import { SITE_URL, SITE_NAME, localeAlternates, OG_IMAGE } from "@/lib/site-config";

/**
 * Metadata canonical + hreflang + og:url untuk satu halaman, dihitung dari
 * `locale` dan path yang memang sudah diketahui route-nya (bukan dari header request).
 *
 * Nilainya harus sama dengan metadata lama yang dulu dihitung dari `x-pathname`.
 */
export function localePageMetadata(locale: string, path: string): Metadata {
  const suffix = path === "/" ? "" : path;
  const isEn = locale === "en";

  return {
    alternates: localeAlternates(locale, path),
    openGraph: {
      type: "website",
      url: `${SITE_URL}/${locale}${suffix}`,
      locale: isEn ? "en_US" : "id_ID",
      alternateLocale: [isEn ? "id_ID" : "en_US"],
      siteName: SITE_NAME,
      images: [OG_IMAGE],
    },
  };
}
