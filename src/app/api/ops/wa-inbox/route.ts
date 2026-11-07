import { NextRequest, NextResponse } from "next/server";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getFonnteConfigs, normalizeWhatsappTarget, sendFonnteMessage } from "@/lib/fonnte";
import { waMediaSignedUrl } from "@/lib/wa-media";

/**
 * Kotak masuk WhatsApp untuk balasan manual/Claude (tabel `wa_inbox`).
 *
 * GET   ?limit=5        → klaim pesan `pending` (atomik per baris), ubah ke `processing`
 * POST  { target, message, inbox_id? } → kirim via device Fonnte jalur customer, tandai `sent`
 * PATCH { id, action: "skip"|"retry", note? }
 *
 * Mengirim memakai token yang SAMA dengan notifikasi customer (`getFonnteConfigs`) dan
 * fungsi kirim yang sudah ada (`sendFonnteMessage`) — tidak ada jalur token kedua.
 */

const MAX_ATTEMPTS = 3;
const STALE_MS = 10 * 60 * 1000;

export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const limit = Math.min(
    Math.max(parseInt(new URL(req.url).searchParams.get("limit") || "5", 10) || 5, 1),
    20,
  );
  const admin = getSupabaseAdmin();
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_MS).toISOString();

  await admin
    .from("wa_inbox")
    .update({ status: "pending", updated_at: now.toISOString() })
    .eq("status", "processing")
    .lt("claimed_at", staleBefore)
    .lt("attempts", MAX_ATTEMPTS);

  const { data: rows, error } = await admin
    .from("wa_inbox")
    .select("*")
    .eq("status", "pending")
    .eq("is_group", false)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: escalations } = await admin
    .from("wa_escalations")
    .select("sender")
    .in("status", ["open", "claimed"]);
  const blockedSenders = new Set((escalations || []).map((item) => String(item.sender)));

  const claimed: Record<string, unknown>[] = [];
  for (const row of rows || []) {
    // Jangan klaim nomor yang sedang di-escalate/ditangani admin.
    if (blockedSenders.has(String(row.sender))) continue;
    const { data: updated } = await admin
      .from("wa_inbox")
      .update({
        status: "processing",
        claimed_at: now.toISOString(),
        updated_at: now.toISOString(),
        attempts: (Number(row.attempts) || 0) + 1,
      })
      .eq("id", row.id)
      .eq("status", "pending")
      .select()
      .maybeSingle();
    if (updated) claimed.push(updated);
  }

  // Sertakan riwayat percakapan dengan pengirim yang sama, supaya balasan
  // nyambung dengan pesan sebelumnya (mis. customer menjawab "yg ini" saja).
  const { data: learnings } = await admin
    .from("wa_learnings")
    .select("scope, sender, topic, instruction")
    .eq("status", "published")
    .limit(1000);

  const withHistory: Record<string, unknown>[] = [];
  for (const row of claimed) {
    const { data: history } = await admin
      .from("wa_inbox")
      .select("created_at, message, reply_text, media_key")
      .eq("sender", row.sender)
      .neq("id", row.id)
      .order("created_at", { ascending: false })
      .limit(8);
    const instruksi = (learnings || [])
      .filter((item) => item.scope === "global" || String(item.sender || "") === String(row.sender))
      .map((item) => ({ topic: item.topic, instruction: item.instruction, scope: item.scope }));
    withHistory.push({
      ...row,
      media_url: waMediaSignedUrl(row.media_key as string | null) || row.media_url,
      riwayat: (history || []).reverse().map((item) => ({
        ...item,
        media_url: waMediaSignedUrl(item.media_key as string | null),
      })),
      instruksi,
    });
  }

  return NextResponse.json({ items: withHistory, claimed: withHistory.length });
}

