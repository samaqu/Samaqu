export interface CloudinaryConfig {
  cloud: string;
}

export function getCloudinaryConfig(): CloudinaryConfig {
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD;
  if (!cloud) {
    throw new Error("Cloudinary belum dikonfigurasi. Set NEXT_PUBLIC_CLOUDINARY_CLOUD.");
  }
  return { cloud };
}

export interface CloudinaryUrlOptions {
  /** Lebar maksimum dalam px (c_limit = tidak upscale). */
  width?: number;
  /** Tinggi maksimum dalam px (c_limit = tidak upscale). */
  height?: number;
  /** Kualitas: default "auto" (q_auto). */
  quality?: string | number;
  /** Crop mode, default "limit" supaya gambar asli tidak diperbesar. */
  crop?: string;
  /**
   * Format, default "webp".
   *
   * Sengaja `f_webp`, bukan `f_auto`: menurut aturan penagihan Cloudinary, `f_auto`
   * bisa menghasilkan BEBERAPA derived asset untuk URL yang sama (satu per format per
   * browser — WebP + AVIF), dan tiap derived asset dihitung satu transformasi. `f_webp`
   * = satu derived asset per URL, jadi biaya transformasi sekitar separuh. Kualitas
   * praktis sama di `q_auto`; bedanya cuma berkas sedikit lebih besar dari AVIF.
   */
  format?: string;
  /** dpr, mis. "auto" untuk retina. */
  dpr?: string;
  /** Parameter transformasi tambahan, mis. "g_auto". */
  extra?: string;
}

const CLOUDINARY_TRANSFORM_SEGMENT = /^(f_|q_|w_|h_|c_|dpr_|g_|t_|e_|ar_|vc_|b_|r_|x_|y_|o_)/;

/**
 * Sisipkan transformasi Cloudinary ke URL delivery supaya browser cuma
 * mengunduh ukuran yang dibutuhkan (hemat bandwidth/kredit).
 *
 * Contoh:
 *   https://res.cloudinary.com/demo/image/upload/v1/a.jpg
 *   → https://res.cloudinary.com/demo/image/upload/f_webp,q_auto,w_600,c_limit/v1/a.jpg
 *
 * `f_webp` dipakai sebagai default (bukan `f_auto`) supaya satu URL hanya menghasilkan
 * satu derived asset — lihat catatan biaya di `CloudinaryUrlOptions.format`.
 *
 * URL non-Cloudinary (aset lokal, media Supabase, atau video) dikembalikan apa adanya.
 */
export function cloudinaryUrl(src: string, opts: CloudinaryUrlOptions = {}): string {
  if (!src || !src.includes("res.cloudinary.com")) return src;
  // Video: jangan ubah (transcode on-the-fly bisa menambah biaya processing)
  if (src.includes("/video/upload/")) return src;

  const marker = "/image/upload/";
  const idx = src.indexOf(marker);
  if (idx === -1) return src;

  const base = src.slice(0, idx + marker.length);
  const rest = src.slice(idx + marker.length);

  // Hindari transform ganda kalau URL sudah punya parameter transformasi
  const firstSegment = rest.split("/")[0];
  if (CLOUDINARY_TRANSFORM_SEGMENT.test(firstSegment)) return src;

  const parts: string[] = [
    `f_${opts.format ?? "webp"}`,
    `q_${opts.quality ?? "auto"}`,
  ];
  if (opts.width) parts.push(`w_${opts.width}`);
  if (opts.height) parts.push(`h_${opts.height}`);
  parts.push(`c_${opts.crop ?? "limit"}`);
  if (opts.dpr) parts.push(`dpr_${opts.dpr}`);
  if (opts.extra) parts.push(opts.extra);

  return `${base}${parts.join(",")}/${rest}`;
}

