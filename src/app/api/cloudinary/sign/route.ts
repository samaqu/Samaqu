import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { resellerSession } from "@/lib/reseller/auth";

export const runtime = "nodejs";

// Incoming transformation yang dipakai saat upload:
// - c_limit  → jangan upscale, pertahankan rasio
// - w_2400   → batasi sisi terpanjang supaya storage tidak boros
// - q_auto   → kompresi cerdas (tanpa f_auto agar format asli tidak diubah di storage)
const IMAGE_TRANSFORMATION = "c_limit,w_2400,q_auto:good";

// VIDEO: incoming transformation diturunkan dari w_1280 (1080p) ke w_720 (720p).
//
// Menurut aturan billing resmi Cloudinary (docs "Transformation counts"), biaya video
// dihitung dari resolusi OUTPUT — bukan input:
//   SD  = ≤ 921.600 pixel  → 2 unit/detik  (mis. 1280x720)
//   HD  = ≤ 2.073.600 pixel → 4 unit/detik  (mis. 1920x1080)
//
// Video katalog SAMAQU semuanya portrait 1080x1920 = 2.073.600 pixel — pas di ambang
// HD. Setting lama "c_limit,w_1280" justru skenario terburuk: lebar 1080 sudah di bawah
// 1280 sehingga c_limit tidak melakukan resize sama sekali, tapi Cloudinary tetap
// re-encode penuh dan menagih tarif HD penuh (4 unit/detik) — membayar mahal untuk
// hasil yang tidak mengecil.
//
// "c_limit,w_720" menghasilkan 720x1280 = 921.600 pixel = pas di ambang SD, jadi tarif
// turun separuh (4 → 2 unit/detik) sekaligus file mengecil. Terukur pada sampel yang sama
// (1080x1920, 13.42 detik, asli 6.34 MB):
//   1080p q_auto → 2.57 MB, biaya 0.0537 credit   (setting lama)
//   720p  q_auto → 1.60 MB, biaya 0.0268 credit   (setting baru)  ← 38% lebih kecil, 50% lebih murah
// 720p dinilai memadai untuk demo produk tekstil yang mayoritas ditonton di mobile;
// kalau suatu saat perlu 1080p, cukup ubah w_720 → w_1080 (tarif kembali HD).
//
// q_auto dipakai (bukan q_auto:good — hasilnya identik, jadi percuma — dan bukan
// q_auto:eco yang berisiko melembutkan detail kain).
//
// Catatan: incoming transformation MENGGANTI aset tersimpan dengan hasil 720p, jadi file
// asli tidak disimpan di Cloudinary. Cadangan original tetap ada di bucket Supabase
// `media-backup` (lihat AGENTS.md), jadi ini aman.
//
// Delivery video tetap tanpa transformasi (cloudinaryUrl() melewati video), sehingga
// menonton video tidak pernah memicu transcoding tambahan.
const VIDEO_TRANSFORMATION = "c_limit,w_720,q_auto";

type SignParams = Record<string, string | number>;

/**
 * Signature Cloudinary = sha1(parameter yang diurutkan alfabetis + api_secret).
 * Hanya parameter yang benar-benar dikirim (kecuali file, api_key, cloud_name,
 * resource_type, dan signature) yang ikut ditandatangani.
 */
function signParams(params: SignParams, apiSecret: string): string {
  const toSign = Object.keys(params)
    .filter((key) => {
      const value = params[key];
      return value !== undefined && value !== null && String(value) !== "";
    })
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return crypto.createHash("sha1").update(toSign + apiSecret).digest("hex");
}

// Transformasi khusus gambar chat: pelanggan tidak butuh resolusi besar, jadi cukup 1280px
// (lebih hemat storage/kredit daripada 2400px milik produk).
const CHAT_IMAGE_TRANSFORMATION = "c_limit,w_1280,q_auto:good";

// Foto ulasan: cukup 1280px, kompresi otomatis. Dipakai akun Cloudinary terpisah
// lewat env REVIEW_CLOUDINARY_* supaya kuota review tidak bercampur produk/chat.
const REVIEW_IMAGE_TRANSFORMATION = "c_limit,w_1280,q_auto:good";

