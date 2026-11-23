import { NextRequest, NextResponse } from "next/server";
import { evictAdminCache, forbidden, normalizeOpsRole, opsIdentity, unauthorized, type OpsRole } from "@/lib/ops-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

/**
 * Tim Admin (panel admin).
 *
 *  GET                         → daftar tim (SEMUA admin boleh melihat): nama, label jabatan, peran, aktif, status undangan
 *  POST {name,email,title,role}→ undang admin baru lewat email (orangnya membuat password sendiri)
 *  POST {action:"link",id}     → tautan atur-password baru (mis. email undangan tidak sampai)
 *  PATCH {id,title?,name?,role?,active?} → ubah label / nama / peran / aktif
 *
 * Aturan izin (dijaga di SERVER, bukan hanya disembunyikan di tampilan):
 *  - owner  : boleh mengelola semua, peran apa pun.
 *  - leader : boleh mengelola admin biasa (admin, admin_operasional) saja; tidak bisa membuat/mengubah owner & leader.
 *  - lainnya: hanya boleh melihat daftar.
 *  - tidak boleh menonaktifkan diri sendiri.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ROLE_VALUES = ["owner", "leader", "admin", "admin_operasional"] as const;
type RoleValue = (typeof ROLE_VALUES)[number];
const BASIC: RoleValue[] = ["admin", "admin_operasional"];

const asRole = (v: unknown): RoleValue | null => {
  const r = String(v ?? "").trim().toLowerCase();
  return (ROLE_VALUES as readonly string[]).includes(r) ? (r as RoleValue) : null;
};

/** Peran apa yang boleh diberikan `actor`? */
const grantable = (actor: OpsRole): RoleValue[] => (actor === "owner" ? [...ROLE_VALUES] : actor === "leader" ? BASIC : []);
/** Baris dengan peran `target` boleh dikelola `actor`? */
const manageable = (actor: OpsRole, target: OpsRole) =>
  actor === "owner" || (actor === "leader" && target !== "owner" && target !== "leader");

const noStore = { "Cache-Control": "no-store, private" };
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: noStore });

export async function GET(req: NextRequest) {
  const me = await opsIdentity(req);
  if (!me) return unauthorized();

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("admins")
    .select("id, user_id, email, role, display_name, title, active, status, status_at, created_at")
    .order("created_at", { ascending: true });
  if (error) return fail(error.message, 500);

  const rows = await Promise.all(
    (data || []).map(async (row) => {
      let confirmed = true;
      let lastSignIn: string | null = null;
      try {
        const { data: u } = await admin.auth.admin.getUserById(String(row.user_id));
        confirmed = Boolean(u?.user?.email_confirmed_at || u?.user?.last_sign_in_at);
        lastSignIn = u?.user?.last_sign_in_at || null;
      } catch {
        // gagal membaca status login: daftar tetap tampil
      }
      const role = normalizeOpsRole(row.role);
      return {
        id: row.id,
        email: row.email,
        name: String(row.display_name || "").trim() || String(row.email || "").split("@")[0],
        title: String(row.title || "").trim(),
        role,
        active: row.active !== false,
        /** Kunci kehadiran (Realtime Presence) = user id; tidak dipakai untuk keputusan keamanan. */
        userId: String(row.user_id),
        status: row.status === "aktif" || row.status === "istirahat" ? row.status : "pulang",
        statusAt: row.status_at || null,
        invited: !confirmed,
        lastSignIn,
        isMe: row.user_id === me.userId,
        canManage: manageable(me.role, role) && row.user_id !== me.userId,
      };
    }),
  );

  return NextResponse.json(
    { items: rows, me: { role: me.role, canInvite: grantable(me.role).length > 0, grantable: grantable(me.role) } },
    { headers: noStore },
  );
}

function redirectUrl(req: NextRequest): string {
  return `${new URL(req.url).origin}/panel-admin/atur-password`;
}

