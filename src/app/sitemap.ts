import { MetadataRoute } from "next";
import { supabase } from "@/lib/supabase";
import { SITE_URL, SITE_LOCALES, DEFAULT_LOCALE } from "@/lib/site-config";
import { PROMO_META } from "@/lib/promo/free-cover-hanger";

const PROMO_PATH = "/promo/free-cover-hanger";

// Sitemap di-cache 1 jam supaya produk baru ikut terdaftar tanpa redeploy.
export const revalidate = 3600;

type Freq = "weekly" | "monthly";

/** Halaman publik yang layak diindeks (urutan = prioritas). */
const STATIC_PAGES: { path: string; priority: number; changeFrequency: Freq }[] = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/katalog", priority: 0.9, changeFrequency: "weekly" },
  { path: "/testimoni", priority: 0.7, changeFrequency: "weekly" },
  { path: "/tentang-kami", priority: 0.6, changeFrequency: "monthly" },
  { path: "/faq", priority: 0.6, changeFrequency: "monthly" },
  { path: "/panduan-ukuran", priority: 0.6, changeFrequency: "monthly" },
  { path: "/create-your-price", priority: 0.6, changeFrequency: "weekly" },
  { path: "/cara-pesan", priority: 0.5, changeFrequency: "monthly" },
  { path: "/garansi-retur", priority: 0.5, changeFrequency: "monthly" },
  { path: "/sama-quran", priority: 0.5, changeFrequency: "monthly" },
  { path: "/cek-resi", priority: 0.4, changeFrequency: "monthly" },
];

/**
 * Halaman dengan SATU URL saja (tanpa prefix locale).
 * `/bio` hidup di luar next-intl dan `/id/bio` di-redirect 308 ke sini, jadi
 * cukup satu entri. Dulu halaman ini tidak terdaftar, sehingga mesin pencari
 * (dan crawler AI) tidak tahu halamannya ada.
 */
const SINGLE_URL_PAGES: { path: string; priority: number; changeFrequency: Freq }[] = [
  { path: "/bio", priority: 0.5, changeFrequency: "monthly" },
];

/** Satu path → entri per locale, masing-masing membawa hreflang lengkap. */
function localizedEntries(
  path: string,
  lastModified: Date,
  changeFrequency: Freq,
  priority: number,
): MetadataRoute.Sitemap {
  const suffix = path === "/" ? "" : path;
  const languages: Record<string, string> = {};
  for (const locale of SITE_LOCALES) {
    languages[locale] = `${SITE_URL}/${locale}${suffix}`;
  }
  languages["x-default"] = `${SITE_URL}/${DEFAULT_LOCALE}${suffix}`;

  return SITE_LOCALES.map((locale) => ({
    url: `${SITE_URL}/${locale}${suffix}`,
    lastModified,
    changeFrequency,
    priority,
    alternates: { languages },
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries = STATIC_PAGES.flatMap((page) =>
    localizedEntries(page.path, now, page.changeFrequency, page.priority),
  );

  // Halaman URL tunggal: tanpa alternates karena memang tidak punya versi locale.
  const singleEntries: MetadataRoute.Sitemap = SINGLE_URL_PAGES.map((page) => ({
    url: `${SITE_URL}${page.path}`,
    lastModified: now,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));

  // Landing promo: masuk sitemap hanya kalau flag-nya menyala di config promonya
  // (halaman dipakai untuk kampanye iklan, jadi boleh diindeks). URL tunggal tanpa locale.
  const promoEntries: MetadataRoute.Sitemap = PROMO_META.includeInSitemap
    ? [
        {
          url: `${SITE_URL}${PROMO_PATH}`,
          lastModified: now,
          changeFrequency: "weekly",
          priority: 0.6,
        },
      ]
    : [];

  const { data: products } = await supabase
    .from("products")
    .select("id, created_at")
    .eq("is_published", true)
    .order("created_at", { ascending: false });

  const productEntries = (products || []).flatMap((p) =>
    localizedEntries(
      `/katalog/${p.id}`,
      p.created_at ? new Date(p.created_at) : now,
      "weekly",
      0.8,
    ),
  );

  return [...staticEntries, ...singleEntries, ...promoEntries, ...productEntries];
}
