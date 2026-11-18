/**
 * Hitung ongkir J&T untuk pesanan reseller — SATU sumber, dipakai portal reseller
 * (`/api/reseller/ongkir`) dan admin (`/api/ops/reseller/orders/ongkir`).
 *
 * Isinya dipindahkan apa adanya dari route portal (perilaku tidak berubah): memakai fungsi tarif
 * J&T yang sama dengan checkout website (`checkTariffSemua` + mapping area).
 *
 * Body: { city, district, items?, weight? }.
 * - `items` -> berat dihitung SERVER memakai fungsi yang sama dengan pembuatan pesanan
 *   (`sumWeightGramsBySize`), supaya opsi yang dipilih pasti cocok saat ongkir diverifikasi ulang
 *   ketika pesanan dibuat.
 * - `weight` (gram) tetap diterima sebagai cadangan ala checkout.
 */

import { checkTariffSemua } from "@/lib/jnt/tariff";
import { layananByCode } from "@/lib/jnt/layanan";
import { getJntConfig } from "@/lib/jnt/config";
import { getSendSiteCode, resolveTariffCodes } from "@/lib/jnt/area-mapping";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sumWeightGramsBySize, productWeightMapFromRows, variantWeightMapFromRows } from "@/lib/shipping-weight";

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

export interface ResellerOngkirResult {
  status: number;
  body: Record<string, unknown>;
}

export async function calcResellerOngkir(body: Record<string, unknown>): Promise<ResellerOngkirResult> {
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
    // Data berat lengkap -> pakai hitungan server; kalau tidak, cadangan ke `weight` kiriman.
    if (missing === 0 && grams > 0) weight = Math.max(300, grams);
  }

  if (!district || !weight || weight <= 0) {
    return { status: 400, body: { error: "district dan weight wajib" } };
  }

  const config = await getJntConfig();
  if (!config.orderUsername) {
    return { status: 200, body: { data: [], configured: false, weight, error: "Ongkir J&T belum dikonfigurasi" } };
  }

  try {
    const resolved = resolveTariffCodes(city, district);
    if (!resolved.destAreaCode) {
      return { status: 400, body: { error: "Kecamatan tujuan belum dikenali untuk ongkir J&T." } };
    }

    const originCode = getSendSiteCode("DEPOK") || "DEPOK";
    const layanan = await checkTariffSemua({
      weight: weight / 1000,
      originCode,
      destAreaCode: resolved.destAreaCode,
    });

    if (layanan.length === 0) {
      return { status: 404, body: { error: "Tidak ada opsi pengiriman J&T untuk tujuan ini." } };
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

    return { status: 200, body: { data: options, weight } };
  } catch (e) {
    console.error("[RESELLER-ONGKIR] Gagal menghitung ongkir:", e);
    return { status: 500, body: { error: "Gagal menghitung ongkir J&T" } };
  }
}
