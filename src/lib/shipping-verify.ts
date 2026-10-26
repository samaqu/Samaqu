import { getJntConfig } from "./jnt/config";
import { checkTariffSemua } from "./jnt/tariff";
import { layananByCode } from "./jnt/layanan";
import { getSendSiteCode, resolveTariffCodes } from "./jnt/area-mapping";

/**
 * Verifikasi ongkir J&T di server.
 *
 * Ongkir dari browser hanya dipakai sebagai pembanding: tarif dihitung ulang dari kecamatan +
 * berat server. Kalau layanan/harga tidak cocok, pesanan ditolak supaya ongkir tidak bisa
 * dimanipulasi. Pengiriman manual (method kosong/"manual" dan biaya 0) tetap diizinkan untuk
 * pesanan lama/alur yang memang menunggu hitungan admin.
 */
export type ShippingVerifyResult =
  | { ok: true; cost: number; method: string }
  | { ok: false; error: string; status: number };

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { ts: number; options: Awaited<ReturnType<typeof checkTariffSemua>> }>();

function serviceOf(method: string): string {
  const parts = method.split(" - ");
  return (parts.length > 1 ? parts.slice(1).join(" - ") : method).trim();
}

export async function verifyJntShipping(input: {
  city?: string | null;
  district?: string | null;
  weightGrams: number;
  method?: string | null;
  cost?: number | null;
  /** Open Order boleh "manual" (admin hitung menyusul); checkout website tidak. */
  allowManual?: boolean;
}): Promise<ShippingVerifyResult> {
  const method = String(input.method || "").trim();
  const submittedCost = Math.max(0, Math.round(Number(input.cost) || 0));
  const isManual = !method || method.toLowerCase() === "manual";

  if (isManual) {
    if (input.allowManual && submittedCost === 0) {
      return { ok: true, cost: 0, method: "manual" };
    }
    return { ok: false, error: "Pilih layanan pengiriman J&T terlebih dahulu.", status: 400 };
  }

  const weightGrams = Math.round(Number(input.weightGrams) || 0);
  if (weightGrams <= 0) {
    return { ok: false, error: "Berat pesanan tidak valid untuk menghitung ongkir.", status: 400 };
  }

  const config = await getJntConfig();
  if (!config.orderUsername) {
    return {
      ok: false,
      error: "Ongkir J&T belum dikonfigurasi. Hubungi admin sebelum checkout.",
      status: 503,
    };
  }

  const resolved = resolveTariffCodes(String(input.city || ""), String(input.district || ""));
  if (!resolved.destAreaCode) {
    return {
      ok: false,
      error: "Kecamatan tujuan belum dikenali untuk ongkir J&T. Periksa kembali alamat.",
      status: 400,
    };
  }

  const originCode = getSendSiteCode("DEPOK") || "DEPOK";
  const weightKg = weightGrams / 1000;
  const cacheKey = `${originCode}-${resolved.destAreaCode}-${weightKg}`;
  const cached = cache.get(cacheKey);
  let options = cached && Date.now() - cached.ts < CACHE_TTL_MS ? cached.options : null;

  if (!options) {
    try {
      options = await checkTariffSemua({
        weight: weightKg,
        originCode,
        destAreaCode: resolved.destAreaCode,
      });
      // Jangan cache hasil kosong: bisa jadi J&T sedang bermasalah, bukan rute tidak ada.
      if (options.length > 0) cache.set(cacheKey, { ts: Date.now(), options });
    } catch (error) {
      console.error("[SHIPPING-VERIFY] Gagal mengambil tarif J&T:", error);
      return { ok: false, error: "Gagal memverifikasi ongkir J&T. Coba lagi.", status: 502 };
    }
  }

  if (options.length === 0) {
    return {
      ok: false,
      error: "Tidak ada layanan J&T untuk tujuan ini. Periksa kecamatan alamat.",
      status: 400,
    };
  }

  const wanted = serviceOf(method).toLowerCase();
  const match = options.find((option) => {
    const label = layananByCode(option.serviceCode)?.label || option.name || option.serviceCode;
    return (
      label.toLowerCase() === wanted ||
      option.serviceCode.toLowerCase() === wanted ||
      String(option.name || "").toLowerCase() === wanted
    );
  });

  if (!match) {
    return {
      ok: false,
      error: "Layanan pengiriman tidak dikenal atau sudah berubah. Muat ulang halaman checkout.",
      status: 400,
    };
  }

  if (Math.round(match.cost) !== submittedCost) {
    return {
      ok: false,
      error: `Ongkir berubah (Rp ${submittedCost.toLocaleString("id-ID")} → Rp ${Math.round(match.cost).toLocaleString("id-ID")}). Muat ulang halaman lalu coba lagi.`,
      status: 400,
    };
  }

  return { ok: true, cost: Math.round(match.cost), method };
}
