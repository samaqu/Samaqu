import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ownerProductionGuard } from "@/lib/ops-auth";
import { computeHpp } from "@/lib/produksi-hpp";
import { loadRecipeForHpp } from "@/lib/produksi-recipe-server";

/**
 * Kalkulator HPP untuk SATU kombinasi.
 * Query: fabric_type_id, series, size, color.
 * Angka komponen selalu dibaca dari master Fase 1 (bukan dari baris resep).
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const access = await ownerProductionGuard(req);
  if (!access.ok) return access.response;

  const { id } = await context.params;
  const sp = new URL(req.url).searchParams;
  const selection = {
    fabric_type_id: sp.get("fabric_type_id") || null,
    series: sp.get("series") || null,
    size: sp.get("size") || null,
    color: sp.get("color") || null,
  };

  try {
    const admin = getSupabaseAdmin();
    const loaded = await loadRecipeForHpp(admin, id);
    if (!loaded) return NextResponse.json({ error: "Resep tidak ditemukan." }, { status: 404 });

    const result = computeHpp(loaded.lines, loaded.components, selection);
    return NextResponse.json({
      result,
      recipe: {
        id: loaded.recipe.id,
        product_category: loaded.recipe.product_category,
        version: loaded.recipe.version,
        is_active: loaded.recipe.is_active,
      },
    });
  } catch (e) {
    console.error("[PRODUKSI] hitung HPP:", e);
    return NextResponse.json({ error: "Gagal menghitung HPP." }, { status: 500 });
  }
}