interface CloudinarySignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  /** Selalu diisi server: gambar → w_2400, video → w_720 (tarif SD), chat → w_1280. */
  transformation?: string;
  resourceType: "image" | "video";
  /** Folder upload (mis. "chat"); hanya ada untuk scope chat. */
  folder?: string;
  signature: string;
}

export type UploadScope = "product" | "chat" | "review";

/* ────────────────────────────────────────────────────────────────────────────
   Validasi berkas media sebelum upload.

   Upload video kini di-downscale Cloudinary ke 720p via incoming transformation
   (c_limit,w_720,q_auto — lihat VIDEO_TRANSFORMATION di api/cloudinary/sign),
   yang menagih 2 unit per detik (tarif SD). Validasi di sini adalah pagar
   pelengkap yang gratis dan tidak menyentuh Cloudinary:

   - Durasi → biaya transformasi video berbanding lurus dengan durasi, jadi
     video yang kepanjangan langsung dibatasi sebelum sempat membakar kredit.
   - Resolusi → mencegah upload 1440p/4K yang percuma (tetap di-downscale ke
     720p, hanya memperlambat upload).
   - MIME + ekstensi → menangkas berkas yang rusak atau berkedok.
   - Ukuran → batas yang sudah ada sebelumnya.

   Angka-angka di bawah mengikuti target katalog SAMAQU: video demo produk
   30 detik – 2 menit, maksimal 1080p.
   ──────────────────────────────────────────────────────────────────────────── */

export const MEDIA_LIMITS = {
  /** Gambar: 10 MB (sama seperti aturan lama). */
  imageMaxBytes: 10 * 1024 * 1024,
  /** Video: 50 MB (sama seperti aturan lama). */
  videoMaxBytes: 50 * 1024 * 1024,
  /** Sisi terpendek video — 1080 = 1080p. Lewat dari ini dianggap 1440p/4K. */
  videoMaxShortSide: 1080,
  /** Durasi maksimal video katalog, detik. */
  videoMaxDurationSec: 120,
} as const;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const VIDEO_TYPES = ["video/mp4", "video/webm"] as const;

/** Ekstensi yang diterima, dipakai sebagai pemeriksaan kedua di samping MIME. */
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
const VIDEO_EXT = /\.(mp4|m4v|webm)$/i;

/**
 * Baca durasi + dimensi video tanpa mengunduh seluruh berkas (cukup metadata).
 * Mengembalikan null kalau browser gagal membaca berkasnya.
 */
function readVideoMetadata(file: File): Promise<{ durationSec: number; width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement("video");
    let settled = false;

    const finish = (value: { durationSec: number; width: number; height: number } | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      el.removeAttribute("src");
      resolve(value);
    };

    // Timeout: kalau metadata tidak datang dalam 10 detik, anggap gagal dibaca.
    const timer = window.setTimeout(() => finish(null), 10_000);

    el.preload = "metadata";
    el.onloadedmetadata = () => {
      window.clearTimeout(timer);
      finish({
        durationSec: Number.isFinite(el.duration) ? el.duration : 0,
        width: el.videoWidth,
        height: el.videoHeight,
      });
    };
    el.onerror = () => {
      window.clearTimeout(timer);
      finish(null);
    };
    el.src = url;
  });
}

/**
 * Validasi berkas media sebelum diunggah. Melempar Error dengan pesan Bahasa
 * Indonesia (siap ditampilkan admin) bila berkas tidak lolos.
 *
 * Dipakai bersama oleh halaman tambah & edit produk supaya aturannya satu.
 */
