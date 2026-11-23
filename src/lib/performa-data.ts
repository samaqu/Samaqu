/**
 * Pemuatan data Performa Admin (SERVER). Dipakai bersama oleh /api/ops/performa (halaman) dan
 * /api/ops/performa/report (PDF Bot vs Admin), supaya angkanya SATU sumber. Hanya MEMBACA.
 * Rumusnya ada di lib/sla.ts (modul murni).
 */

import type { getSupabaseAdmin } from "@/lib/supabase-admin";
import { wibDay, wibDayStart } from "@/lib/absensi";
import { buildEpisodes, parseSlaConfig, type AdminReplyRow, type Episode, type InboundRow, type SlaConfig } from "@/lib/sla";

type Db = ReturnType<typeof getSupabaseAdmin>;

export const DAY_MS = 86_400_000;
const PAGE = 1000;
const MAX_PAGES = 40;
export const MAX_RANGE_DAYS = 62;

const isDay = (v: string | null): v is string => !!v && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v);

export interface PerformaRange {
  from: string;
  to: string;
  startMs: number;
  endMs: number;
}

/** Rentang tanggal WIB dari query (default hari ini, urutan dibetulkan, maksimal 62 hari). */
export function resolveRange(sp: URLSearchParams, nowMs: number): PerformaRange {
  const today = wibDay(nowMs);
  let from = isDay(sp.get("from")) ? (sp.get("from") as string) : today;
  let to = isDay(sp.get("to")) ? (sp.get("to") as string) : from;
  if (to < from) [from, to] = [to, from];
  const startMs = wibDayStart(from);
  let endMs = wibDayStart(to) + DAY_MS;
  if ((endMs - startMs) / DAY_MS > MAX_RANGE_DAYS) endMs = startMs + MAX_RANGE_DAYS * DAY_MS;
  return { from, to: wibDay(endMs - 1), startMs, endMs };
}

export async function loadSlaConfig(db: Db): Promise<SlaConfig> {
  const { data } = await db.from("wa_sla_config").select("*").eq("id", 1).maybeSingle();
  return parseSlaConfig(data);
}

/** Episode chat yang MULAI di dalam rentang. Mengembalikan `error` bila database gagal dibaca. */
export async function loadEpisodes(db: Db, range: PerformaRange, cfg: SlaConfig, nowMs: number): Promise<{ episodes: Episode[] } | { error: string }> {
  const inbound: InboundRow[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await db
      .from("wa_inbox")
      .select("sender, created_at, status, error, replied_at, updated_at")
      .eq("is_group", false)
      .gte("created_at", new Date(range.startMs).toISOString())
      .lt("created_at", new Date(range.endMs).toISOString())
      .order("created_at", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) return { error: error.message };
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
      .gte("sent_at", new Date(range.startMs).toISOString())
      .order("sent_at", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) return { error: error.message };
    for (const r of data || []) replies.push({ sender: String(r.sender), adminEmail: String(r.admin_email || ""), sentAt: Date.parse(String(r.sent_at)) });
    if (!data || data.length < PAGE) break;
  }

  return { episodes: buildEpisodes(inbound, replies, cfg, nowMs).filter((e) => e.startAt >= range.startMs && e.startAt < range.endMs) };
}

/** Awal hari (WIB) tanggal mulai berlaku: chat yang mulai sebelum ini tidak dihitung dalam performa admin. */
export function effectiveStartMs(cfg: SlaConfig): number {
  return wibDayStart(cfg.effectiveFrom);
}

/**
 * Cakupan: siapa yang menjawab episode di rentang ini. Episode yang belum terjawab dan mulai SEBELUM `effectiveMs`
 * dihitung "tidak tertutup" (bukan "belum terjawab"), karena aturan baru belum berlaku saat itu.
 */
export function coverageCounts(episodes: Episode[], effectiveMs = 0) {
  const c = { total: episodes.length, bot: 0, panel: 0, phone: 0, unanswered: 0, expired: 0 };
  for (const e of episodes) {
    if (e.responder.kind === "bot") c.bot++;
    else if (e.responder.kind === "admin") c.panel++;
    else if (e.responder.kind === "phone") c.phone++;
    else if (e.stale || e.startAt < effectiveMs) c.expired++;
    else c.unanswered++;
  }
  return c;
}
