/**
 * Penerusan atribusi iklan dari URL kampanye ke halaman Open Order.
 *
 *   /campaign/create-your-price?utm_source=ig&utm_campaign=cyp
 *   → /id/open-order?utm_source=ig&utm_campaign=cyp
 *
 * Murni (tanpa React) supaya bisa dipakai di server component.
 */

/** Path Open Order publik yang sudah ada (ber-locale). */
export const OPEN_ORDER_PATH = "/id/open-order";

/** Awalan/parameter yang diteruskan. */
const FORWARDED_PREFIXES = ["utm_", "gclid", "fbclid", "ttclid", "msclkid"];

function shouldForward(key: string): boolean {
  const lower = key.toLowerCase();
  return FORWARDED_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/**
 * Terima `searchParams` halaman kampanye (hasil Next) dan kembalikan query string yang
 * layak diteruskan, sudah ter-encode. Kosong kalau tidak ada parameter yang cocok.
 */
export function forwardedQuery(searchParams: Record<string, string | string[] | undefined>): string {
  const pairs: string[] = [];

  for (const [key, value] of Object.entries(searchParams)) {
    if (!shouldForward(key)) continue;
    // Parameter bisa berulang (`?utm_source=a&utm_source=b`) → Next memberi array.
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (!item) continue;
      pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(item)}`);
    }
  }

  return pairs.join("&");
}

/** Href Open Order lengkap dengan atribusi kampanye (kalau ada). */
export function openOrderHref(searchParams: Record<string, string | string[] | undefined>): string {
  const query = forwardedQuery(searchParams);
  return query ? `${OPEN_ORDER_PATH}?${query}` : OPEN_ORDER_PATH;
}
