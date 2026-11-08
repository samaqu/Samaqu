import { NextRequest, NextResponse } from "next/server";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";

/**
 * Mode bot WhatsApp: "server" (MiMo di cloud) atau "local" (Claude di laptop).
 *
 * - auto   : server minggir selama heartbeat lokal masih segar (< 3 menit).
 * - local  : paksa lokal; server tidak membalas.
 * - server : paksa server; lokal berhenti.
 *
 * Datanya di tabel Academy `wa_bot_control` (satu baris, id = 1).
 */

const MODES = ["auto", "local", "server"] as const;

function academy() {
  const base = (process.env.ACADEMY_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.ACADEMY_SERVICE_ROLE_KEY || "";
  if (!base || !key) return null;
  return { base, key };
}

export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const cfg = academy();
  if (!cfg) return NextResponse.json({ error: "Academy belum dikonfigurasi." }, { status: 503 });

  const res = await fetch(
    `${cfg.base}/rest/v1/wa_bot_control?select=mode,heartbeat,updated_at&id=eq.1`,
    {
      headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` },
      cache: "no-store",
    },
  );
  if (!res.ok) {
    return NextResponse.json({ error: `Gagal membaca mode bot (${res.status}).` }, { status: 500 });
  }
  const rows = (await res.json().catch(() => [])) as { mode?: string; heartbeat?: string | null }[];
  const row = Array.isArray(rows) ? rows[0] : null;
  return NextResponse.json({
    mode: row?.mode || "auto",
    heartbeat: row?.heartbeat || null,
  });
}

export async function POST(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const cfg = academy();
  if (!cfg) return NextResponse.json({ error: "Academy belum dikonfigurasi." }, { status: 503 });

  const body = await req.json().catch(() => null);
  const mode = String(body?.mode || "");
  if (!MODES.includes(mode as (typeof MODES)[number])) {
    return NextResponse.json({ error: "mode harus auto, local, atau server." }, { status: 400 });
  }

  const res = await fetch(`${cfg.base}/rest/v1/wa_bot_control?id=eq.1`, {
    method: "PATCH",
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ mode, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) {
    return NextResponse.json({ error: `Gagal menyimpan mode bot (${res.status}).` }, { status: 500 });
  }
  const rows = (await res.json().catch(() => [])) as { mode?: string; heartbeat?: string | null }[];
  const row = Array.isArray(rows) ? rows[0] : null;
  return NextResponse.json({ ok: true, mode: row?.mode || mode, heartbeat: row?.heartbeat || null });
}
