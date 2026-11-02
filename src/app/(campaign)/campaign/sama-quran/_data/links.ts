/**
 * Helper tautan halaman kampanye Sama Quran: katalog + WhatsApp CS.
 *
 * Murni (tanpa React) supaya bisa dipakai di server component.
 */

/** Path katalog publik yang sudah ada (ber-locale). */
export const KATALOG_PATH = "/id/katalog";

/** Awalan/parameter UTM yang diteruskan dari URL kampanye. */
const FORWARDED_PREFIXES = ["utm_", "gclid", "fbclid", "ttclid", "msclkid"];

function shouldForward(key: string): boolean {
  const lower = key.toLowerCase();
  return FORWARDED_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/** Query string atribusi yang layak diteruskan, sudah ter-encode. */
export function forwardedQuery(searchParams: Record<string, string | string[] | undefined>): string {
  const pairs: string[] = [];

  for (const [key, value] of Object.entries(searchParams)) {
    if (!shouldForward(key)) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (!item) continue;
      pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(item)}`);
    }
  }

  return pairs.join("&");
}

/** Href katalog + atribusi kampanye (kalau ada). */
export function katalogHref(searchParams: Record<string, string | string[] | undefined> = {}): string {
  const query = forwardedQuery(searchParams);
  return query ? `${KATALOG_PATH}?${query}` : KATALOG_PATH;
}