// Upload chat dan ulasan boleh memakai akun Cloudinary TERPISAH (isolasi storage/kredit).
// Kalau env-nya belum diisi, jatuh ke akun utama supaya tetap jalan.
// Bukti transfer reseller (top up & kekurangan) memakai akun utama, folder "reseller".
function resolveScope(scope: "product" | "chat" | "review" | "reseller") {
  if (scope === "chat") {
    return {
      cloudName: process.env.CHAT_CLOUDINARY_CLOUD || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD,
      apiKey: process.env.CHAT_CLOUDINARY_API_KEY || process.env.CLOUDINARY_API_KEY,
      apiSecret: process.env.CHAT_CLOUDINARY_API_SECRET || process.env.CLOUDINARY_API_SECRET,
      folder: "chat" as string | undefined,
      kind: "chat" as const,
    };
  }
  if (scope === "review") {
    return {
      cloudName: process.env.REVIEW_CLOUDINARY_CLOUD || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD,
      apiKey: process.env.REVIEW_CLOUDINARY_API_KEY || process.env.CLOUDINARY_API_KEY,
      apiSecret: process.env.REVIEW_CLOUDINARY_API_SECRET || process.env.CLOUDINARY_API_SECRET,
      folder: "reviews" as string | undefined,
      kind: "review" as const,
    };
  }
  if (scope === "reseller") {
    return {
      cloudName: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD,
      apiKey: process.env.CLOUDINARY_API_KEY,
      apiSecret: process.env.CLOUDINARY_API_SECRET,
      folder: "reseller" as string | undefined,
      kind: "reseller" as const,
    };
  }
  return {
    cloudName: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
    folder: undefined,
    kind: "product" as const,
  };
}

/** Ulasan hanya untuk customer yang login (bukan admin, bukan anon). */
async function isCustomerRequest(request: Request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  try {
    const admin = getSupabaseAdmin();
    const { data } = await admin.auth.getUser(token);
    if (!data?.user?.id) return false;
    const { data: customer } = await admin
      .from("customers")
      .select("id")
      .eq("id", data.user.id)
      .maybeSingle();
    return Boolean(customer);
  } catch {
    return false;
  }
}

/** Bukti transfer reseller hanya untuk sesi reseller (token hash di reseller_sessions). */
async function isResellerRequest(request: Request) {
  try {
    return Boolean(await resellerSession(request as NextRequest));
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  let body: { resourceType?: string; scope?: string } = {};
  try {
    body = await request.json();
  } catch {
    // Body kosong → default
  }

  const requested = String(body?.scope || "product");
  const scope: "product" | "chat" | "review" | "reseller" =
    requested === "chat"
      ? "chat"
      : requested === "review"
        ? "review"
        : requested === "reseller"
          ? "reseller"
          : "product";

  // Upload foto ulasan hanya untuk customer yang login.
  if (scope === "review" && !(await isCustomerRequest(request))) {
    return NextResponse.json({ error: "Silakan masuk dulu." }, { status: 401 });
  }

  // Bukti transfer reseller hanya untuk sesi reseller yang sah.
  if (scope === "reseller" && !(await isResellerRequest(request))) {
    return NextResponse.json({ error: "Silakan masuk dulu." }, { status: 401 });
  }

  const { cloudName, apiKey, apiSecret, folder, kind } = resolveScope(scope);

  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json(
      { error: "Cloudinary belum dikonfigurasi. Set NEXT_PUBLIC_CLOUDINARY_CLOUD, CLOUDINARY_API_KEY, dan CLOUDINARY_API_SECRET." },
      { status: 500 }
    );
  }

  // Guard ringan: tolak kalau Origin tidak sama dengan host (cegah endpoint
  // signing dipakai dari situs lain). Request tanpa Origin (server-side) tetap lolos.
  const origin = request.headers.get("origin");
  if (origin) {
    const host = request.headers.get("host");
    try {
      if (!host || new URL(origin).host !== host) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  let resourceType: "image" | "video" = "image";
  if (kind === "product" && body?.resourceType === "video") resourceType = "video";

  const timestamp = Math.floor(Date.now() / 1000);

  // Produk: gambar → c_limit,w_2400,q_auto:good; video → c_limit,w_720,q_auto (lihat catatan
  // VIDEO_* di atas: tarif SD, bukan HD). Chat dan ulasan: gambar 1280px.
  const transformation =
    kind === "chat" || kind === "reseller"
      ? CHAT_IMAGE_TRANSFORMATION
      : kind === "review"
        ? REVIEW_IMAGE_TRANSFORMATION
        : resourceType === "video"
          ? VIDEO_TRANSFORMATION
          : IMAGE_TRANSFORMATION;

  const signatureParams: SignParams = { timestamp, transformation };
  if (folder) signatureParams.folder = folder;
  const signature = signParams(signatureParams, apiSecret);

  return NextResponse.json({
    cloudName,
    apiKey,
    timestamp,
    transformation,
    resourceType,
    folder,
    signature,
  });
}
