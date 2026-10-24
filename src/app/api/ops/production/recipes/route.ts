import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ownerProductionGuard } from "@/lib/ops-auth";
import { CATEGORY_ORDER } from "@/lib/ops-order";

/**
 * Daftar resep + simpan versi baru.
 *
 * POST tanpa `id`  → membuat versi pertama untuk kategori.
 * POST dengan `id` → membuat VERSI BARU dari resep aktif itu; versi lama tetap
 *                    tersimpan dan otomatis nonaktif (ditangani RPC).
 *
 * Tidak ada endpoint edit/hapus baris: versi lama tidak boleh ditimpa.
 */

function normalizeLines(raw: unknown): Record<string, unknown>[] {
  const rows = Array.isArray(raw) ? raw : [];
  return rows.map((line: any) => {
    const type = line?.line_type === "biaya" ? "biaya" : "bahan";
    return {
      line_type: type,
      group_code: type === "biaya" ? "biaya" : String(line?.group_code || "bahan_produksi"),
      group_label: type === "biaya" ? String(line?.group_label || "").trim() || null : null,
      component_id: type === "bahan" ? line?.component_id || null : null,
      name: String(line?.name || "").trim(),
      qty_per_pcs: Number(line?.qty_per_pcs) || 0,
      waste_percent: Number(line?.waste_percent) || 0,
      size_qty:
        line?.size_qty && typeof line.size_qty === "object" && !Array.isArray(line.size_qty)
          ? line.size_qty
          : {},
      real_price: Number(line?.real_price) || 0,
      safe_price: Number(line?.safe_price) || 0,
      filter_fabric_type_id: line?.filter_fabric_type_id || null,
      filter_series: String(line?.filter_series || "").trim() || null,
      filter_size: String(line?.filter_size || "").trim() || null,
      filter_color: String(line?.filter_color || "").trim() || null,
      notes: String(line?.notes || "").trim() || null,
    };
  });
}

export async function GET(req: NextRequest) {
  const access = await ownerProductionGuard(req);
  if (!access.ok) return access.response;

  const admin = getSupabaseAdmin();
  const category = String(new URL(req.url).searchParams.get("category") || "").trim();

  let query = admin
    .from("production_recipes")
    .select("*")
    .order("product_category", { ascending: true })
    .order("version", { ascending: false });
  if (category) query = query.eq("product_category", category);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (data || []).map((recipe: any) => recipe.id);
  const { data: lines } = ids.length
    ? await admin.from("production_recipe_lines").select("recipe_id").in("recipe_id", ids)
    : { data: [] as any[] };

  const counts = new Map<string, number>();
  for (const line of lines || []) {
    counts.set(line.recipe_id, (counts.get(line.recipe_id) || 0) + 1);
  }

  return NextResponse.json({
    items: (data || []).map((recipe: any) => ({
      ...recipe,
      line_count: counts.get(recipe.id) || 0,
    })),
  });
}

export async function POST(req: NextRequest) {
  const access = await ownerProductionGuard(req);
  if (!access.ok) return access.response;

  try {
    const body = await req.json();
    const effectiveDate = String(body?.effective_date || "").trim();
    if (!effectiveDate) {
      return NextResponse.json({ error: "Tanggal berlaku wajib diisi." }, { status: 400 });
    }

    // Kategori hanya dari daftar produk yang sudah ada; jangan bikin daftar baru.
    if (!body?.id) {
      const category = String(body?.product_category || "").trim();
      if (!CATEGORY_ORDER.includes(category)) {
        return NextResponse.json({ error: "Kategori produk tidak dikenal." }, { status: 400 });
      }
    }

    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc("production_save_recipe", {
      p_recipe_id: body?.id ? String(body.id) : null,
      p_category: String(body?.product_category || "").trim() || null,
      p_effective_date: effectiveDate,
      p_notes: String(body?.notes || "").trim() || null,
      p_lines: normalizeLines(body?.lines),
      p_actor: access.email,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ item: data }, { status: 201 });
  } catch (e) {
    console.error("[PRODUKSI] resep POST:", e);
    return NextResponse.json({ error: "Gagal menyimpan resep." }, { status: 500 });
  }
}
