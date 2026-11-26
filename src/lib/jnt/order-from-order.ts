import { getSupabaseAdmin } from "../supabase-admin";
import { isPaymentMethodId, legacyPaymentType } from "../payment-methods";
import { createOrder } from "./order";
import { getDestinationCode, getOriginCode, getReceiverArea, getSendSiteCode, resolveTariffCodes } from "./area-mapping";
import { checkTariffSemua } from "./tariff";
import { expressTypeUntuk, isManualService, jntServiceCodeFromShippingMethod } from "./layanan";
import type { OrderResponse } from "./types";
import { isCustomCourier } from "../custom-courier";
import { sumWeightGramsBySize, productWeightMapFromRows, variantWeightMapFromRows } from "../shipping-weight";

/**
 * Buat pesanan J&T (Order Create API) dari baris `orders` + `order_items` yang SUDAH tersimpan.
 *
 * Dulu setiap checkout (`/api/orders` & `/api/open-order`) langsung memanggil J&T begitu pesanan
 * masuk, jadi resi terbit sebelum admin memverifikasi pembayaran. Sekarang pembuatan resi dipicu
 * manual oleh admin lewat tombol **"Atur Pesanan"** di drawer detail pesanan
 * (`PATCH /api/admin/orders` dengan `action: "createJnt"`) — alur ala Shopee Seller Centre.
 *
 * Payload J&T-nya dulu disalin di dua route checkout; sekarang logikanya cuma ada di sini.
 */

/** Pengirim yang dipakai semua pesanan SAMAQU (dulu ditulis ulang di tiap route checkout). */
export const SAMAQU_ORIGIN = {
  city: "DEPOK",
  name: "SAMAQU",
  phone: "+6281234567890",
  address: "Jl. Depok, Depok, Jawa Barat",
};

/** Berat fallback per item (gram) kalau baris katalog tidak punya `weight` — sama dengan wizard Open Order. */
const DEFAULT_ITEM_WEIGHT = 1200;

export interface JntOrderSourceItem {
  product_id?: string | null;
  product_name: string;
  quantity: number;
  /** Warna & ukuran dipakai untuk berat per varian (`product_variants.weight`). */
  color?: string | null;
  size?: string | null;
}

export interface JntOrderSource {
  order_number: string;
  customer_name: string;
  customer_whatsapp: string;
  shipping_address: string;
  shipping_city: string;
  /** Kecamatan tersimpan terpisah (kolom `orders.shipping_kecamatan`) — dipakai lebih dulu. */
  shipping_kecamatan?: string | null;
  shipping_postal_code?: string | null;
  total: number;
  weight?: number | null;
  /** Layanan tersimpan (`orders.shipping_method`) — dipakai menolak resi otomatis untuk HBO. */
  shipping_method?: string | null;
  payment_method?: string | null;
  /** Ongkir yang ditagih ke pembeli — dipakai menebak layanan J&T yang harus dipakai resinya. */
  shipping_cost?: number | null;
  /**
   * Tarif J&T SEBELUM promo ongkir (`orders.shipping_cost_original`). Kalau terisi, inilah yang dicocokkan
   * ke tarif EZ/ECO — `shipping_cost` sudah dipotong promo (bisa Rp0) sehingga tidak bisa dipakai mencocokkan.
   * Kosong (pesanan tanpa promo / lama) = perilaku lama persis.
   */
  shipping_cost_original?: number | null;
  order_items: JntOrderSourceItem[];
}

export interface JntOrderResult {
  success: boolean;
  awbNo: string | null;
  /** Berat (gram) yang dipakai pada resi ini — pemanggil boleh menyimpannya ke pesanan. */
  weightGrams?: number;
  /** Kode layanan J&T yang benar-benar dipakai resi (EZ/ECO) — disimpan ke pesanan. */
  serviceCode?: string;
  raw?: OrderResponse | null;
  error?: string;
}

