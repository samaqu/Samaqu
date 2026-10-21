import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";

/**
 * Riwayat pergerakan stok (tabel `stock_movements` yang sudah ada — dipakai retur,
 * penyesuaian, dan Stok Opname). Tidak ada tabel riwayat baru.
 *
 * Query:
 *  - `direction` = in | out (opsional)
 *  - `source`    = opname | ... (opsional)
 *  - `session_id`= id sesi opname (opsional, untuk "Hasil penerapan")
 *  - `limit`     = default 200, maks 1000
 */
export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const sp = new URL(req.url).searchParams;
  const limit = Math.min(Math.max(parseInt(sp.get("limit") || "200", 10) || 200, 1), 1000);
  const direction = String(sp.get("direction") || "").trim();
  const source = String(sp.get("source") || "").trim();
  const sessionId = String(sp.get("session_id") || "").trim();

  const admin = getSupabaseAdmin();
  let query = admin
    .from("stock_movements")
    .select(
      "id, product_id, color, size, qty, direction, source, ref_type, ref_id, before_stock, after_stock, actor_name, notes, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (direction === "in" || direction === "out") query = query.eq("direction", direction);
  if (source) query = query.eq("source", source);
  if (sessionId) query = query.eq("ref_id", sessionId).eq("ref_type", "stock_opname");

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = Array.from(new Set((data || []).map((m: any) => m.product_id).filter(Boolean)));
  const { data: products } = ids.length
    ? await admin.from("products").select("id, name").in("id", ids)
    : { data: [] as any[] };
  const nameById = new Map<string, string>();
  for (const p of products || []) nameById.set(p.id, p.name);

  const items = (data || []).map((m: any) => ({
    ...m,
    product_name: nameById.get(m.product_id) || m.product_id,
    delta: m.direction === "out" ? -Math.abs(Number(m.qty) || 0) : Math.abs(Number(m.qty) || 0),
  }));

  return NextResponse.json({ items });
}
