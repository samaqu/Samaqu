import { NextRequest, NextResponse } from "next/server";
import { checkTariffSemua } from "@/lib/jnt/tariff";
import { layananByCode } from "@/lib/jnt/layanan";
import { getJntConfig } from "@/lib/jnt/config";
import { getSendSiteCode, resolveTariffCodes } from "@/lib/jnt/area-mapping";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  sumWeightGramsBySize,
  productWeightMapFromRows,
  variantWeightMapFromRows,
} from "@/lib/shipping-weight";
import { resellerSession, resellerUnauthorized } from "@/lib/reseller/auth";

/**
 * Cek ongkir J&T untuk pesanan reseller — memakai fungsi tarif J&T yang
 * sama dengan checkout website (`checkTariffSemua` + mapping area).
 *
 * Body: { city, district, items?, weight? }.
 * - `items` → berat dihitung SERVER memakai fungsi yang sama dengan pembuatan
 *   pesanan (`sumWeightGramsBySize`), supaya opsi yang dipilih reseller pasti
 *   cocok saat ongkir diverifikasi ulang ketika pesanan dibuat.
 * - `weight` (gram) tetap diterima sebagai cadangan ala checkout.
 */

interface ItemInput {
  product_id: string;
  color: string;
  size: string;
  quantity: number;
}

async function serverWeightGrams(items: ItemInput[]): Promise<{ grams: number; missing: number }> {
  const ids = [...new Set(items.map((i) => String(i.product_id || "").trim()).filter(Boolean))];
  if (ids.length === 0) return { grams: 0, missing: 0 };

  const supabase = getSupabaseAdmin();
  const [{ data: pRows }, { data: vRows }] = await Promise.all([
    supabase.from("products").select("id, weight").in("id", ids),
    supabase.from("product_variants").select("product_id, color, size, weight").in("product_id", ids),
  ]);

  const { grams, missingQty } = sumWeightGramsBySize(
    items.map((i) => ({ productId: i.product_id, color: i.color, size: i.size, quantity: i.quantity })),
    productWeightMapFromRows(pRows),
    variantWeightMapFromRows(vRows)
  );
  return { grams, missing: missingQty };
}

export async function POST(req: NextRequest) {
  const session = await resellerSession(req);
  if (!session) return resellerUnauthorized();

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const city = String(body.city ?? "").trim();
  const district = String(body.district ?? "").trim();
  const rawItems = Array.isArray(body.items) ? body.items : [];

  let weight = Number(body.weight) || 0;
  if (rawItems.length > 0) {
    const items: ItemInput[] = rawItems.map((item: unknown) => {
      const value = (item ?? {}) as Record<string, unknown>;
      return {
        product_id: String(value.product_id ?? ""),
        color: String(value.color ?? ""),
        size: String(value.size ?? ""),
        quantity: Number(value.quantity) || 0,
      };
    });
    const { grams, missing } = await serverWeightGrams(items);
    // Data berat lengkap → pakai hitungan server; kalau tidak, cadangan ke `weight` kiriman.
    if (missing === 0 && grams > 0) weight = Math.max(300, grams);
  }

  if (!district || !weight || weight <= 0) {
    return NextResponse.json({ error: "district dan weight wajib" }, { status: 400 });
  }

  const config = await getJntConfig();
  if (!config.orderUsername) {
    return NextResponse.json(
      { data: [], configured: false, weight, error: "Ongkir J&T belum dikonfigurasi" },
      { status: 200 }
    );
  }

  try {
    const resolved = resolveTariffCodes(city, district);
    if (!resolved.destAreaCode) {
      return NextResponse.json(
        { error: "Kecamatan tujuan belum dikenali untuk ongkir J&T." },
        { status: 400 }
      );
    }

    const originCode = getSendSiteCode("DEPOK") || "DEPOK";
    const layanan = await checkTariffSemua({
      weight: weight / 1000,
      originCode,
      destAreaCode: resolved.destAreaCode,
    });

    if (layanan.length === 0) {
      return NextResponse.json(
        { error: "Tidak ada opsi pengiriman J&T untuk tujuan ini." },
        { status: 404 }
      );
    }

    const options = layanan
      .map((option) => {
        const known = layananByCode(option.serviceCode);
        return {
          courier: "J&T",
          service: known?.label || option.name || option.serviceCode,
          serviceCode: option.serviceCode,
          cost: option.cost,
          etd: option.etd || known?.estimate || "",
        };
      })
      .sort((a, b) => a.cost - b.cost);

    return NextResponse.json({ data: options, weight });
  } catch (e) {
    console.error("[RESELLER-ONGKIR] Gagal menghitung ongkir:", e);
    return NextResponse.json({ error: "Gagal menghitung ongkir J&T" }, { status: 500 });
  }
}
