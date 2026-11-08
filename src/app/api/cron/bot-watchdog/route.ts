import { NextRequest, NextResponse } from "next/server";
import { getFonnteConfigs, resolveAdminTargets, sendFonnteMessage } from "@/lib/fonnte";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Watchdog bot WhatsApp (dijalankan penjadwal eksternal, tiap 5 menit).
 *
 * Sengaja terpisah dari bot: kalau bot mati, proses yang memantau tetap hidup.
 * Hanya membaca data dan mengirim WA ke admin — tidak menyentuh antrean pesan.
 *
 * Kondisi:
 * - mode local/auto: heartbeat local > 10 menit → bot dianggap mati.
 * - mode server: tidak ada run wa-agent > 10 menit → bot dianggap mati.
 * - >= 3 kegagalan AI/kirim dalam 15 menit → alert error berulang.
 * - begitu hidup lagi → kirim notifikasi pulih sekali.
 *
 * Dedupe & cooldown disimpan di tabel `ops_alert_state` (key: bot_down / bot_errors).
 */

const ACADEMY_URL = (process.env.ACADEMY_SUPABASE_URL || "").replace(/\/+$/, "");
const ACADEMY_KEY = process.env.ACADEMY_SERVICE_ROLE_KEY || "";

const DOWN_MS = 10 * 60 * 1000;
const HEALTHY_MS = 3 * 60 * 1000;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const FAIL_THRESHOLD = 3;
const COOLDOWN_DOWN_MS = 60 * 60 * 1000;
const COOLDOWN_ERROR_MS = 30 * 60 * 1000;

type AlertState = {
  key: string;
  status: string;
  last_sent_at: string | null;
};

