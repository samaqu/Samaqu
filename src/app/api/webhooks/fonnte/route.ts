import { createHash } from "crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { archiveWaMedia } from "@/lib/wa-media";

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

/**
 * Catat panggilan yang tidak jadi pesan masuk (kunci salah, grup, pesan sendiri).
 * Berguna saat menelusuri "kenapa webhook tidak masuk": status `skipped` tidak
 * pernah diambil agent, jadi tidak mengganggu antrean balasan.
 */
async function recordSkipped(reason: string, payload: Record<string, unknown>) {
  try {
    await getSupabaseAdmin()
      .from("wa_inbox")
      .insert({
        dedupe_key: `debug-${crypto.randomUUID()}`,
        device: String(payload.device ?? "") || null,
        sender: String(payload.sender ?? payload.target ?? "") || "unknown",
        sender_name: String(payload.name ?? "") || null,
        message: String(payload.message ?? payload.text ?? "").slice(0, 500) || "(kosong)",
        is_group: reason.includes("grup"),
        status: "skipped",
        error: reason,
      });
  } catch (e) {
    console.error("[WA-INBOX] gagal mencatat skip:", e);
  }
}

async function checkKey(req: NextRequest): Promise<NextResponse | null> {
  const secret = process.env.FONNTE_WEBHOOK_SECRET || "";
  const given =
    req.nextUrl.searchParams.get("key") || req.headers.get("x-webhook-key") || "";
  if (!secret) {
    console.error("[WA-INBOX] FONNTE_WEBHOOK_SECRET belum diset — webhook ditolak.");
    return NextResponse.json({ error: "Webhook belum dikonfigurasi" }, { status: 500 });
  }
  if (given !== secret) {
    await recordSkipped(`kunci webhook salah (diterima: ${given.slice(0, 40) || "kosong"})`, {});
    return NextResponse.json({ error: "Kunci webhook salah" }, { status: 401 });
  }
  return null;
}

/** Fonnte mewajibkan URL webhook menerima POST dan GET (GET dipakai untuk uji URL). */
export async function GET(req: NextRequest) {
  const rejected = await checkKey(req);
  if (rejected) return rejected;
  return NextResponse.json({ ok: true, endpoint: "wa-inbox" });
}

export async function POST(req: NextRequest) {
  const rejected = await checkKey(req);
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

    if (!sender) {
      await recordSkipped("sender kosong", body);
      return NextResponse.json({ ok: true, skipped: "sender kosong" });
    }
    if (device && sender === device) {
      await recordSkipped("pesan sendiri (dari nomor device)", body);
      return NextResponse.json({ ok: true, skipped: "pesan sendiri" });
    }

    const isGroup = Boolean(member) || /@g\.us$/i.test(senderRaw) || senderRaw.includes("-");
    if (isGroup) {
      await recordSkipped("pesan grup", body);
      return NextResponse.json({ ok: true, skipped: "pesan grup" });
    }

    // `inboxid` dari Fonnte adalah id PERCAKAPAN, bukan id pesan — kalau dipakai
    // langsung, semua pesan berikutnya dari orang yang sama dianggap duplikat.
    // Kunci unik dibentuk dari percakapan + waktu kirim + isi, sehingga retry pesan
    // yang sama tetap terdeteksi, tapi pesan baru di percakapan lama tetap masuk.
    const dedupeKey = createHash("sha256")
      .update(`${inboxid}|${device}|${sender}|${timestamp}|${message}`)
      .digest("hex");

    const { data: inserted, error } = await getSupabaseAdmin()
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
      })
      .select("id")
      .maybeSingle();

    // `wa_inbox.id` dipakai sebagai trace id satu pesan dari webhook sampai balasan.
    const inboxId = (inserted as { id?: string } | null)?.id ?? null;
    if (inboxId) {
      console.log(
        `[WA-TRACE] inbox=${inboxId} sender=${sender} media=${mediaUrl ? "yes" : "no"}`,
      );
    }

    if (error && error.code !== "23505") {
      console.error("[WA-INBOX] gagal simpan:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!error && mediaUrl) {
      const mediaKey = await archiveWaMedia({ url: mediaUrl, sender, id: dedupeKey });
      if (mediaKey) {
        const { error: keyError } = await getSupabaseAdmin()
          .from("wa_inbox")
          .update({ media_key: mediaKey })
          .eq("dedupe_key", dedupeKey);
        if (keyError) console.error("[WA-INBOX] gagal simpan media_key:", keyError.message);
      }
    }

    // Trigger bot server langsung setelah pesan tersimpan — cron 1 menit tetap jadi fallback.
    // Tidak ditunggu supaya webhook Fonnte tetap cepat; debounce 4 detik di wa-agent
    // menggabungkan pesan beruntun.
    if (!error) {
      const academyBase = (process.env.ACADEMY_SUPABASE_URL || "").replace(/\/+$/, "");
      const academyKey = process.env.ACADEMY_SERVICE_ROLE_KEY || "";
      if (academyBase && academyKey) {
        after(async () => {
          try {
            await fetch(`${academyBase}/functions/v1/wa-agent`, {
              method: "POST",
              headers: {
                "x-wa-secret": academyKey,
                "Content-Type": "application/json",
              },
              body: "{}",
            });
          } catch (triggerError) {
            console.error("[WA-INBOX] trigger wa-agent gagal:", triggerError);
          }
        });
      }
    }

    return NextResponse.json({ ok: true, duplicate: error?.code === "23505", inbox_id: inboxId });
  } catch (e) {
    console.error("[WA-INBOX] webhook error:", e);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
