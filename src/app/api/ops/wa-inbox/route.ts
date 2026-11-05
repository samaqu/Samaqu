import { NextRequest, NextResponse } from "next/server";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getFonnteConfigs, normalizeWhatsappTarget, sendFonnteMessage } from "@/lib/fonnte";

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

  const claimed: Record<string, unknown>[] = [];
  for (const row of rows || []) {
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

  return NextResponse.json({ items: claimed, claimed: claimed.length });
}

export async function POST(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const body = await req.json().catch(() => null);
  const target = normalizeWhatsappTarget(String(body?.target ?? ""));
  const message = String(body?.message ?? "").trim();
  const inboxId = body?.inbox_id ? String(body.inbox_id) : null;

  if (!target || !message) {
    return NextResponse.json({ error: "target dan message wajib" }, { status: 400 });
  }

  const { customer } = await getFonnteConfigs();
  if (!customer.enabled || !customer.token) {
    return NextResponse.json(
      { error: "Device Fonnte jalur customer belum aktif atau tokennya kosong" },
      { status: 503 },
    );
  }

  const sent = await sendFonnteMessage(customer.token, target, message);
  const admin = getSupabaseAdmin();
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
