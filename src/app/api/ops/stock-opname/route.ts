import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";
import {
  buildOpnameLines,
  nextOpnameCode,
  reasonLabel,
  type OpnameLine,
} from "@/lib/stock-opname";

/**
 * Stok Opname — API untuk panel Admin Operasional & dashboard /admin.
 *
 * Sumber stok TETAP `product_variants` (aturan stok sharing di src/lib/ops-stock.ts).
 * Hitungan fisik tidak menyentuh stok sampai sesi disetujui; penyesuaian dihitung dari
 * stok TERKINI saat menyetujui (bukan snapshot) supaya transaksi yang masuk selama
 * proses hitung tidak tertimpa. Setiap penyesuaian dicatat di `stock_movements`.
 */

type Actor = { id: string | null; name: string };

async function currentActor(req: NextRequest): Promise<Actor> {
  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return { id: null, name: "" };
    const { data } = await getSupabaseAdmin().auth.getUser(token);
    const user = data?.user;
    const meta = (user?.user_metadata || {}) as Record<string, unknown>;
    const name =
      String(meta.full_name || meta.name || "").trim() || String(user?.email || "").split("@")[0] || "";
    return { id: user?.id || null, name };
  } catch {
    return { id: null, name: "" };
  }
}

async function readStockSource() {
  const admin = getSupabaseAdmin();
  const [{ data: products }, { data: variants }] = await Promise.all([
    admin.from("products").select("id, name, series, price, hpp, category, jenis_kain(name)"),
    admin.from("product_variants").select("product_id, color, size, stock, sku, base_product_id, base_size"),
  ]);
  return buildOpnameLines((products || []) as any[], (variants || []) as any[]);
}

function summarize(
  lines: Array<Pick<OpnameLine, "is_derived" | "system_stock" | "counted_stock" | "price">>,
) {
  const countable = lines.filter((l) => !l.is_derived);
  const dihitung = countable.filter((l) => l.counted_stock !== null && l.counted_stock !== undefined);
  const selisih = dihitung.filter((l) => Number(l.counted_stock) !== Number(l.system_stock));
  const nilai = selisih.reduce(
    (sum, l) => sum + (Number(l.counted_stock) - Number(l.system_stock)) * (Number(l.price) || 0),
    0,
  );
  return { total: countable.length, dihitung: dihitung.length, selisih: selisih.length, nilai };
}

/** GET: daftar sesi (`?id=` untuk satu sesi + baris + stok terkini). */
export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const admin = getSupabaseAdmin();
  const id = new URL(req.url).searchParams.get("id") || "";

  if (id) {
    const [{ data: session, error }, { data: lines, error: lineError }] = await Promise.all([
      admin.from("stock_opname_sessions").select("*").eq("id", id).maybeSingle(),
      admin.from("stock_opname_lines").select("*").eq("session_id", id),
    ]);
    if (error || lineError) return NextResponse.json({ error: "Gagal memuat sesi" }, { status: 500 });
    if (!session) return NextResponse.json({ error: "Sesi tidak ditemukan" }, { status: 404 });

    // Stok TERKINI — dipakai menandai "ada pergerakan setelah sesi dimulai".
    const productIds = Array.from(new Set((lines || []).map((l: any) => l.product_id)));
    const { data: live } = productIds.length
      ? await admin
          .from("product_variants")
          .select("product_id, color, size, stock")
          .in("product_id", productIds)
      : { data: [] as any[] };

    return NextResponse.json({
      session,
      lines: (lines || []).sort((a: any, b: any) =>
        `${a.product_name}|${a.color}|${a.size}`.localeCompare(
          `${b.product_name}|${b.color}|${b.size}`,
          "id",
          { sensitivity: "base" },
        ),
      ),
      live: live || [],
    });
  }

  const { data: sessions, error } = await admin
    .from("stock_opname_sessions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (sessions || []).map((s: any) => s.id);
  const { data: lines } = ids.length
    ? await admin
        .from("stock_opname_lines")
        .select("session_id, is_derived, system_stock, counted_stock, price")
        .in("session_id", ids)
    : { data: [] as any[] };

  const bySession: Record<string, any[]> = {};
  for (const line of lines || []) (bySession[line.session_id] ||= []).push(line);

  const items = (sessions || []).map((s: any) => ({
    ...s,
    ...summarize(
      (bySession[s.id] || []).map((l: any) => ({
        ...l,
        counted_stock: l.counted_stock === null ? null : Number(l.counted_stock),
        system_stock: Number(l.system_stock),
        price: Number(l.price),
      })),
    ),
  }));

  return NextResponse.json({ items });
}

