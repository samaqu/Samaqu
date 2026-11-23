import { NextRequest, NextResponse } from "next/server";
import { forbidden, opsIdentity, unauthorized } from "@/lib/ops-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { wibDay } from "@/lib/absensi";
import { coverageCounts, loadEpisodes, loadSlaConfig, resolveRange } from "@/lib/performa-data";
import { summarizeAdmin, summarizeBot, summarizeTeam, validateSlaInput, type Episode } from "@/lib/sla";

/**
 * Performa Admin (kecepatan respons chat WhatsApp + SLA). Rumus ada di `lib/sla.ts` (modul murni yang diuji),
 * pemuatan data di `lib/performa-data.ts` (dipakai juga PDF Bot vs Admin).
 *
 *  GET /api/ops/performa?from=YYYY-MM-DD&to=YYYY-MM-DD   (WIB, default hari ini, maksimal 62 hari)
 *    - SEMUA peran hanya menerima data DIRINYA SENDIRI (ditangani, rata-rata respons, terlambat, SLA, rincian per hari,
 *      chat yang menunggu). Data admin lain tidak pernah dikirim.
 *    - Owner/Leader tambahan: ringkasan GABUNGAN Bot vs Admin (tanpa nama per orang) untuk dibawa ke Ardo.
 *  PUT /api/ops/performa   → simpan pengaturan SLA (hanya Owner/Leader; divalidasi ketat).
 *
 * Hanya MEMBACA wa_inbox / wa_admin_replies / wa_chat_owner; satu-satunya tulisan adalah baris pengaturan wa_sla_config.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store, private" };

const maskSender = (s: string) => `•••• ${String(s).slice(-4)}`;

export async function GET(req: NextRequest) {
  const me = await opsIdentity(req);
  if (!me) return unauthorized();

  const nowMs = Date.now();
  const range = resolveRange(new URL(req.url).searchParams, nowMs);
  const canManage = me.role === "owner" || me.role === "leader";
  const db = getSupabaseAdmin();
  const cfg = await loadSlaConfig(db);

  const loaded = await loadEpisodes(db, range, cfg, nowMs);
  if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: 500, headers: noStore });
  const episodes = loaded.episodes;

  // PIC chat: hanya milik pemanggil yang dibaca (data PIC orang lain tidak dibutuhkan).
  const { data: ownRows } = await db.from("wa_chat_owner").select("sender").eq("owner_user_id", me.userId).limit(5000);
  const mine = new Set((ownRows || []).map((r) => String(r.sender)));
  const picOf = (sender: string) => (mine.has(sender) ? me.userId : null);

  const identity = { email: me.email, name: me.name || me.email.split("@")[0], userId: me.userId };
  const perf = summarizeAdmin(episodes, cfg, identity, picOf);

  // Rincian per hari (hari mulai episode, WIB), terbaru di atas.
  const byDay = new Map<string, Episode[]>();
  for (const e of episodes) {
    const k = wibDay(e.startAt);
    const list = byDay.get(k);
    if (list) list.push(e);
    else byDay.set(k, [e]);
  }
  const daily = [...byDay.entries()]
    .map(([day, list]) => ({ day, perf: summarizeAdmin(list, cfg, identity, picOf) }))
    .filter((d) => d.perf.handled > 0)
    .sort((a, b) => (a.day < b.day ? 1 : -1));

  // Chat yang sedang menunggu dan PIC-nya pemanggil (nomor disamarkan).
  const waiting = episodes
    .filter((e) => e.responder.kind === "none" && !e.stale && picOf(e.sender) === me.userId)
    .sort((a, b) => b.bizMin - a.bizMin)
    .slice(0, 20)
    .map((e) => ({
      chat: maskSender(e.sender),
      startAt: new Date(e.startAt).toISOString(),
      waitMin: Math.round(e.bizMin * 10) / 10,
      inHours: e.startedInHours,
      level: !e.startedInHours ? "luar-jam" : e.bizMin > cfg.lateMin ? "late" : e.bizMin > cfg.warningMin ? "warning" : "ok",
    }));

  const comparison = canManage
    ? {
        bot: summarizeBot(episodes),
        team: summarizeTeam(episodes, cfg),
        episodes: episodes.length,
        unanswered: episodes.filter((e) => e.responder.kind === "none" && !e.stale).length,
        counts: coverageCounts(episodes),
      }
    : null;

  return NextResponse.json(
    {
      range: { from: range.from, to: range.to },
      config: cfg,
      canManage,
      me: { name: identity.name, email: me.email },
      perf,
      daily,
      waiting,
      comparison,
      generatedAt: new Date(nowMs).toISOString(),
    },
    { headers: noStore },
  );
}

export async function PUT(req: NextRequest) {
  const me = await opsIdentity(req);
  if (!me) return unauthorized();
  if (me.role !== "owner" && me.role !== "leader") return forbidden("Hanya Owner dan Leader yang dapat mengubah pengaturan SLA.");

  const body = await req.json().catch(() => null);
  const parsed = validateSlaInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400, headers: noStore });

  const db = getSupabaseAdmin();
  const { error } = await db
    .from("wa_sla_config")
    .update({ ...parsed.value, updated_by: me.userId, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) return NextResponse.json({ error: "Gagal menyimpan pengaturan SLA." }, { status: 500, headers: noStore });

  return NextResponse.json({ ok: true, config: await loadSlaConfig(db) }, { headers: noStore });
}