/**
 * `orders.shipping_city` menyimpan "Kecamatan, Kota" untuk pesanan Open Order (`/api/open-order`)
 * dan bentuk yang sama untuk checkout website. Data lama bisa berisi nama kota saja.
 */
function splitCityDistrict(value: string): { city: string; district: string } {
  const parts = (value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) return { district: parts[0], city: parts.slice(1).join(", ") };
  return { district: "", city: parts[0] || "" };
}

/** COD ditentukan dari metode pembayaran: `payment_methods.method_type`, atau nilai lama `'cod'`. */
async function resolveCod(paymentMethod: string | null | undefined, total: number): Promise<number> {
  if (!paymentMethod) return 0;

  const legacy = legacyPaymentType(paymentMethod);
  if (legacy) return legacy === "cod" ? total : 0;

  if (!isPaymentMethodId(paymentMethod)) return 0;

  const { data } = await getSupabaseAdmin()
    .from("payment_methods")
    .select("method_type")
    .eq("id", paymentMethod)
    .maybeSingle();

  return data?.method_type === "cod" ? total : 0;
}

/**
 * Berat kirim (gram) untuk pesanan yang AKAN dibuatkan resi.
 *
 * Pesanan di tahap ini belum punya resi, jadi beratnya dihitung ULANG dari berat per ukuran
 * (`product_variants.weight`) dengan berat produk sebagai cadangan — fungsi pusat yang sama
 * dengan checkout. Kalau ada item yang beratnya belum diketahui sama sekali, berat tersimpan
 * di pesanan dipakai supaya tidak menebak.
 */
async function resolveWeightGrams(
  order: JntOrderSource,
  items: JntOrderSourceItem[]
): Promise<{ grams: number; recomputed: boolean }> {
  const stored = order.weight && order.weight > 0 ? Number(order.weight) : 0;

  // id produk di tabel ini berupa SLUG (mis. "thobe-navy-karim"), bukan UUID — jangan difilter UUID.
  const productIds = Array.from(new Set(items.map((item) => item.product_id).filter((id): id is string => !!id)));

  let weights: Record<string, number> = {};
  let variantWeights: Record<string, number> = {};
  if (productIds.length > 0) {
    const admin = getSupabaseAdmin();
    const [{ data: pRows }, { data: vRows }] = await Promise.all([
      admin.from("products").select("id, weight").in("id", productIds),
      admin.from("product_variants").select("product_id, color, size, weight").in("product_id", productIds),
    ]);
    weights = productWeightMapFromRows(pRows);
    variantWeights = variantWeightMapFromRows(vRows);
  }

  const { grams, missingQty } = sumWeightGramsBySize(
    items.map((item) => ({
      productId: item.product_id,
      color: item.color,
      size: item.size,
      quantity: item.quantity,
    })),
    weights,
    variantWeights
  );

  // Semua item punya berat → pakai hasil hitung ulang (paling akurat).
  if (missingQty === 0 && grams > 0) return { grams, recomputed: true };
  // Ada yang belum diketahui → pakai berat tersimpan kalau ada (jangan menebak).
  if (stored > 0) return { grams: stored, recomputed: false };
  return { grams: Math.max(grams, DEFAULT_ITEM_WEIGHT), recomputed: false };
}

