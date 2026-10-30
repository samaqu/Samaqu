import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { defaultFirstFollowup, normalizeKontak, formatTanggalId } from "@/lib/ops-followup";
import { isOpsAdmin } from "@/lib/ops-auth";

/**
 * API dashboard internal (/ops) — modul Leads.
 *
 * Semua akses lewat route ini (bukan langsung dari browser ke tabel), karena tabel
 * `leads` sengaja tanpa policy RLS: hanya admin (session Supabase + terdaftar di
 * tabel `admins`) yang boleh baca/tulis.
 */

const LEAD_FIELDS = [
  "tanggal",
  "jam",
  "kontak",
  "sumber",
  "status",
  "nominal",
  "catatan",
  "produk",
  "pic",
  "next_followup_at",
] as const;

// Verifikasi admin dipusatkan di lib/ops-auth dan hasilnya di-cache 5 menit,
// jadi tiap request tidak perlu 2 round-trip tambahan ke Supabase.
const isAdmin = isOpsAdmin;

function pickLead(input: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const f of LEAD_FIELDS) {
    if (input?.[f] !== undefined) out[f] = input[f];
  }
  // Terima juga bentuk camelCase dari form (Base44 memakai snake_case di DB).
  if (input?.nextFollowupAt !== undefined) out.next_followup_at = input.nextFollowupAt;
  if (out.nominal !== undefined) out.nominal = Number(out.nominal) || 0;
  if (out.status === "belum_closing") out.nominal = 0;
  if (out.produk !== undefined) out.produk = out.produk ? String(out.produk).trim() : null;
  if (out.pic !== undefined) out.pic = out.pic ? String(out.pic).trim() : null;
  return out;
}

const unauthorized = () => NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

