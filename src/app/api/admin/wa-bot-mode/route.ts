import { NextRequest, NextResponse } from "next/server";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";

export const dynamic = "force-dynamic";

/**
 * Mode bot WhatsApp: "server" (MiMo di cloud) atau "local" (Claude di laptop).
 *
 * - auto   : server minggir selama heartbeat lokal masih segar (< 3 menit).
 * - local  : paksa lokal; server tidak membalas.
 * - server : paksa server; lokal berhenti.
 * - off    : kill switch; local & server sama-sama tidak membalas (pesan tetap masuk).
 *
 * Datanya di tabel Academy `wa_bot_control` (satu baris, id = 1).
 */

const MODES = ["auto", "local", "server", "off"] as const;

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
  return NextResponse.json(
    {
      mode: row?.mode || "auto",
      heartbeat: row?.heartbeat || null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const cfg = academy();
  if (!cfg) return NextResponse.json({ error: "Academy belum dikonfigurasi." }, { status: 503 });

  const body = await req.json().catch(() => null);
  const mode = String(body?.mode || "");
  if (!MODES.includes(mode as (typeof MODES)[number])) {
    return NextResponse.json({ error: "mode harus auto, local, server, atau off." }, { status: 400 });
  }

  // Baca mode sebelumnya untuk catatan log pergantian.
  let previous = "";
  try {
    const current = await fetch(`${cfg.base}/rest/v1/wa_bot_control?select=mode&id=eq.1`, {
      headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` },
      cache: "no-store",
    });
    const rows = (await current.json().catch(() => [])) as { mode?: string }[];
    previous = String(rows?.[0]?.mode || "");
  } catch {
    previous = "";
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

  // Catat pergantian mode ke log bot (`wa_agent_runs`), supaya terlihat di tab Log Bot.
  if (previous !== mode) {
    try {
      await fetch(`${cfg.base}/rest/v1/wa_agent_runs`, {
        method: "POST",
        headers: {
          apikey: cfg.key,
          Authorization: `Bearer ${cfg.key}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          mode: "switch",
          note: `mode: ${previous || "?"} → ${mode}`,
          handled: 0,
          replied: 0,
          held: 0,
          leftover: 0,
          rounds: 0,
          duration_ms: 0,
        }),
      });
    } catch {
      // log gagal tidak boleh membatalkan pergantian mode
    }
  }

  return NextResponse.json({ ok: true, mode: row?.mode || mode, heartbeat: row?.heartbeat || null });
}
