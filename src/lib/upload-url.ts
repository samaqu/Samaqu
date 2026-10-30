/**
 * Validasi URL berkas unggahan yang diterima dari klien.
 *
 * Beberapa endpoint tidak menerima file langsung: berkas diunggah ke Cloudinary lebih
 * dulu, lalu klien mengirim URL-nya (bukti transfer reseller, bukti top up, bukti
 * pembayaran kekurangan). Tanpa validasi, kolom itu bisa diisi URL apa pun — termasuk
 * `javascript:` atau domain asing yang bisa dipakai untuk phishing di layar admin.
 *
 * Aturan: hanya HTTPS, hanya host Cloudinary milik proyek (sama dengan pola yang sudah
 * dipakai live chat), ekstensi berkas gambar, dan panjang URL wajar.
 */

const ALLOWED_HOST_RE = /^res\.cloudinary\.com$/i;
const IMAGE_PATH_RE = /\.(jpe?g|png|webp|avif|gif|heic|heif|pdf)$/i;

export const MAX_PROOF_URL_LENGTH = 512;

export type UploadUrlCheck = { ok: true; url: string } | { ok: false; error: string };

/** Terima URL bukti pembayaran hanya bila berasal dari Cloudinary dan berupa gambar. */
export function validateProofUrl(raw: unknown): UploadUrlCheck {
  const value = String(raw ?? "").trim();
  if (!value) return { ok: false, error: "URL bukti tidak valid" };
  if (value.length > MAX_PROOF_URL_LENGTH) return { ok: false, error: "URL bukti terlalu panjang" };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, error: "URL bukti tidak valid" };
  }

  if (url.protocol !== "https:") return { ok: false, error: "URL bukti harus HTTPS" };
  if (!ALLOWED_HOST_RE.test(url.hostname)) return { ok: false, error: "URL bukti harus dari Cloudinary" };
  if (url.username || url.password) return { ok: false, error: "URL bukti tidak valid" };
  if (!IMAGE_PATH_RE.test(url.pathname)) return { ok: false, error: "Berkas bukti harus berupa gambar" };

  return { ok: true, url: url.toString() };
}
