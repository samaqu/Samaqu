import { supabase } from "@/lib/supabase";

/**
 * Upload langsung dari browser ke R2 lewat presigned PUT.
 * Body file tidak melewati Vercel, jadi video besar tetap aman.
 */
export async function uploadToR2(file: File, folder: string): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const res = await fetch("/api/admin/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token || ""}`,
    },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type,
      size: file.size,
      folder,
    }),
  });

  const json = (await res.json().catch(() => ({}))) as {
    uploadUrl?: string;
    publicUrl?: string;
    error?: string;
  };

  if (!res.ok || !json.uploadUrl || !json.publicUrl) {
    throw new Error(json.error || `Gagal menyiapkan upload (${res.status})`);
  }

  const put = await fetch(json.uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type || "application/octet-stream" },
  });

  if (!put.ok) {
    const text = await put.text().catch(() => "");
    throw new Error(`Upload R2 gagal (${put.status})${text ? `: ${text.slice(0, 120)}` : ""}`);
  }

  return json.publicUrl;
}
