import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { canSeePrices, productionGuard } from "@/lib/ops-auth";
import { mapMovement } from "@/lib/produksi-server";

/**
 * Stok opname komponen: hitungan fisik → selisih → transaksi penyesuaian
 * di buku stok. Tidak ada sesi/approval di fase 1.
 */

export async function GET(req: NextRequest) {
  const access = await productionGuard(req);
  if (!access.ok) return access.response;
  const showPrices = canSeePrices(access.role);

  const limit = Math.min(
    Math.max(parseInt(new URL(req.url).searchParams.get("limit") || "100", 10) || 100, 1),
    500,
  );

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("production_stock_movements")
    .select("*")
    .eq("type", "opname")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = Array.from(new Set((data || []).map((m: any) => m.component_id)));
  const { data: components } = ids.length
    ? await admin.from("production_components").select("id, code, name, unit_use").in("id", ids)
    : { data: [] as any[] };
  const byId = new Map((components || []).map((c: any) => [c.id, c]));

  const items = (data || []).map((row: any) => {
    const component = byId.get(row.component_id) as any;
    return {
      ...mapMovement(
        {
          ...row,
          component_code: component?.code || "",
          component_name: component?.name || "",
        },
        showPrices,
      ),
      unit_use: component?.unit_use || "",
    };
  });

  return NextResponse.json({ items, role: access.role, can_write: access.canWrite, prices: showPrices });
}

export async function POST(req: NextRequest) {
  const access = await productionGuard(req, { write: true });
  if (!access.ok) return access.response;

  try {
    const body = await req.json();
    const componentId = String(body?.component_id || "").trim();
    const counted = Number(body?.counted_stock);
    const reason = String(body?.reason || "").trim();
    const notes = String(body?.notes || "").trim();

    if (!componentId) return NextResponse.json({ error: "Komponen wajib dipilih." }, { status: 400 });
    if (!Number.isFinite(counted) || counted < 0) {
      return NextResponse.json({ error: "Hitungan fisik tidak valid." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc("production_record_opname", {
      p_component_id: componentId,
      p_counted: counted,
      p_reason: reason || null,
      p_notes: notes || null,
      p_date: String(body?.date || "").trim() || null,
      p_actor: access.email,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ result: data });
  } catch (e) {
    console.error("[PRODUKSI] opname POST:", e);
    return NextResponse.json({ error: "Gagal menyimpan stok opname." }, { status: 500 });
  }
}
