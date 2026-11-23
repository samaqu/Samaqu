import { NextRequest, NextResponse } from "next/server";
import { forbidden, opsIdentity, unauthorized } from "@/lib/ops-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { wibDay, wibDayStart } from "@/lib/absensi";
import {
  buildEpisodes,
  parseSlaConfig,
  summarizeAdmin,
  summarizeBot,
  summarizeTeam,
  validateSlaInput,
  type AdminReplyRow,
  type Episode,
  type InboundRow,
} from "@/lib/sla";

/**
 * Performa Admin (kecepatan respons chat WhatsApp + SLA). Rumus ada di `lib/sla.ts` (modul murni yang diuji).
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
const DAY_MS = 86_400_000;
const PAGE = 1000;
const MAX_PAGES = 40;
const MAX_RANGE_DAYS = 62;

const isDay = (v: string | null): v is string => !!v && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v);

async function loadConfig(db: ReturnType<typeof getSupabaseAdmin>) {
  const { data } = await db.from("wa_sla_config").select("*").eq("id", 1).maybeSingle();
  return parseSlaConfig(data);
}

const maskSender = (s: string) => `•••• ${String(s).slice(-4)}`;

export async function GET(req: NextRequest) {
  const me = await opsIdentity(req);
  if (!me) return unauthorized();

  const sp = new URL(req.url).searchParams;
  const nowMs = Date.now();
  const today = wibDay(nowMs);
  let from = isDay(sp.get("from")) ? (sp.get("from") as string) : today;
  let to = isDay(sp.get("to")) ? (sp.get("to") as string) : from;
  if (to < from) [from, to] = [to, from];
  const startMs = wibDayStart(from);
  let endMs = wibDayStart(to) + DAY_MS;
  if ((endMs - startMs) / DAY_MS > MAX_RANGE_DAYS) endMs = startMs + MAX_RANGE_DAYS * DAY_MS;
  to = wibDay(endMs - 1);

  const canManage = me.role === "owner" || me.role === "leader";
  const db = getSupabaseAdmin();
  const cfg = await loadConfig(db);

  // Pesan masuk pada rentang (bukan grup). Balasan bot dan penandaan HP ada di baris yang sama.
  const inbound: InboundRow[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await db
      .from("wa_inbox")
      .select("sender, created_at, status, error, replied_at, updated_at")
      .eq("is_group", false)
      .gte("created_at", new Date(startMs).toISOString())
      .lt("created_at", new Date(endMs).toISOString())
      .order("created_at", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noStore });
    for (const r of data || []) {
      inbound.push({
        sender: String(r.sender),
        createdAt: Date.parse(String(r.created_at)),
        status: String(r.status || ""),
        error: r.error ? String(r.error) : null,
        repliedAt: r.replied_at ? Date.parse(String(r.replied_at)) : null,
        updatedAt: r.updated_at ? Date.parse(String(r.updated_at)) : null,
      });
    }
    if (!data || data.length < PAGE) break;
  }

  // Balasan admin sejak awal rentang (tanpa batas atas: episode di dalam rentang bisa dijawab setelahnya).
  const replies: AdminReplyRow[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await db
      .from("wa_admin_replies")
      .select("sender, admin_email, sent_at")
      .gte("sent_at", new Date(startMs).toISOString())
      .order("sent_at", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noStore });
    for (const r of data || []) replies.push({ sender: String(r.sender), adminEmail: String(r.admin_email || ""), sentAt: Date.parse(String(r.sent_at)) });
    if (!data || data.length < PAGE) break;
  }

  // Hanya episode yang MULAI di dalam rentang.
  const episodes: Episode[] = buildEpisodes(inbound, replies, cfg, nowMs).filter((e) => e.startAt >= startMs && e.startAt < endMs);

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
      }
    : null;

  return NextResponse.json(
    {
      range: { from, to },
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

  return NextResponse.json({ ok: true, config: await loadConfig(db) }, { headers: noStore });
}
