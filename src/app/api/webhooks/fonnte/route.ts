import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook masuk dari Fonnte (Device → Edit → Webhook URL).
 *
 * Tugasnya HANYA menyimpan pesan ke tabel `wa_inbox` lalu balas 200 secepat mungkin.
 * Tidak mengirim apa pun, tidak menyentuh logika notifikasi yang sudah ada.
 *
 * Wajib: "auto read" di device Fonnte harus On, kalau tidak webhook tidak dipanggil.
 * Keamanan: Fonnte tidak mengirim signature, jadi URL memakai kunci rahasia
 * (`?key=...` atau header `x-webhook-key`) yang dibandingkan dengan FONNTE_WEBHOOK_SECRET.
 */

function digits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

async function readPayload(req: NextRequest): Promise<Record<string, unknown>> {
  const type = req.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    return (await req.json().catch(() => ({}))) as Record<string, unknown>;
  }
  const form = await req.formData().catch(() => null);
  if (!form) return {};
  const out: Record<string, unknown> = {};
  form.forEach((value, key) => {
    out[key] = typeof value === "string" ? value : "";
  });
  return out;
}

function checkKey(req: NextRequest): NextResponse | null {
  const secret = process.env.FONNTE_WEBHOOK_SECRET || "";
  const given =
    req.nextUrl.searchParams.get("key") || req.headers.get("x-webhook-key") || "";
  if (!secret) {
    console.error("[WA-INBOX] FONNTE_WEBHOOK_SECRET belum diset — webhook ditolak.");
    return NextResponse.json({ error: "Webhook belum dikonfigurasi" }, { status: 500 });
  }
  if (given !== secret) {
    return NextResponse.json({ error: "Kunci webhook salah" }, { status: 401 });
  }
  return null;
}

/** Fonnte mewajibkan URL webhook menerima POST dan GET (GET dipakai untuk uji URL). */
export async function GET(req: NextRequest) {
  const rejected = checkKey(req);
  if (rejected) return rejected;
  return NextResponse.json({ ok: true, endpoint: "wa-inbox" });
}

export async function POST(req: NextRequest) {
  const rejected = checkKey(req);
  if (rejected) return rejected;

  try {
    const body = await readPayload(req);
    const device = digits(body.device);
    const senderRaw = String(body.sender ?? body.target ?? "").trim();
    const sender = digits(senderRaw);
    const message = String(body.message ?? body.text ?? "").trim();
    const member = String(body.member ?? "").trim();
    const mediaUrl = String(body.url ?? "").trim();
    const filename = String(body.filename ?? "").trim();
    const inboxid = String(body.inboxid ?? "").trim();
    const name = String(body.name ?? "").trim();
    const timestamp = Number(body.timestamp) || 0;

    if (!sender) return NextResponse.json({ ok: true, skipped: "sender kosong" });
    if (device && sender === device) return NextResponse.json({ ok: true, skipped: "pesan sendiri" });

    const isGroup = Boolean(member) || /@g\.us$/i.test(senderRaw) || senderRaw.includes("-");
    if (isGroup) return NextResponse.json({ ok: true, skipped: "pesan grup" });

    const dedupeKey =
      inboxid ||
      createHash("sha256")
        .update(`${device}|${sender}|${timestamp}|${message}`)
        .digest("hex");

    const { error } = await getSupabaseAdmin()
      .from("wa_inbox")
      .insert({
        dedupe_key: dedupeKey,
        device: device || null,
        sender,
        sender_name: name || null,
        message: message || (mediaUrl ? "[lampiran]" : ""),
        media_url: mediaUrl || null,
        filename: filename || null,
        is_group: false,
        inboxid: inboxid || null,
        fonnte_timestamp: timestamp || null,
      });

    if (error && error.code !== "23505") {
      console.error("[WA-INBOX] gagal simpan:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, duplicate: error?.code === "23505" });
  } catch (e) {
    console.error("[WA-INBOX] webhook error:", e);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