export async function POST(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const body = await req.json().catch(() => null);
  const target = normalizeWhatsappTarget(String(body?.target ?? ""));
  const message = String(body?.message ?? "").trim();
  const inboxId = body?.inbox_id ? String(body.inbox_id) : null;
  const mediaUrl = String(body?.url ?? "").trim();
  const mediaFilename = String(body?.filename ?? "").trim().slice(0, 120);

  if (!target || !message) {
    return NextResponse.json({ error: "target dan message wajib" }, { status: 400 });
  }

  if (mediaUrl) {
    const base = (process.env.R2_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
    const allowed =
      /^https:\/\/res\.cloudinary\.com\//.test(mediaUrl) ||
      /^https:\/\/samaqu-media\.samaqu\.workers\.dev\//.test(mediaUrl) ||
      (Boolean(base) && mediaUrl.startsWith(`${base}/`));
    if (!allowed) {
      return NextResponse.json(
        { error: "URL attachment harus dari R2/Cloudinary SAMAQU" },
        { status: 400 },
      );
    }
  }

  const { customer } = await getFonnteConfigs();
  if (!customer.enabled || !customer.token) {
    return NextResponse.json(
      { error: "Device Fonnte jalur customer belum aktif atau tokennya kosong" },
      { status: 503 },
    );
  }

  const admin = getSupabaseAdmin();

  // Anti-dobel level server: satu pesan masuk hanya boleh dibalas sekali.
  // Kalau run lain (atau Claude yang sama) mencoba mengirim lagi dengan inbox_id
  // yang sudah `sent`, permintaannya ditolak sebelum menyentuh Fonnte.
  if (inboxId) {
    const { data: existing } = await admin
      .from("wa_inbox")
      .select("status, replied_at")
      .eq("id", inboxId)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ error: "Pesan masuk tidak ditemukan" }, { status: 404 });
    }
    if (existing.status === "sent") {
      return NextResponse.json(
        { error: "Pesan ini sudah dibalas sebelumnya. Tidak dikirim ulang." },
        { status: 409 },
      );
    }
    // Admin sudah ambil alih / pesan sudah ditutup: bot yang telanjur klaim tidak boleh kirim.
    if (existing.status === "skipped" || existing.status === "failed") {
      return NextResponse.json(
        { error: "Pesan ini sudah ditutup atau diambil alih admin. Bot tidak mengirim." },
        { status: 409 },
      );
    }
  }

  // Pengaman anti-banned: batasi kecepatan & volume kirim. Dihitung dari database
  // (bukan memori) supaya tetap berlaku walau request dilayani instance berbeda.
  const gapSeconds = Number(process.env.WA_SEND_MIN_GAP_SEC || 8);
  const maxPerHour = Number(process.env.WA_SEND_MAX_PER_HOUR || 20);
  const maxPerDay = Number(process.env.WA_SEND_MAX_PER_DAY || 80);
  const nowMs = Date.now();
  const hourAgo = new Date(nowMs - 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();

  const [{ data: lastSent }, { count: hourCount }, { count: dayCount }] = await Promise.all([
    admin
      .from("wa_inbox")
      .select("replied_at")
      .not("replied_at", "is", null)
      .order("replied_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from("wa_inbox").select("id", { count: "exact", head: true }).gte("replied_at", hourAgo),
    admin.from("wa_inbox").select("id", { count: "exact", head: true }).gte("replied_at", dayAgo),
  ]);

  const sinceLast = lastSent?.replied_at
    ? nowMs - new Date(lastSent.replied_at).getTime()
    : Number.POSITIVE_INFINITY;

  const releaseClaim = async () => {
    if (!inboxId) return;
    await admin
      .from("wa_inbox")
      .update({ status: "pending", claimed_at: null, updated_at: new Date().toISOString() })
      .eq("id", inboxId);
  };

  if (sinceLast < gapSeconds * 1000) {
    await releaseClaim();
    const wait = Math.ceil((gapSeconds * 1000 - sinceLast) / 1000);
    return NextResponse.json(
      { error: `Terlalu cepat. Tunggu ${wait} detik sebelum kirim pesan berikutnya.`, retry_after: wait },
      { status: 429 },
    );
  }
  if ((hourCount || 0) >= maxPerHour) {
    await releaseClaim();
    return NextResponse.json(
      { error: `Batas ${maxPerHour} pesan/jam tercapai. Pesan dikembalikan ke antrean.`, retry_after: 3600 },
      { status: 429 },
    );
  }
  if ((dayCount || 0) >= maxPerDay) {
    await releaseClaim();
    return NextResponse.json(
      { error: `Batas ${maxPerDay} pesan/24 jam tercapai. Pesan dikembalikan ke antrean.`, retry_after: 3600 },
      { status: 429 },
    );
  }

  const sent = await sendFonnteMessage(customer.token, target, message, {
    url: mediaUrl || undefined,
    filename: mediaFilename || undefined,
  });
  const now = new Date().toISOString();

  if (!sent) {
    if (inboxId) {
      const { data: row } = await admin
        .from("wa_inbox")
        .select("attempts")
        .eq("id", inboxId)
        .maybeSingle();
      const attempts = Number(row?.attempts) || 0;
      await admin
        .from("wa_inbox")
        .update({
          status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          error: "Fonnte menolak pesan",
          updated_at: now,
        })
        .eq("id", inboxId);
    }
    return NextResponse.json({ error: "Fonnte menolak pesan (cek device/token)" }, { status: 502 });
  }

  if (inboxId) {
    await admin
      .from("wa_inbox")
      .update({
        status: "sent",
        reply_text: message,
        replied_at: now,
        error: null,
        updated_at: now,
      })
      .eq("id", inboxId);
  }

  return NextResponse.json({ sent: true, target });
}

export async function PATCH(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");
  const action = String(body?.action ?? "");
  if (!id || (action !== "skip" && action !== "retry")) {
    return NextResponse.json({ error: "id dan action (skip|retry) wajib" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const patch =
    action === "skip"
      ? { status: "skipped", error: body?.note ? String(body.note) : "dilewati", updated_at: now }
      : { status: "pending", claimed_at: null, updated_at: now };

  const { data, error } = await getSupabaseAdmin()
    .from("wa_inbox")
    .update(patch)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
