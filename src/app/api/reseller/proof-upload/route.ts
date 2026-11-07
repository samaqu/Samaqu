import { NextRequest, NextResponse } from "next/server";
import { resellerSession, resellerUnauthorized } from "@/lib/reseller/auth";
import {
  createR2PrivateDownloadUrl,
  createR2PrivateUploadUrl,
  r2PrivateConfigured,
} from "@/lib/r2";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Presign upload bukti transfer ke bucket private.
 * File di-PUT langsung dari browser ke R2; server hanya menerima metadata.
 */
export async function POST(req: NextRequest) {
  const session = await resellerSession(req);
  if (!session) return resellerUnauthorized();

  if (!r2PrivateConfigured()) {
    return NextResponse.json({ error: "Private R2 belum dikonfigurasi" }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as
    | { contentType?: string; size?: number; kind?: string }
    | null;
  const contentType = String(body?.contentType || "").toLowerCase();
  const size = Number(body?.size || 0);
  const kind = body?.kind === "order-payment" ? "order-payment" : "topup";

  if (!ALLOWED_TYPES.has(contentType)) {
    return NextResponse.json({ error: "Bukti harus JPG, PNG, atau WebP" }, { status: 400 });
  }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) {
    return NextResponse.json({ error: "Ukuran gambar maksimal 10MB" }, { status: 400 });
  }

  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const safeReseller = String(session.reseller.id).replace(/[^a-z0-9-]/gi, "").slice(0, 40) || "reseller";
  const key = `private/reseller-${kind}/${safeReseller}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${ext}`;

  const { uploadUrl } = createR2PrivateUploadUrl(key, 600);
  const { downloadUrl } = createR2PrivateDownloadUrl(key, 600);

  return NextResponse.json({ key, uploadUrl, previewUrl: downloadUrl });
}
