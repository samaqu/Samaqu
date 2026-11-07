"use client";

import { getResellerToken } from "./client";

/**
 * Upload bukti transfer langsung ke R2 private lewat presigned PUT.
 * Yang dikembalikan hanya object key — bukan URL publik.
 */
export async function uploadProofToPrivateR2(
  file: File,
  kind: "topup" | "order-payment",
): Promise<string> {
  const res = await fetch("/api/reseller/proof-upload", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getResellerToken()}`,
    },
    body: JSON.stringify({ contentType: file.type, size: file.size, kind }),
  });

  const json = (await res.json().catch(() => ({}))) as {
    key?: string;
    uploadUrl?: string;
    error?: string;
  };
  if (!res.ok || !json.key || !json.uploadUrl) {
    throw new Error(json.error || "Gagal menyiapkan upload");
  }

  const put = await fetch(json.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "image/jpeg" },
    body: file,
  });
  if (!put.ok) {
    throw new Error(`Upload R2 gagal (${put.status})`);
  }

  return json.key;
}