export async function createJntOrderForOrder(order: JntOrderSource): Promise<JntOrderResult> {
  // Kurir lain (ekspedisi di luar J&T): jangan pernah membuat resi J&T untuknya.
  if (isCustomCourier(order.shipping_method)) {
    return {
      success: false,
      awbNo: null,
      error: "Pesanan ini memakai kurir lain (bukan J&T). Masukkan nomor resinya lewat form resi manual.",
    };
  }

  // Pesanan HBO dibuat manual di J&T VIP: jangan pernah membuat resi lewat API.
  if (isManualService(jntServiceCodeFromShippingMethod(order.shipping_method))) {
    return {
      success: false,
      awbNo: null,
      error: "Pesanan HBO dibuat manual di J&T VIP. Masukkan nomor resinya lewat form resi manual.",
    };
  }

  const items = order.order_items || [];
  const split = splitCityDistrict(order.shipping_city);
  const city = split.city;
  // Kecamatan diambil dari kolom khusus kalau ada (data terverifikasi master wilayah) — baru
  // jatuh ke teks `shipping_city` ("<kecamatan>, <kota>"). Tanpa keduanya, `getReceiverArea`
  // memakai kecamatan PERTAMA kota itu, dan kode area resi bisa salah.
  const district = String(order.shipping_kecamatan || "").trim() || split.district;

  const receiverName = (order.customer_name || "").trim();
  const whatsapp = (order.customer_whatsapp || "").trim();
  const address = (order.shipping_address || "").trim();

  if (!receiverName || !whatsapp || !address || !city) {
    return {
      success: false,
      awbNo: null,
      error: "Data pengiriman pesanan belum lengkap (nama, WhatsApp, alamat, atau kota kosong).",
    };
  }

  const total = Math.max(0, Math.round(Number(order.total) || 0));
  const totalQty = items.reduce((sum, item) => sum + (item.quantity || 1), 0);
  const resolved = await resolveWeightGrams(order, items);
  const weightGrams = resolved.grams;

  // Layanan resi harus SAMA dengan layanan yang ditagih ke pembeli (EZ atau ECO): kalau tidak,
  // toko bisa menanggung selisihnya. Ongkir yang tersimpan di pesanan dicocokkan dengan tarif
  // EZ/ECO untuk rute ini; kalau tidak ada yang cocok (atau ongkir tidak tersimpan), pakai EZ —
  // persis perilaku lama.
  const beratKg = Math.max(weightGrams / 1000, 0.1);
  let serviceCode = "EZ";
  const biayaOngkir = Math.round(Number(order.shipping_cost_original) || Number(order.shipping_cost) || 0);
  if (biayaOngkir > 0) {
    try {
      const tarif = await checkTariffSemua({
        weight: beratKg,
        originCode: getSendSiteCode(SAMAQU_ORIGIN.city) || SAMAQU_ORIGIN.city,
        destAreaCode: resolveTariffCodes(city, district).destAreaCode,
      });
      const cocok = tarif.filter((option) => Math.abs(option.cost - biayaOngkir) <= 1000);
      if (cocok.length === 1) serviceCode = cocok[0].serviceCode;
    } catch (error) {
      console.error("[J&T] Gagal mencocokkan layanan resi, memakai EZ:", error);
    }
  }

  const result = await createOrder({
    orderId: order.order_number,
    shipperName: SAMAQU_ORIGIN.name,
    shipperPhone: SAMAQU_ORIGIN.phone,
    shipperAddress: SAMAQU_ORIGIN.address,
    originCode: getOriginCode(SAMAQU_ORIGIN.city) || "DPK",
    receiverName: receiverName.slice(0, 30),
    receiverPhone: whatsapp.startsWith("+") ? whatsapp : `+62${whatsapp.replace(/^0/, "")}`,
    receiverAddress: address.slice(0, 200),
    receiverZip: order.shipping_postal_code || "00000",
    destinationCode: getDestinationCode(city, district) || "",
    receiverArea: getReceiverArea(city, district) || "",
    qty: totalQty || 1,
    weight: Math.max(weightGrams / 1000, 0.1),
    goodsDesc: (items[0]?.product_name || "Pesanan SAMAQU").slice(0, 40),
    itemName: items.map((item) => item.product_name).join(" ").slice(0, 50),
    goodsValue: total,
    cod: await resolveCod(order.payment_method, total),
    expressType: expressTypeUntuk(serviceCode),
  });

  if (!result.success || !result.awbNo) {
    const detail = result.raw?.detail?.[0];
    return {
      success: false,
      awbNo: null,
      raw: result.raw,
      error: detail?.reason || result.raw?.desc || "J&T menolak pembuatan nomor resi.",
    };
  }

  return { success: true, awbNo: result.awbNo, weightGrams, serviceCode, raw: result.raw };
}
