/**
 * Pemetaan host media SAMAQU.
 *
 * Media katalog disimpan di DB sebagai URL lengkap ke host lama
 * (`samaqu-media.samaqu.workers.dev`). Untuk permukaan yang TIDAK bisa memakai
 * `next/image` (mis. sumber `<video>`), host itu dipetakan ke domain sendiri
 * (`NEXT_PUBLIC_IMG_HOST`, default `https://img.samaqu.id`) yang meneruskan
 * GET/HEAD ke host lama.
 *
 * Dipakai hanya untuk URL yang memang perlu dialihkan; URL host lain (Cloudinary,
 * Supabase, aset lokal) dan string kosong dikembalikan apa adanya.
 */

const LEGACY_HOST = "samaqu-media.samaqu.workers.dev";

/** Host gambar aktif; tanpa garis miring di akhir. */
const IMG_HOST = (process.env.NEXT_PUBLIC_IMG_HOST || "https://img.samaqu.id").replace(/\/+$/, "");

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** Ganti host lama → host gambar aktif. Host lain / kosong dikembalikan apa adanya. */
export function toImgUrl(url: string): string {
  if (!url) return url;
  const parsed = (() => {
    try {
      return new URL(url);
    } catch {
      return null;
    }
  })();
  if (!parsed || parsed.hostname !== LEGACY_HOST) return url;
  return `${IMG_HOST}${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/** Kembalikan URL ke host lama — dipakai sebagai fallback sekali saat video gagal. */
export function toLegacyUrl(url: string): string {
  if (!url) return url;
  const parsed = (() => {
    try {
      return new URL(url);
    } catch {
      return null;
    }
  })();
  if (!parsed || parsed.hostname !== hostnameOf(IMG_HOST)) return url;
  return `https://${LEGACY_HOST}${parsed.pathname}${parsed.search}${parsed.hash}`;
}
