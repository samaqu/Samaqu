import { NextRequest, NextResponse } from "next/server";
import { checkTariffSemua } from "@/lib/jnt/tariff";
import { layananByCode } from "@/lib/jnt/layanan";
import { getJntConfig } from "@/lib/jnt/config";
import { getSendSiteCode, resolveTariffCodes } from "@/lib/jnt/area-mapping";
import { resellerSession, resellerUnauthorized } from "@/lib/reseller/auth";

/**
 * Cek ongkir J&T untuk pesanan reseller — memakai fungsi tarif J&T yang
 * sama dengan checkout website (`checkTariffSemua` + mapping area).
 * Body: { city, district, weight (gram) }.
 */
export async function POST(req: NextRequest) {
  const session = await resellerSession(req);
  if (!session) return resellerUnauthorized();

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const city = String(body.city ?? "").trim();
  const district = String(body.district ?? "").trim();
  const weight = Number(body.weight);

  if (!district || !weight || weight <= 0) {
    return NextResponse.json({ error: "district dan weight wajib" }, { status: 400 });
  }

  const config = await getJntConfig();
  if (!config.orderUsername) {
    return NextResponse.json(
      { data: [], configured: false, error: "Ongkir J&T belum dikonfigurasi" },
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

    return NextResponse.json({ data: options });
  } catch (e) {
    console.error("[RESELLER-ONGKIR] Gagal menghitung ongkir:", e);
    return NextResponse.json({ error: "Gagal menghitung ongkir J&T" }, { status: 500 });
  }
}
