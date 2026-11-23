import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, unauthorized, opsActorEmail, opsIdentity } from "@/lib/ops-auth";
import { canModifyLead } from "@/lib/lead-guard";
import { OUTCOMES, jakartaDayBounds, isActiveTask } from "@/lib/ops-followup";

/**
 * Follow-up Center — API.
 *
 * GET  ?view=today|overdue|history  → daftar tugas + ringkasan + opsi filter
 * POST { action, leadId, ... }      → catat aktivitas follow-up
 *
 * Semua validasi & aturan status dikerjakan di server (bukan hanya di UI).
 */

const OUTCOME_CODES = OUTCOMES.map((o) => o.code) as readonly string[];

function validDateOrNull(v: unknown): string | null {
  if (!v || typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const sp = new URL(req.url).searchParams;
  const view = (sp.get("view") || "today").toLowerCase();
  const search = (sp.get("search") || "").trim();
  const pic = sp.get("pic") || "";
  const sumber = sp.get("sumber") || "";
  const limit = Math.min(Math.max(parseInt(sp.get("limit") || "200", 10) || 200, 1), 500);

  const admin = getSupabaseAdmin();
  const { startIso, endIso } = jakartaDayBounds();

  // ── Ringkasan tugas (dihitung dari database, bukan angka statis) ──
  //   noReply     : lead aktif yang belum membalas (status, boleh punya jadwal)
  //   unscheduled : lead aktif yang belum punya jadwal → antrean "Perlu Dijadwalkan"
  //   today/overdue: tugas terjadwal yang jatuh tempo hari ini / sudah lewat (batas hari WIB)
  const nonTerminalOutcome = "outcome.is.null,outcome.eq.no_reply,outcome.eq.replied,outcome.eq.interested";
  const [overdueQ, todayQ, noReplyQ, unscheduledQ] = await Promise.all([
    admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("followup_status", "dijadwalkan")
      .eq("do_not_contact", false)
      .not("next_followup_at", "is", null)
      .lt("next_followup_at", startIso),
    admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("followup_status", "dijadwalkan")
      .eq("do_not_contact", false)
      .gte("next_followup_at", startIso)
      .lt("next_followup_at", endIso),
    admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("do_not_contact", false)
      .in("followup_status", ["baru", "dijadwalkan"])
      .or("outcome.is.null,outcome.eq.no_reply"),
    admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("do_not_contact", false)
      .in("followup_status", ["baru", "dijadwalkan"])
      .is("next_followup_at", null)
      .or(nonTerminalOutcome),
  ]);

  const stats = {
    overdue: overdueQ.count || 0,
    today: todayQ.count || 0,
    noReply: noReplyQ.count || 0,
    unscheduled: unscheduledQ.count || 0,
  };

  // ── Opsi filter (PIC & sumber) dari data yang ada ──
  const { data: optRows } = await admin.from("leads").select("pic, sumber").limit(2000);
  const pics = Array.from(new Set((optRows || []).map((r) => r.pic).filter(Boolean))) as string[];
  const sumbers = Array.from(new Set((optRows || []).map((r) => r.sumber).filter(Boolean))) as string[];

  // ── Riwayat satu lead (dipakai drawer Catat Hasil) ──
  if (view === "lead") {
    const leadId = sp.get("leadId") || "";
    if (!leadId) return NextResponse.json({ error: "leadId wajib" }, { status: 400 });
    const { data, error } = await admin
      .from("lead_activities")
      .select("id, action, outcome, note, actor, prev_schedule, next_schedule, created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      view,
      items: (data || []).map((a: any) => ({
        id: a.id,
        action: a.action,
        outcome: a.outcome,
        note: a.note,
        actor: a.actor,
        prevSchedule: a.prev_schedule,
        nextSchedule: a.next_schedule,
        createdAt: a.created_at,
      })),
      stats,
      options: { pics, sumbers },
    });
  }

  // ── Riwayat aktivitas ──
  if (view === "history") {
    const { data, error } = await admin
      .from("lead_activities")
      .select(
        "id, lead_id, actor, action, outcome, note, prev_schedule, next_schedule, created_at, leads(id, kontak, produk, sumber, pic, nominal)",
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    let items = (data || []).map((a: any) => ({
      id: a.id,
      leadId: a.lead_id,
      actor: a.actor,
      action: a.action,
      outcome: a.outcome,
      note: a.note,
      prevSchedule: a.prev_schedule,
      nextSchedule: a.next_schedule,
      createdAt: a.created_at,
      kontak: a.leads?.kontak || "",
      produk: a.leads?.produk || null,
      sumber: a.leads?.sumber || null,
      pic: a.leads?.pic || null,
    }));

    if (search) {
      const q = search.toLowerCase();
      items = items.filter((i) => (i.kontak || "").toLowerCase().includes(q));
    }
    if (pic) items = items.filter((i) => i.pic === pic);
    if (sumber) items = items.filter((i) => i.sumber === sumber);

    return NextResponse.json({ view, items, stats, options: { pics, sumbers } });
  }

  // ── Belum punya jadwal (antrean utama supaya lead tidak "menggantung") ──
  if (view === "unscheduled") {
    let q = admin
      .from("leads")
      .select("*")
      .eq("do_not_contact", false)
      .in("followup_status", ["baru", "dijadwalkan"])
      .is("next_followup_at", null)
      .or(nonTerminalOutcome)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (search) q = q.ilike("kontak", `%${search}%`);
    if (pic) q = q.eq("pic", pic);
    if (sumber) q = q.eq("sumber", sumber);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      view,
      items: (data || []).map((l) => ({
        id: l.id,
        kontak: l.kontak,
        produk: l.produk,
        sumber: l.sumber,
        pic: l.pic,
        status: l.status,
        followupStatus: l.followup_status,
        outcome: l.outcome,
        note: l.note_followup,
        nominal: l.nominal,
        lastContactAt: l.last_contact_at,
        nextFollowupAt: l.next_followup_at,
        catatan: l.catatan,
        tanggal: l.tanggal,
      })),
      stats,
      options: { pics, sumbers },
    });
  }

  // ── Tugas aktif (hari ini / terlambat) ──
  let query = admin
    .from("leads")
    .select("*")
    .eq("followup_status", "dijadwalkan")
    .eq("do_not_contact", false)
    .not("next_followup_at", "is", null)
    .order("next_followup_at", { ascending: true })
    .limit(limit);

  query = view === "overdue"
    ? query.lt("next_followup_at", startIso)
    : query.gte("next_followup_at", startIso).lt("next_followup_at", endIso);

  if (search) query = query.ilike("kontak", `%${search}%`);
  if (pic) query = query.eq("pic", pic);
  if (sumber) query = query.eq("sumber", sumber);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items = (data || []).filter((l) => isActiveTask(l)).map((l) => ({
    id: l.id,
    kontak: l.kontak,
    produk: l.produk,
    sumber: l.sumber,
    pic: l.pic,
    status: l.status,
    followupStatus: l.followup_status,
    outcome: l.outcome,
    note: l.note_followup,
    nominal: l.nominal,
    lastContactAt: l.last_contact_at,
    nextFollowupAt: l.next_followup_at,
    catatan: l.catatan,
    tanggal: l.tanggal,
  }));

  return NextResponse.json({ view, items, stats, options: { pics, sumbers } });
}

