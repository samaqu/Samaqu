import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ownerProductionGuard } from "@/lib/ops-auth";
import { computeHpp } from "@/lib/produksi-hpp";
import { loadRecipeForHpp } from "@/lib/produksi-recipe-server";
import { SERIES_ORDER } from "@/lib/ops-order";

/**
 * Matriks HPP: semua kombinasi Jenis Kain × Series (atau hanya Jenis Kain
 * kalau resep tidak memakai filter series).
 *
 * Setiap sel berisi HPP Real & Aman untuk Include Cover & Hanger dan
 * Tanpa Cover & Hanger. "Tanpa" dihitung dengan menjumlahkan baris yang
 * dipakai, bukan mengurangi total.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const access = await ownerProductionGuard(req);
  if (!access.ok) return access.response;

  const { id } = await context.params;
  const sp = new URL(req.url).searchParams;
  const size = sp.get("size") || null;
  const color = sp.get("color") || null;

  try {
    const admin = getSupabaseAdmin();
    const loaded = await loadRecipeForHpp(admin, id);
    if (!loaded) return NextResponse.json({ error: "Resep tidak ditemukan." }, { status: 404 });

    const { data: fabrics } = await admin
      .from("jenis_kain")
      .select("id, name")
      .order("name", { ascending: true });
    const fabricList = fabrics || [];
    const usesSeries = loaded.lines.some((line) => Boolean(line.filter_series));
    const seriesList = usesSeries ? [...SERIES_ORDER] : [""];

    const rows: Record<string, unknown>[] = [];
    for (const fabric of fabricList) {
      for (const series of seriesList) {
        const result = computeHpp(loaded.lines, loaded.components, {
          fabric_type_id: fabric.id,
          series: series || null,
          size,
          color,
        });
        rows.push({
          fabric_id: fabric.id,
          fabric_name: fabric.name,
          series: series || "",
          real_include: result.totals.real,
          safe_include: result.totals.safe,
          real_without: result.totals.real_without_optional,
          safe_without: result.totals.safe_without_optional,
          diff_include: result.totals.diff,
          diff_without:
            Math.round((result.totals.safe_without_optional - result.totals.real_without_optional) * 100) / 100,
          warnings: result.warnings.length,
        });
      }
    }

    return NextResponse.json({
      uses_series: usesSeries,
      size,
      color,
      fabrics: fabricList,
      series: usesSeries ? [...SERIES_ORDER] : [],
      rows,
      recipe: {
        id: loaded.recipe.id,
        product_category: loaded.recipe.product_category,
        version: loaded.recipe.version,
        is_active: loaded.recipe.is_active,
      },
    });
  } catch (e) {
    console.error("[PRODUKSI] matriks HPP:", e);
    return NextResponse.json({ error: "Gagal menyusun matriks HPP." }, { status: 500 });
  }
}
