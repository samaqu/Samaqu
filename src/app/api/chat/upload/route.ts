import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { createR2UploadUrl, r2Configured } from "@/lib/r2";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Presign upload gambar live chat ke R2 public (folder `chat/`).
 * Endpoint publik, jadi dibatasi per IP + tipe/ukuran file.
 */
export async function POST(req: NextRequest) {
  const limit = await checkRateLimit(req, "chat-upload", 30, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Terlalu banyak upload. Coba lagi nanti ya." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  if (!r2Configured()) {
    return NextResponse.json({ error: "Upload belum dikonfigurasi" }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as
    | { contentType?: string; size?: number }
    | null;
  const contentType = String(body?.contentType || "").toLowerCase();
  const size = Number(body?.size || 0);

  if (!ALLOWED_TYPES.has(contentType)) {
    return NextResponse.json({ error: "Gambar harus JPG, PNG, atau WebP" }, { status: 400 });
  }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) {
    return NextResponse.json({ error: "Ukuran gambar maksimal 10MB" }, { status: 400 });
  }

  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const day = new Date().toISOString().slice(0, 10);
  const key = `chat/${day}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { uploadUrl, publicUrl } = createR2UploadUrl(key);

  return NextResponse.json({ uploadUrl, publicUrl });
}