/** POST: mulai sesi baru (snapshot stok sistem). Hanya satu draft aktif. */
export async function POST(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const admin = getSupabaseAdmin();
  const { data: draft } = await admin
    .from("stock_opname_sessions")
    .select("id, code")
    .eq("status", "draft")
    .limit(1)
    .maybeSingle();
  if (draft) {
    return NextResponse.json(
      { error: `Masih ada sesi draft (${draft.code}). Selesaikan atau ajukan dulu sesi itu.` },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const notes = String(body?.notes || "").trim() || null;
  const actor = await currentActor(req);

  const lines = await readStockSource();
  if (lines.length === 0) {
    return NextResponse.json({ error: "Belum ada produk/ukuran untuk dihitung." }, { status: 400 });
  }

  const { data: last } = await admin
    .from("stock_opname_sessions")
    .select("code")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const code = nextOpnameCode(last?.code);

  const { data: session, error } = await admin
    .from("stock_opname_sessions")
    .insert({
      code,
      status: "draft",
      notes,
      created_by: actor.id,
      created_by_name: actor.name,
    })
    .select("*")
    .single();
  if (error || !session) {
    console.error("[OPNAME] create session:", error?.message);
    return NextResponse.json({ error: "Gagal membuat sesi opname" }, { status: 500 });
  }

  const rows = lines.map((line) => ({ ...line, session_id: session.id, updated_at: undefined }));
  for (let i = 0; i < rows.length; i += 200) {
    const { error: lineError } = await admin
      .from("stock_opname_lines")
      .insert(rows.slice(i, i + 200));
    if (lineError) {
      console.error("[OPNAME] insert lines:", lineError.message);
      await admin.from("stock_opname_sessions").delete().eq("id", session.id);
      return NextResponse.json({ error: "Gagal menyiapkan baris hitung" }, { status: 500 });
    }
  }

  return NextResponse.json({ session, total: rows.length });
}

type IncomingLine = {
  product_id: string;
  color: string;
  size: string;
  counted_stock: number | null;
  reason?: string | null;
  reason_note?: string | null;
};

function cleanCount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

/** PATCH: simpan draft / ajukan / setujui / tolak. */
export async function PATCH(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const admin = getSupabaseAdmin();
  const body = await req.json().catch(() => null);
  const id = String(body?.id || "");
  const action = String(body?.action || "");
  if (!id) return NextResponse.json({ error: "id sesi wajib" }, { status: 400 });

  const { data: session } = await admin
    .from("stock_opname_sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: "Sesi tidak ditemukan" }, { status: 404 });

  const actor = await currentActor(req);

  // ── Simpan hitungan (draft / sesi yang ditolak boleh diperbaiki) ──
  if (action === "save") {
    if (!["draft", "ditolak"].includes(session.status)) {
      return NextResponse.json({ error: "Sesi ini sudah dikunci." }, { status: 400 });
    }
    const lines: IncomingLine[] = Array.isArray(body?.lines) ? body.lines : [];
    for (const line of lines) {
      const { error } = await admin
        .from("stock_opname_lines")
        .update({
          counted_stock: cleanCount(line.counted_stock),
          reason: line.reason || null,
          reason_note: line.reason_note ? String(line.reason_note).slice(0, 300) : null,
          updated_at: new Date().toISOString(),
        })
        .eq("session_id", id)
        .eq("product_id", line.product_id)
        .eq("color", line.color)
        .eq("size", line.size)
        .eq("is_derived", false);
      if (error) {
        console.error("[OPNAME] save line:", error.message);
        return NextResponse.json({ error: "Gagal menyimpan hitungan" }, { status: 500 });
      }
    }
    await admin
      .from("stock_opname_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", id);
    return NextResponse.json({ saved: lines.length });
  }

  // ── Ajukan persetujuan ──
  if (action === "submit") {
    if (!["draft", "ditolak"].includes(session.status)) {
      return NextResponse.json({ error: "Sesi ini sudah dikirim atau disetujui." }, { status: 400 });
    }
    const { data: lines } = await admin
      .from("stock_opname_lines")
      .select("product_id, color, size, system_stock, counted_stock, reason, reason_note, is_derived")
      .eq("session_id", id);

    const beda = (lines || []).filter(
      (l: any) =>
        !l.is_derived &&
        l.counted_stock !== null &&
        Number(l.counted_stock) !== Number(l.system_stock),
    );
    const tanpaPenyebab = beda.filter((l: any) => !l.reason);
    if (tanpaPenyebab.length > 0) {
      return NextResponse.json(
        { error: `Masih ada ${tanpaPenyebab.length} baris selisih yang belum dipilih penyebabnya.` },
        { status: 400 },
      );
    }
    const lainnyaTanpaCatatan = beda.filter((l: any) => l.reason === "lainnya" && !l.reason_note);
    if (lainnyaTanpaCatatan.length > 0) {
      return NextResponse.json(
        { error: "Penyebab \"Lainnya\" wajib diberi catatan singkat." },
        { status: 400 },
      );
    }

    const { error } = await admin
      .from("stock_opname_sessions")
      .update({ status: "menunggu", submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return NextResponse.json({ error: "Gagal mengajukan sesi" }, { status: 500 });
    return NextResponse.json({ status: "menunggu" });
  }

  // ── Tolak (wajib alasan; sesi bisa diedit lagi) ──
  if (action === "reject") {
    if (session.status !== "menunggu") {
      return NextResponse.json({ error: "Hanya sesi yang menunggu persetujuan bisa ditolak." }, { status: 400 });
    }
    const reason = String(body?.reject_reason || "").trim();
    if (!reason) return NextResponse.json({ error: "Alasan penolakan wajib diisi." }, { status: 400 });

    await admin
      .from("stock_opname_sessions")
      .update({
        status: "ditolak",
        reject_reason: reason.slice(0, 500),
        reviewed_at: new Date().toISOString(),
        reviewed_by: actor.id,
        reviewed_by_name: actor.name,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    return NextResponse.json({ status: "ditolak" });
  }

  // ── Setujui: stok sistem disesuaikan ke angka fisik (hanya baris berselisih) ──
  if (action === "approve") {
    if (session.status !== "menunggu") {
      return NextResponse.json({ error: "Sesi ini belum diajukan." }, { status: 400 });
    }
    const { data: lines } = await admin
      .from("stock_opname_lines")
      .select("id, product_id, product_name, color, size, counted_stock, reason, reason_note, is_derived")
      .eq("session_id", id);

    const countable = (lines || []).filter(
      (l: any) => !l.is_derived && l.counted_stock !== null,
    );
    const productIds = Array.from(new Set(countable.map((l: any) => l.product_id)));
    const { data: live } = productIds.length
      ? await admin
          .from("product_variants")
          .select("product_id, color, size, stock")
          .in("product_id", productIds)
      : { data: [] as any[] };
    const liveMap = new Map<string, number>();
    for (const v of live || []) {
      liveMap.set(`${v.product_id}|${String(v.color || "default").toLowerCase()}|${v.size}`, Number(v.stock) || 0);
    }

    let adjusted = 0;
    let skipped = 0;
    const movements: Record<string, unknown>[] = [];
    const appliedIds: string[] = [];

    for (const line of countable) {
      const key = `${line.product_id}|${String(line.color || "default").toLowerCase()}|${line.size}`;
      if (!liveMap.has(key)) {
        skipped += 1;
        continue;
      }
      const current = liveMap.get(key) as number;
      const target = Math.max(0, Number(line.counted_stock));
      const delta = target - current;
      if (delta === 0) {
        appliedIds.push(line.id);
        continue;
      }

      const { error: updateError } = await admin
        .from("product_variants")
        .update({ stock: target })
        .eq("product_id", line.product_id)
        .eq("color", line.color)
        .eq("size", line.size);
      if (updateError) {
        console.error("[OPNAME] update stock:", line.product_id, line.size, updateError.message);
        skipped += 1;
        continue;
      }

      movements.push({
        product_id: line.product_id,
        color: String(line.color || "default"),
        size: line.size,
        qty: Math.abs(delta),
        direction: delta > 0 ? "in" : "out",
        source: "opname",
        ref_type: "stock_opname",
        ref_id: session.id,
        before_stock: current,
        after_stock: target,
        actor_name: actor.name || null,
        notes: `${session.code} · ${line.product_name || line.product_id} · ${reasonLabel(line.reason)}${
          line.reason_note ? ` (${line.reason_note})` : ""
        }`,
      });
      appliedIds.push(line.id);
      adjusted += 1;
    }

    if (movements.length > 0) {
      const { error: moveError } = await admin.from("stock_movements").insert(movements);
      if (moveError) {
        console.error("[OPNAME] insert movements:", moveError.message);
        return NextResponse.json(
          { error: "Stok sudah diubah tapi riwayat gagal dicatat. Hubungi developer." },
          { status: 500 },
        );
      }
    }

    if (appliedIds.length > 0) {
      await admin.from("stock_opname_lines").update({ applied: true }).in("id", appliedIds);
    }

    const { error: doneError } = await admin
      .from("stock_opname_sessions")
      .update({
        status: "disetujui",
        reviewed_at: new Date().toISOString(),
        reviewed_by: actor.id,
        reviewed_by_name: actor.name,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (doneError) return NextResponse.json({ error: "Gagal menyetujui sesi" }, { status: 500 });

    console.log("[OPNAME] disetujui:", session.code, "baris disesuaikan:", adjusted, "dilewati:", skipped);
    return NextResponse.json({ status: "disetujui", adjusted, skipped });
  }

  return NextResponse.json({ error: "Aksi tidak dikenal" }, { status: 400 });
}