export async function validateMediaFile(file: File): Promise<void> {
  const isVideo = file.type.startsWith("video/");
  const isImage = file.type.startsWith("image/");

  if (!isVideo && !isImage) {
    throw new Error(`${file.name}: format tidak didukung`);
  }

  // MIME dan ekstensi harus sama-sama cocok — menangkas berkas yang MIME-nya
  // di-spoof tapi ekstensinya aneh (atau sebaliknya).
  if (isVideo) {
    if (!(VIDEO_TYPES as readonly string[]).includes(file.type) || !VIDEO_EXT.test(file.name)) {
      throw new Error(`${file.name}: format video harus MP4 atau WebM`);
    }
    if (file.size > MEDIA_LIMITS.videoMaxBytes) {
      throw new Error(`${file.name}: terlalu besar. Maks: 50MB`);
    }

    const meta = await readVideoMetadata(file);
    if (!meta) {
      throw new Error(`${file.name}: metadata video tidak terbaca, file rusak atau format tidak didukung browser`);
    }

    const shortSide = Math.min(meta.width, meta.height);
    if (shortSide > MEDIA_LIMITS.videoMaxShortSide) {
      throw new Error(
        `${file.name}: resolusi ${meta.width}x${meta.height} melebihi batas 1080p. Kompres dulu sebelum diunggah.`
      );
    }
    if (meta.durationSec > MEDIA_LIMITS.videoMaxDurationSec) {
      throw new Error(
        `${file.name}: durasi ${Math.round(meta.durationSec)} detik melebihi batas ${MEDIA_LIMITS.videoMaxDurationSec} detik (2 menit).`
      );
    }
    return;
  }

  // Gambar
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type) || !IMAGE_EXT.test(file.name)) {
    throw new Error(`${file.name}: format gambar harus JPG, PNG, atau WebP`);
  }
  if (file.size > MEDIA_LIMITS.imageMaxBytes) {
    throw new Error(`${file.name}: terlalu besar. Maks: 10MB`);
  }
}

/**
 * Upload file ke Cloudinary memakai signed upload (server menandatangani
 * parameter lewat /api/cloudinary/sign). Dengan cara ini server bisa memaksa
 * incoming transformation, sehingga storage tidak menyimpan file resolusi
 * mentah. Tidak lagi butuh unsigned upload preset.
 *
 * Env yang dibutuhkan:
 *   NEXT_PUBLIC_CLOUDINARY_CLOUD, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
 */
export async function uploadToCloudinary(
  file: File,
  opts: { scope?: UploadScope; token?: string } = {},
): Promise<string> {
  const scope: UploadScope = opts.scope ?? "product";
  const isVideo = file.type.startsWith("video/");
  const resourceType: "image" | "video" = isVideo ? "video" : "image";

  // 1) Minta signature + parameter transformation dari server. `scope` menentukan akun
  //    Cloudinary: "product" (utama), "chat", atau "review" (akun terpisah bila env diisi).
  //    Scope review wajib membawa token customer.
  const signRes = await fetch("/api/cloudinary/sign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: JSON.stringify({ resourceType, scope }),
  });
  if (!signRes.ok) {
    console.error("[uploadToCloudinary] Gagal minta signature:", signRes.status);
    throw new Error("Upload gagal");
  }
  const sign = (await signRes.json()) as CloudinarySignature;

  // 2) Kirim file + parameter bertanda tangan langsung ke Cloudinary.
  //    Pakai cloudName dari respons (bukan env) supaya akun terpisah ikut jalan.
  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", sign.apiKey);
  formData.append("timestamp", String(sign.timestamp));
  formData.append("signature", sign.signature);
  // Transformation selalu diisi server (gambar → w_2400, video → w_720, chat → w_1280).
  // Guard-nya dipertahankan supaya aman kalau server suatu saat mengembalikan video tanpa
  // transformation — mengirim string kosong justru bikin Cloudinary menolak.
  if (sign.transformation) {
    formData.append("transformation", sign.transformation);
  }
  if (sign.folder) {
    formData.append("folder", sign.folder);
  }

  const res = await fetch(`https://api.cloudinary.com/v1_1/${sign.cloudName}/${resourceType}/upload`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[uploadToCloudinary] Cloudinary error:", res.status, detail);
    throw new Error("Upload gagal");
  }
  const data = await res.json();
  return data.secure_url;
}