async function academy<T>(query: string, init: RequestInit = {}): Promise<T | null> {
  if (!ACADEMY_URL || !ACADEMY_KEY) return null;
  const res = await fetch(`${ACADEMY_URL}/rest/v1/${query}`, {
    ...init,
    headers: {
      apikey: ACADEMY_KEY,
      Authorization: `Bearer ${ACADEMY_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : null;
}

/** Jam kerja bot: 16.30–07.30 WIB, Minggu penuh. */
function withinWorkingHours(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value || "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value || 0);
  if (weekday === "Sun") return true;
  const minutes = hour * 60 + minute;
  return minutes >= 16 * 60 + 30 || minutes <= 7 * 60 + 30;
}

function jakartaClock(iso: string | null): string {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

async function readState(key: string): Promise<AlertState | null> {
  const rows = await academy<AlertState[]>(
    `ops_alert_state?select=key,status,last_sent_at&key=eq.${encodeURIComponent(key)}`,
  );
  return rows?.[0] ?? null;
}

async function writeState(key: string, status: string, detail?: unknown) {
  const body = JSON.stringify({
    key,
    status,
    last_sent_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    detail: detail ?? null,
  });
  await academy(`ops_alert_state?on_conflict=key`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body,
  });
}

function cooldownPassed(state: AlertState | null, cooldownMs: number): boolean {
  if (!state?.last_sent_at) return true;
  return Date.now() - new Date(state.last_sent_at).getTime() > cooldownMs;
}

/** Nomor penerima alert (owner). Selalu dipakai lebih dulu, tidak bergantung data admin lain. */
function alertNumber(): string {
  return (process.env.WA_ALERT_NUMBER || "6285603324143").trim();
}

function maskNumber(value: string): string {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length > 4 ? `***${digits.slice(-4)}` : "***";
}

async function sendAdmin(message: string): Promise<boolean> {
  try {
    const configs = await getFonnteConfigs();
    const target = await resolveAdminTargets(alertNumber() || configs.admin.adminNumber);
    if (!target || !configs.admin.token) return false;
    return await sendFonnteMessage(configs.admin.token, target, message);
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET || "";
  const given = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (secret && given !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const inWindow = withinWorkingHours();
  const notes: string[] = [];

  const control = await academy<{ mode: string; heartbeat: string | null }[]>(
    "wa_bot_control?select=mode,heartbeat&id=eq.1",
  );
  const mode = String(control?.[0]?.mode || "auto");
  const heartbeat = control?.[0]?.heartbeat || null;

  // Mode off = bot sengaja dimatikan (mis. shift admin). Jangan kirim alert "mati".
  if (mode === "off") {
    console.log("[WATCHDOG] mode off — tidak ada alert");
    return NextResponse.json({ ok: true, mode, skipped: "mode off" });
  }

  const runs = await academy<{ created_at: string }[]>(
    "wa_agent_runs?select=created_at&order=created_at.desc&limit=1",
  );
  const lastRun = runs?.[0]?.created_at || null;

  const liveAt = mode === "server" ? lastRun : heartbeat;
  const liveAge = liveAt ? now - new Date(liveAt).getTime() : Number.POSITIVE_INFINITY;
  const down = liveAge > DOWN_MS;
  const healthy = liveAge <= HEALTHY_MS;

  const failSince = new Date(now - FAIL_WINDOW_MS).toISOString();
  const usage = await academy<{ status: string | null }[]>(
    `ai_usage_logs?select=status&created_at=gte.${encodeURIComponent(failSince)}&limit=500`,
  );
  const aiFailures = (usage || []).filter((row) => row.status && row.status !== "success").length;

  let sendFailures = 0;
  try {
    const adminDb = getSupabaseAdmin();
    const { count } = await adminDb
      .from("wa_inbox")
      .select("id", { count: "exact", head: true })
      .gte("created_at", failSince)
      .not("error", "is", null);
    sendFailures = count || 0;
  } catch {
    sendFailures = 0;
  }
  const failures = aiFailures + sendFailures;

  const downState = await readState("bot_down");
  if (down && inWindow && cooldownPassed(downState, COOLDOWN_DOWN_MS)) {
    const sent = await sendAdmin(
      `Alert: bot WhatsApp SAMAQU tidak aktif sejak ${jakartaClock(liveAt)} (mode ${mode}). ` +
        `Cek bot local/server. Pesan customer tetap tersimpan dan akan diproses saat bot hidup.`,
    );
    if (sent) await writeState("bot_down", "alert", { mode, liveAt, liveAge });
    notes.push(sent ? "alert down terkirim" : "alert down GAGAL dikirim");
  } else if (!down && downState?.status === "alert") {
    const sent = await sendAdmin("Bot WhatsApp SAMAQU aktif kembali. Pesan tertunda akan diproses otomatis.");
    if (sent) await writeState("bot_down", "ok", { mode, liveAt });
    notes.push(sent ? "recovery terkirim" : "recovery GAGAL dikirim");
  }

  const errState = await readState("bot_errors");
  if (failures >= FAIL_THRESHOLD && cooldownPassed(errState, COOLDOWN_ERROR_MS)) {
    const sent = await sendAdmin(
      `Alert: bot WhatsApp SAMAQU error berulang — ${failures} kegagalan dalam 15 menit ` +
        `(AI ${aiFailures}, kirim/pesan ${sendFailures}). Cek log wa-agent.`,
    );
    if (sent) await writeState("bot_errors", "alert", { failures, aiFailures, sendFailures });
    notes.push(sent ? "alert error terkirim" : "alert error GAGAL dikirim");
  } else if (failures === 0 && errState?.status === "alert") {
    const sent = await sendAdmin("Bot WhatsApp SAMAQU kembali normal — tidak ada error baru.");
    if (sent) await writeState("bot_errors", "ok", { failures: 0 });
    notes.push(sent ? "recovery error terkirim" : "recovery error GAGAL dikirim");
  }

  console.log(
    `[WATCHDOG] mode=${mode} window=${inWindow ? "on" : "off"} live=${Math.round(liveAge / 1000)}s ` +
      `failures=${failures} (ai=${aiFailures}, inbox=${sendFailures}) ${notes.join(" · ") || "no action"}`,
  );

  return NextResponse.json({
    ok: true,
    mode,
    inWindow,
    liveSeconds: Number.isFinite(liveAge) ? Math.round(liveAge / 1000) : null,
    down,
    healthy,
    failures,
    alertTarget: maskNumber(alertNumber()),
    actions: notes,
  });
}
