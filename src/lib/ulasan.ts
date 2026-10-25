/**
 * Aturan bersama ulasan pelanggan.
 *
 * Ulasan customer disimpan di tabel `testimonials` yang sudah ada, dibedakan
 * lewat `source = 'customer'` dan `status`. Baris lama tetap `admin`/`published`.
 */

export const REVIEW_STATUSES = ["pending", "published", "rejected"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** Nama yang tampil di halaman publik: "Ahmad F." bukan nama lengkap. */
export function maskCustomerName(value: unknown): string {
  const parts = String(value ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Pelanggan";
  if (parts.length === 1) return parts[0];
  const initial = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${parts[0]} ${initial}.`;
}

/** Isi ulasan: wajib 5–1000 karakter setelah dirapikan. */
export function cleanReviewContent(value: unknown): string | null {
  const text = String(value ?? "").trim();
  if (text.length < 5 || text.length > 1000) return null;
  return text;
}

/** Hanya terima URL gambar dari Cloudinary (akun mana pun). */
export function isCloudinaryImageUrl(value: unknown): boolean {
  const url = String(value ?? "").trim();
  if (!url) return true;
  return url.length <= 500 && /^https:\/\/res\.cloudinary\.com\//i.test(url);
}

export function parseReviewStatus(value: unknown): ReviewStatus | null {
  const status = String(value ?? "").trim();
  return (REVIEW_STATUSES as readonly string[]).includes(status) ? (status as ReviewStatus) : null;
}
