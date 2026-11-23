import { NextRequest, NextResponse } from "next/server";
import { forbidden, opsIdentity, unauthorized } from "@/lib/ops-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { wibDay } from "@/lib/absensi";
import { coverageCounts, effectiveStartMs, loadEpisodes, loadLeadRows, loadSlaConfig, resolveRange } from "@/lib/performa-data";
import { countBot, countMine, countTeam, countUnassigned } from "@/lib/lead-stats";
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
  const allEpisodes = loaded.episodes;
  // ATURAN BARU berlaku mulai `effectiveFrom`: statistik ADMIN hanya dari chat yang mulai sejak tanggal itu. Statistik
  // BOT tetap memakai seluruh periode (bot sudah berjalan sebelum aturan ini).
  const effectiveMs = effectiveStartMs(cfg);
  const episodes = allEpisodes.filter((e) => e.startAt >= effectiveMs);

  // PIC chat: hanya milik pemanggil yang dibaca (data PIC orang lain tidak dibutuhkan).
  const { data: ownRows } = await db.from("wa_chat_owner").select("sender").eq("owner_user_id", me.userId).limit(5000);
  const mine = new Set((ownRows || []).map((r) => String(r.sender)));
  const picOf = (sender: string) => (mine.has(sender) ? me.userId : null);

  const identity = { email: me.email, name: me.name || me.email.split("@")[0], userId: me.userId };
  const perf = summarizeAdmin(episodes, cfg, identity, picOf);

  // Lead yang dicatat (PIC = pemanggil) dan yang jadi closing. Gagal membaca lead tidak boleh menjatuhkan halaman (leads = null).
  const leadLoad = await loadLeadRows(db, range);
  const leadRows = "rows" in leadLoad ? leadLoad.rows : null;
  const leads = leadRows ? countMine(leadRows, { name: identity.name, email: me.email, role: me.role, isBot: me.isBot }, cfg.effectiveFrom) : null;

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

  // Chat yang sedang menunggu dan PIC-nya pemanggil. Nomor dan nama pelanggan ditampilkan LENGKAP: ini daftar kerja
  // milik admin itu sendiri (bukan data orang lain), dan ia perlu tahu siapa yang harus dibalas.
  const waitingEps = episodes
    .filter((e) => e.responder.kind === "none" && !e.stale && picOf(e.sender) === me.userId)
    .sort((a, b) => b.bizMin - a.bizMin)
    .slice(0, 20);
  const names = new Map<string, string>();
  if (waitingEps.length > 0) {
    const { data: nameRows } = await db
      .from("wa_inbox")
      .select("sender, sender_name")
      .in("sender", waitingEps.map((e) => e.sender))
      .order("created_at", { ascending: false })
      .limit(600);
    for (const r of nameRows || []) {
      const s = String(r.sender);
      const n = String(r.sender_name || "").trim();
      if (n && !names.has(s)) names.set(s, n);
    }
  }
  const waiting = waitingEps
    .map((e) => ({
      sender: e.sender,
      name: names.get(e.sender) || "",
      startAt: new Date(e.startAt).toISOString(),
      waitMin: Math.round(e.bizMin * 10) / 10,
      inHours: e.startedInHours,
      level: !e.startedInHours ? "luar-jam" : e.bizMin > cfg.lateMin ? "late" : e.bizMin > cfg.warningMin ? "warning" : "ok",
    }));

  const comparison = canManage
    ? {
        bot: summarizeBot(allEpisodes),
        team: summarizeTeam(episodes, cfg),
        episodes: allEpisodes.length,
        unanswered: episodes.filter((e) => e.responder.kind === "none" && !e.stale).length,
        counts: coverageCounts(allEpisodes, effectiveMs),
        leads: leadRows ? { bot: countBot(leadRows), team: countTeam(leadRows, cfg.effectiveFrom), unassigned: countUnassigned(leadRows) } : null,
      }
    : null;

  return NextResponse.json(
    {
      range: { from: range.from, to: range.to },
      config: cfg,
      canManage,
      me: { name: identity.name, email: me.email },
      perf,
      leads,
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