export async function POST(req: NextRequest) {
  const me = await opsIdentity(req);
  if (!me) return unauthorized();
  if (grantable(me.role).length === 0) return forbidden("Hanya owner dan penanggung jawab yang boleh mengelola tim");

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const admin = getSupabaseAdmin();

  // — tautan atur-password baru —
  if (String(body?.action ?? "") === "link") {
    const id = String(body?.id ?? "");
    const { data: row } = await admin.from("admins").select("email, role").eq("id", id).maybeSingle();
    if (!row) return fail("Admin tidak ditemukan.", 404);
    if (!manageable(me.role, normalizeOpsRole(row.role))) return forbidden("Tidak boleh mengelola akun ini");
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: String(row.email),
      options: { redirectTo: redirectUrl(req) },
    });
    if (error || !data?.properties?.action_link) return fail(error?.message || "Gagal membuat tautan.", 500);
    return NextResponse.json({ link: data.properties.action_link }, { headers: noStore });
  }

  // — undang admin baru —
  const name = String(body?.name ?? "").trim();
  const email = String(body?.email ?? "").trim().toLowerCase();
  const title = String(body?.title ?? "").trim();
  const role = asRole(body?.role) ?? "admin";
  if (name.length < 2 || name.length > 60) return fail("Nama 2 sampai 60 karakter.", 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 120) return fail("Email tidak valid.", 400);
  if (title.length > 40) return fail("Label jabatan maksimal 40 karakter.", 400);
  if (!grantable(me.role).includes(role)) return forbidden("Peran ini tidak boleh Anda berikan");

  const { data: existing } = await admin.from("admins").select("id").ilike("email", email).maybeSingle();
  if (existing) return fail("Email ini sudah terdaftar sebagai admin.", 409);

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: redirectUrl(req),
    data: { display_name: name },
  });
  if (inviteError || !invited?.user) {
    const msg = inviteError?.message || "Gagal mengirim undangan.";
    if (/already.*registered|exists/i.test(msg)) return fail("Email ini sudah punya akun SAMAQU. Gunakan email lain.", 409);
    return fail(msg, 500);
  }

  const { error: insertError } = await admin.from("admins").insert({
    user_id: invited.user.id,
    email,
    role,
    display_name: name,
    title: title || null,
    active: true,
    invited_by: me.email,
  });
  if (insertError) {
    // Jangan tinggalkan akun login tanpa baris admin.
    await admin.auth.admin.deleteUser(invited.user.id).catch(() => undefined);
    return fail(insertError.message, 500);
  }

  return NextResponse.json({ ok: true, email }, { headers: noStore });
}

export async function PATCH(req: NextRequest) {
  const me = await opsIdentity(req);
  if (!me) return unauthorized();
  if (grantable(me.role).length === 0) return forbidden("Hanya owner dan penanggung jawab yang boleh mengelola tim");

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const id = String(body?.id ?? "");
  const admin = getSupabaseAdmin();
  const { data: row } = await admin.from("admins").select("id, user_id, role").eq("id", id).maybeSingle();
  if (!row) return fail("Admin tidak ditemukan.", 404);
  if (!manageable(me.role, normalizeOpsRole(row.role))) return forbidden("Tidak boleh mengelola akun ini");

  const patch: Record<string, unknown> = {};
  if (typeof body?.title === "string") {
    const title = body.title.trim();
    if (title.length > 40) return fail("Label jabatan maksimal 40 karakter.", 400);
    patch.title = title || null;
  }
  if (typeof body?.name === "string") {
    const name = body.name.trim();
    if (name.length < 2 || name.length > 60) return fail("Nama 2 sampai 60 karakter.", 400);
    patch.display_name = name;
  }
  if (body?.role !== undefined) {
    const role = asRole(body.role);
    if (!role || !grantable(me.role).includes(role)) return forbidden("Peran ini tidak boleh Anda berikan");
    if (row.user_id === me.userId) return fail("Tidak bisa mengubah peran akun sendiri.", 400);
    patch.role = role;
  }
  if (typeof body?.active === "boolean") {
    if (row.user_id === me.userId && body.active === false) return fail("Tidak bisa menonaktifkan akun sendiri.", 400);
    patch.active = body.active;
  }
  if (Object.keys(patch).length === 0) return fail("Tidak ada yang diubah.", 400);

  const { error } = await admin.from("admins").update(patch).eq("id", id);
  if (error) return fail(error.message, 500);
  if (patch.active === false || patch.role) evictAdminCache(String(row.user_id));
  return NextResponse.json({ ok: true }, { headers: noStore });
}