export async function POST(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const admin = getSupabaseAdmin();
  const actor = await opsActorEmail(req);

  try {
    const body = await req.json();
    const action = String(body?.action || "");
    const leadId = String(body?.leadId || "");
    const requestId = body?.requestId ? String(body.requestId) : null;
    if (!leadId) return NextResponse.json({ error: "leadId wajib" }, { status: 400 });

    const { data: lead } = await admin.from("leads").select("*").eq("id", leadId).maybeSingle();
    if (!lead) return NextResponse.json({ error: "Lead tidak ditemukan" }, { status: 404 });

    const nowIso = new Date().toISOString();
    const prevSchedule = lead.next_followup_at || null;

    // ── Buka WhatsApp: catat percobaan kontak (bukan klaim pesan terkirim) ──
    if (action === "open_wa") {
      await admin.from("leads").update({ last_contact_at: nowIso }).eq("id", leadId);
      const { error } = await admin.from("lead_activities").insert({
        lead_id: leadId,
        actor,
        action: "open_wa",
        note: "Membuka WhatsApp untuk follow-up",
        source: "office",
        request_id: requestId,
      });
      if (error && error.code !== "23505") return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, duplicate: error?.code === "23505" });
    }

    // ── Jadwalkan ulang ──
    if (action === "schedule") {
      const next = validDateOrNull(body.nextSchedule);
      if (!next) return NextResponse.json({ error: "Jadwal tidak valid" }, { status: 400 });
      const { error } = await admin
        .from("leads")
        .update({ next_followup_at: next, followup_status: "dijadwalkan" })
        .eq("id", leadId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await admin.from("lead_activities").insert({
        lead_id: leadId,
        actor,
        action: "schedule",
        prev_schedule: prevSchedule,
        next_schedule: next,
        source: "office",
        request_id: requestId,
      });
      return NextResponse.json({ ok: true, nextSchedule: next });
    }

    // ── Set PIC ──
    if (action === "set_pic") {
      // Memindahkan PIC mengubah kepemilikan lead, jadi aturannya sama dengan ubah lead: hanya pemilik, Owner, dan Leader.
      const me = await opsIdentity(req);
      if (!me) return unauthorized();
      const access = canModifyLead({ name: me.name, email: me.email, role: me.role, isBot: me.isBot }, lead.pic);
      if (!access.ok) return NextResponse.json({ error: access.message, code: "lead_read_only" }, { status: 403 });
      const pic = body.pic ? String(body.pic).trim() : null;
      const { error } = await admin.from("leads").update({ pic }).eq("id", leadId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await admin.from("lead_activities").insert({
        lead_id: leadId,
        actor,
        action: "set_pic",
        note: pic ? `PIC: ${pic}` : "PIC dikosongkan",
        source: "office",
        request_id: requestId,
      });
      return NextResponse.json({ ok: true, pic });
    }

    // ── Catat hasil follow-up ──
    if (action === "record") {
      const outcome = String(body?.outcome || "");
      if (!OUTCOME_CODES.includes(outcome)) {
        return NextResponse.json({ error: "Hasil follow-up tidak valid" }, { status: 400 });
      }
      const note = body?.note ? String(body.note).trim() : null;
      const nextSchedule = validDateOrNull(body?.nextSchedule);
      const lostReason = body?.lostReason ? String(body.lostReason).trim() : null;

      const patch: Record<string, unknown> = {
        outcome,
        note_followup: note,
        last_contact_at: nowIso,
      };

      if (outcome === "no_reply" || outcome === "replied" || outcome === "interested") {
        patch.followup_status = nextSchedule ? "dijadwalkan" : "baru";
        patch.next_followup_at = nextSchedule;
      } else if (outcome === "buy") {
        // Lead yang sudah membeli tidak boleh jadi tugas aktif lagi (brief: hindari tugas palsu).
        patch.followup_status = "selesai";
        patch.next_followup_at = null;
      } else if (outcome === "not_interested") {
        if (!lostReason) return NextResponse.json({ error: "Alasan tidak berminat wajib diisi" }, { status: 400 });
        patch.followup_status = "lost";
        patch.lost_reason = lostReason;
        patch.next_followup_at = null;
      } else if (outcome === "stop") {
        patch.followup_status = "dnd";
        patch.do_not_contact = true;
        patch.next_followup_at = null;
      }

      const { error: upErr } = await admin.from("leads").update(patch).eq("id", leadId);
      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

      const { error: actErr } = await admin.from("lead_activities").insert({
        lead_id: leadId,
        actor,
        action: "result",
        outcome,
        note,
        prev_schedule: prevSchedule,
        next_schedule: (patch.next_followup_at as string) ?? null,
        source: "office",
        request_id: requestId,
      });

      // Anti duplikat: kalau requestId sudah pernah tersimpan, jangan gagal — cukup tandai
      if (actErr && actErr.code !== "23505") {
        return NextResponse.json({ error: actErr.message }, { status: 500 });
      }
      if (outcome === "stop") {
        // pastikan tidak ada tugas aktif tersisa untuk lead ini
        await admin.from("leads").update({ next_followup_at: null }).eq("id", leadId);
      }

      return NextResponse.json({ ok: true, duplicate: actErr?.code === "23505", lead: { ...lead, ...patch } });
    }

    return NextResponse.json({ error: "Aksi tidak dikenal" }, { status: 400 });
  } catch (e) {
    console.error("[OPS] followups POST:", e);
    return NextResponse.json({ error: "Gagal menyimpan hasil follow-up" }, { status: 500 });
  }
}
