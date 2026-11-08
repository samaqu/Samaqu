import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";
import { waMediaSignedUrl } from "@/lib/wa-media";

/**
 * URL bertanda tangan untuk lampiran WhatsApp (bukti transfer).
 *
 * Dipakai `wa-agent` saat menyusun rekap closing ke admin. Link tidak boleh
 * disalin dari jawaban AI: URL R2 private panjang dan sering terpotong di
 * bagian `?X-Amz-...`, sehingga tidak bisa dibuka. Server yang menandatangani.
 *
 * GET ?inbox_id=<uuid>  atau  ?key=<media_key>
 */

const MAX_EXPIRES = 7 * 24 * 60 * 60;

export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const sp = new URL(req.url).searchParams;
  const inboxId = String(sp.get("inbox_id") || "").trim();
  let mediaKey = String(sp.get("key") || "").trim();

  if (!mediaKey) {
    if (!inboxId) {
      return NextResponse.json({ error: "inbox_id atau key wajib" }, { status: 400 });
    }
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("wa_inbox")
      .select("media_key, sender")
      .eq("id", inboxId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    mediaKey = String(data?.media_key || "");

    // Bot kadang menunjuk pesan teks (mis. alamat), bukan pesan fotonya.
    // Pakai lampiran terakhir dari nomor yang sama sebagai cadangan.
    if (!mediaKey && data?.sender) {
      const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const { data: recent } = await admin
        .from("wa_inbox")
        .select("media_key")
        .eq("sender", String(data.sender))
        .not("media_key", "is", null)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      mediaKey = String(recent?.media_key || "");
    }

    if (!mediaKey) {
      return NextResponse.json({ error: "Lampiran pesan ini tidak tersimpan di R2." }, { status: 404 });
    }
  }

  const url = waMediaSignedUrl(mediaKey, MAX_EXPIRES);
  if (!url) {
    return NextResponse.json({ error: "R2 private belum dikonfigurasi." }, { status: 503 });
  }
  return NextResponse.json({ url });
}
