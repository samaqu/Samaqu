import {
  createR2PrivateDownloadUrl,
  createR2PrivateUploadUrl,
  r2PrivateConfigured,
} from "./r2";

const MAX_BYTES = 8 * 1024 * 1024;

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function waMediaSignedUrl(key: string | null | undefined, expires = 3600): string | null {
  if (!key || !r2PrivateConfigured()) return null;
  try {
    return createR2PrivateDownloadUrl(key, expires).downloadUrl;
  } catch {
    return null;
  }
}

export async function archiveWaMedia(input: {
  url: string;
  sender: string;
  id: string;
}): Promise<string | null> {
  if (!input.url || !r2PrivateConfigured()) return null;

  // Fonnte kadang belum siap saat webhook masuk, dan URL-nya cepat kedaluwarsa.
  // Coba dua kali sebelum menyerah supaya bukti transfer tidak hilang.
  let res: Response | null = null;
  for (let attempt = 0; attempt < 2 && !res; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const attemptRes = await fetch(input.url, { signal: controller.signal });
      if (attemptRes.ok) res = attemptRes;
    } catch {
      // coba lagi di putaran berikutnya
    } finally {
      clearTimeout(timer);
    }
    if (!res) await new Promise((resolve) => setTimeout(resolve, 800));
  }
  if (!res) {
    console.error("[WA-MEDIA] unduh lampiran gagal:", input.url);
    return null;
  }

  try {
    const type = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim().toLowerCase();
    if (!type.startsWith("image/")) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_BYTES) return null;

    const sender = String(input.sender || "unknown").replace(/\D/g, "") || "unknown";
    const ext = EXT[type] || "jpg";
    const key = `wa/${sender}/${String(input.id).replace(/[^a-zA-Z0-9-]/g, "")}-${crypto.randomUUID()}.${ext}`;

    const { uploadUrl } = createR2PrivateUploadUrl(key, 600);
    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": type },
      body: bytes,
    });
    if (!put.ok) {
      console.error("[WA-MEDIA] upload R2 gagal:", put.status, await put.text().catch(() => ""));
      return null;
    }
    return key;
  } catch (error) {
    console.error("[WA-MEDIA] arsip gagal:", error);
    return null;
  }
}
