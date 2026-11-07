"use client";

/**
 * Upload gambar live chat langsung ke R2 public lewat presigned PUT.
 * Body file tidak melewati Vercel.
 */
export async function uploadChatImage(file: File): Promise<string> {
  const res = await fetch("/api/chat/upload", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType: file.type, size: file.size }),
  });

  const json = (await res.json().catch(() => ({}))) as {
    uploadUrl?: string;
    publicUrl?: string;
    error?: string;
  };
  if (!res.ok || !json.uploadUrl || !json.publicUrl) {
    throw new Error(json.error || "Gagal menyiapkan upload");
  }

  const put = await fetch(json.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "image/jpeg" },
    body: file,
  });
  if (!put.ok) {
    throw new Error(`Upload gambar gagal (${put.status})`);
  }

  return json.publicUrl;
}