export async function GET(req: NextRequest) {
  if (!(await isAdmin(req))) return unauthorized();

  const sp = new URL(req.url).searchParams;
  const start = sp.get("start");
  const end = sp.get("end");
  const search = sp.get("search");
  const limit = Math.min(Math.max(parseInt(sp.get("limit") || "1000", 10) || 1000, 1), 2000);
  const offset = Math.max(parseInt(sp.get("offset") || "0", 10) || 0, 0);
  // Probe login shell cukup butuh status 200; dua query opsi PIC di bawah tidak perlu ikut.
  const includeOptions = sp.get("options") !== "0";

  const admin = getSupabaseAdmin();
  let query = admin
    .from("leads")
    .select("*", { count: "exact" })
    .order("tanggal", { ascending: true })
    .order("jam", { ascending: true })
    .range(offset, offset + limit - 1);

  if (start) query = query.gte("tanggal", start);
  if (end) query = query.lte("tanggal", end);
  if (search) query = query.ilike("kontak", `%${search}%`);

  const { data, error, count } = await query;
  if (error) {
    console.error("[OPS] leads GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const total = count ?? data?.length ?? 0;
  const next_cursor = offset + limit < total ? String(offset + limit) : null;

  // Pilihan PIC untuk form: gabungan PIC yang sudah dipakai + akun admin SAMAQU.
  let pics: string[] = [];
  if (includeOptions) {
    const [{ data: picRows }, { data: adminRows }] = await Promise.all([
      admin.from("leads").select("pic").not("pic", "is", null).limit(2000),
      admin.from("admins").select("email").limit(50),
    ]);
    pics = Array.from(
      new Set([
        ...((picRows as any[]) || []).map((r) => r.pic).filter(Boolean),
        ...((adminRows as any[]) || []).map((r) => r.email).filter(Boolean),
      ]),
    ).sort();
  }

  return NextResponse.json({ items: data || [], next_cursor, count: total, options: { pics } });
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin(req))) return unauthorized();

  try {
    const body = await req.json();
    const raw = Array.isArray(body?.rows) ? body.rows : body ? [body] : [];
    const rows = raw.map((r: Record<string, unknown>) => pickLead(r)).filter((r: Record<string, unknown>) => r.tanggal && r.kontak);
    if (rows.length === 0) return NextResponse.json({ error: "Tidak ada baris valid" }, { status: 400 });

    // Setiap lead baru langsung punya jadwal follow-up sendiri (SOP: besok 10.00 WIB),
    // jadi tidak menumpuk di antrean "Perlu Dijadwalkan" tanpa tindak lanjut.
    const fallbackSchedule = defaultFirstFollowup();
    const prepared = rows.map((r: Record<string, unknown>) => ({
      ...r,
      followup_status: "dijadwalkan",
      next_followup_at: (r.next_followup_at as string) || fallbackSchedule,
      do_not_contact: false,
    }));

    const admin = getSupabaseAdmin();

    // Anti-duplikat form manual: satu nomor hanya boleh jadi lead SEKALI (tanggal diabaikan —
    // nomor sama = orang yang sama). Kontak dinormalisasi supaya 08xx = 628xx = 8xx.
    if (body?.blockDuplicates) {
      const incoming = new Set(
        prepared.map((r: Record<string, unknown>) => normalizeKontak(r.kontak as string)).filter(Boolean),
      );
      let clash: any = null;
      const PAGE = 1000;
      for (let from = 0; !clash; from += PAGE) {
        const { data } = await admin.from("leads").select("kontak, tanggal, sumber").range(from, from + PAGE - 1);
        const rows = (data || []) as any[];
        clash = rows.find((e) => { const n = normalizeKontak(e.kontak); return n && incoming.has(n); }) || null;
        if (rows.length < PAGE) break;
      }
      if (clash) {
        return NextResponse.json(
          {
            error: `Nomor ${clash.kontak} sudah terdaftar sebagai lead (tanggal ${formatTanggalId(clash.tanggal)}${clash.sumber ? `, sumber ${clash.sumber}` : ""}).`,
            existing: clash,
          },
          { status: 409 },
        );
      }
    }

    const { data, error } = await admin.from("leads").insert(prepared).select();
    if (error) {
      console.error("[OPS] leads POST error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Catat di timeline follow-up supaya terlihat kapan lead masuk & kapan jadwalnya.
    if (data && data.length > 0) {
      const activities = data.map((l: any) => ({
        lead_id: l.id,
        actor: "system",
        action: "created",
        note: `Lead baru dari ${l.sumber || "-"}`,
        next_schedule: l.next_followup_at || null,
        source: "office",
      }));
      const { error: actErr } = await admin.from("lead_activities").insert(activities);
      if (actErr) console.error("[OPS] leads POST activity:", actErr.message);
    }

    return NextResponse.json({ items: data || [], inserted: data?.length || 0 });
  } catch (e) {
    console.error("[OPS] leads POST exception:", e);
    return NextResponse.json({ error: "Gagal menyimpan lead" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await isAdmin(req))) return unauthorized();

  try {
    const body = await req.json();
    const { id, ...patch } = body || {};
    if (!id) return NextResponse.json({ error: "id wajib" }, { status: 400 });

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("leads")
      .update({ ...pickLead(patch), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) {
      console.error("[OPS] leads PATCH error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ item: data });
  } catch (e) {
    console.error("[OPS] leads PATCH exception:", e);
    return NextResponse.json({ error: "Gagal mengubah lead" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdmin(req))) return unauthorized();

  try {
    const body = await req.json().catch(() => null);
    const id = body?.id || new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id wajib" }, { status: 400 });

    const admin = getSupabaseAdmin();
    const { error, count } = await admin.from("leads").delete({ count: "exact" }).eq("id", id);
    if (error) {
      console.error("[OPS] leads DELETE error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ deleted: count ?? 0 });
  } catch (e) {
    console.error("[OPS] leads DELETE exception:", e);
    return NextResponse.json({ error: "Gagal menghapus lead" }, { status: 500 });
  }
}
