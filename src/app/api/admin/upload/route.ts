import { NextRequest, NextResponse } from "next/server";
import { isOpsAdmin } from "@/lib/ops-auth";
import { createR2UploadUrl, r2Configured } from "@/lib/r2";

export const runtime = "nodejs";

const FOLDERS = new Set(["katalog", "hero", "promo", "bio", "testimoni"]);
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm"]);
const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_VIDEO = 50 * 1024 * 1024;

function safeName(name: string): string {
  const base =
    name
      .replace(/\.[^.]+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "file";
  const ext = (name.match(/\.[a-z0-9]+$/i)?.[0] || "").toLowerCase();
  return `${base}${ext}`;
}

export async function POST(req: NextRequest) {
  if (!(await isOpsAdmin(req))) {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });
  }
  if (!r2Configured()) {
    return NextResponse.json({ error: "R2 belum dikonfigurasi" }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as {
    filename?: string;
    contentType?: string;
    size?: number;
    folder?: string;
  } | null;

  const filename = String(body?.filename || "");
  const contentType = String(body?.contentType || "");
  const folder = String(body?.folder || "katalog");
  const size = Number(body?.size || 0);

  if (!filename || !contentType) {
    return NextResponse.json({ error: "filename dan contentType wajib" }, { status: 400 });
  }
  if (!FOLDERS.has(folder)) {
    return NextResponse.json({ error: "folder tidak valid" }, { status: 400 });
  }

  const isImage = IMAGE_TYPES.has(contentType);
  const isVideo = VIDEO_TYPES.has(contentType);
  if (!isImage && !isVideo) {
    return NextResponse.json({ error: "Tipe file tidak didukung" }, { status: 400 });
  }
  if (size <= 0) {
    return NextResponse.json({ error: "size wajib" }, { status: 400 });
  }
  if (size > (isVideo ? MAX_VIDEO : MAX_IMAGE)) {
    return NextResponse.json(
      { error: `Maksimal ${isVideo ? "50MB" : "10MB"}` },
      { status: 400 },
    );
  }

  const key = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName(filename)}`;
  const { uploadUrl, publicUrl } = createR2UploadUrl(key);
  return NextResponse.json({ uploadUrl, publicUrl, key });
}
