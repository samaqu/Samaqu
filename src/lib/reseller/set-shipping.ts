/**
 * "Isi Ongkir" untuk pesanan reseller berstatus "Menunggu ongkir" (dibuat admin dengan mode ongkir
 * menyusul). Tarif J&T DIVERIFIKASI ULANG di server memakai kecamatan + berat yang tersimpan di
 * pesanan (fungsi yang sama dengan pembuatan pesanan), lalu potong saldo dilakukan atomik oleh fungsi
 * database `samaqu_reseller_set_shipping` (baris ledger terpisah; kalau saldo kurang -> jalur bayar
 * kekurangan yang sudah ada).
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifyJntShipping } from "@/lib/shipping-verify";
import { buildCustomCourierMethod, customCourierLabel, CUSTOM_COURIER_MAX_COST } from "@/lib/custom-courier";
import { notifyResellerShippingFilled } from "./notify";

export type SetResellerShippingResult =
  | {
      ok: true;
      orderNumber: string;
      cost: number;
      method: string;
      balanceDeduction: number;
      shortfall: number;
      total: number;
      status: string;
    }
  | { ok: false; error: string; status: number };

/** Data tujuan pesanan yang dibutuhkan untuk menghitung tarif (tersimpan saat pesanan dibuat). */
export interface PendingShippingOrder {
  id: string;
  order_number: string;
  reseller_id: string;
  status: string;
  shipping_pending: boolean | null;
  awb_no: string | null;
  weight: number | null;
  shipping_city: string | null;
  shipping_kecamatan: string | null;
  total: number | null;
}

/**
 * `orders.shipping_city` disimpan "Kecamatan, Kota" (lihat `createResellerOrder`), sedangkan tarif J&T
 * butuh kota dan kecamatan terpisah. Kecamatan ada di kolomnya sendiri; kota = sisanya.
 */
export function cityOfShipping(shippingCity: string | null | undefined, kecamatan: string | null | undefined): string {
  const district = String(kecamatan || "").trim();
  const full = String(shippingCity || "").trim();
  if (district && full.toLowerCase().startsWith(`${district.toLowerCase()}, `)) {
    return full.slice(district.length + 2).trim();
  }
  return full;
}

export async function loadPendingShippingOrder(orderNumber: string): Promise<PendingShippingOrder | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("orders")
    .select("id, order_number, reseller_id, status, shipping_pending, awb_no, weight, shipping_city, shipping_kecamatan, total")
    .eq("order_number", orderNumber)
    .not("reseller_id", "is", null)
    .maybeSingle();
  if (error) {
    console.error("[RESELLER-ONGKIR-ISI] Gagal membaca pesanan:", error.message);
    return null;
  }
  return (data as PendingShippingOrder | null) ?? null;
}

export async function setResellerOrderShipping(input: {
  orderNumber: string;
  /** Layanan J&T (diverifikasi ke tarif). Diabaikan kalau `custom` diisi. */
  method: string;
  cost: number;
  actorEmail: string;
  /** Kurir lain (ekspedisi di luar J&T): nama + layanan isian admin, nominal TIDAK diverifikasi ke tarif. */
  custom?: { name?: unknown; service?: unknown } | null;
}): Promise<SetResellerShippingResult> {
  const orderNumber = String(input.orderNumber || "").trim();
  let method = String(input.method || "").trim();
  const cost = Math.round(Number(input.cost));
  const actor = String(input.actorEmail || "").trim();
  const isCustom = input.custom !== undefined && input.custom !== null;

  if (!orderNumber) return { ok: false, error: "Nomor pesanan wajib", status: 400 };
  if (isCustom) {
    const built = buildCustomCourierMethod(input.custom?.name, input.custom?.service);
    if (!built.ok) return { ok: false, error: built.error, status: 400 };
    method = built.method;
  } else if (!method) {
    return { ok: false, error: "Pilih layanan pengiriman terlebih dahulu.", status: 400 };
  }
  if (!Number.isFinite(cost) || cost <= 0) return { ok: false, error: "Ongkir tidak valid.", status: 400 };
  if (isCustom && cost > CUSTOM_COURIER_MAX_COST) {
    return {
      ok: false,
      error: `Ongkir kurir lain terlalu besar (maksimal Rp${CUSTOM_COURIER_MAX_COST.toLocaleString("id-ID")}). Periksa angkanya.`,
      status: 400,
    };
  }
  if (!actor) return { ok: false, error: "Admin pengisi ongkir tidak dikenali.", status: 401 };

  const order = await loadPendingShippingOrder(orderNumber);
  if (!order) return { ok: false, error: "Pesanan reseller tidak ditemukan.", status: 404 };
  if (order.status === "dibatalkan") return { ok: false, error: "Pesanan sudah dibatalkan.", status: 409 };
  if (order.shipping_pending !== true) {
    return { ok: false, error: "Pesanan ini tidak menunggu ongkir.", status: 409 };
  }
  if (String(order.awb_no || "").trim()) return { ok: false, error: "Pesanan sudah punya resi.", status: 409 };

  // J&T: tarif diverifikasi ke J&T (bukan dari body): layanan harus dikenal dan biaya harus cocok.
  // Kurir lain: tidak ada tarif untuk dicocokkan — nominal isian admin dipakai apa adanya (sudah dipagari di atas),
  // dan tercatat atas nama admin pengisi di ledger lewat `p_actor`.
  const check = isCustom
    ? ({ ok: true, method, cost } as const)
    : await verifyJntShipping({
        city: cityOfShipping(order.shipping_city, order.shipping_kecamatan),
        district: order.shipping_kecamatan,
        weightGrams: Math.max(300, Number(order.weight) || 0),
        method,
        cost,
      });
  if (!check.ok) return { ok: false, error: check.error, status: check.status };

  const { data, error } = await getSupabaseAdmin().rpc("samaqu_reseller_set_shipping", {
    p_order_number: orderNumber,
    p_method: check.method,
    p_cost: check.cost,
    p_actor: actor,
  });

  if (error || !data) {
    const message = String(error?.message || "");
    console.error("[RESELLER-ONGKIR-ISI] RPC gagal:", orderNumber, message);
    // Pesan dari fungsi database sudah berbahasa Indonesia dan aman ditampilkan ke admin.
    const known =
      /tidak menunggu ongkir|sudah dibatalkan|sudah punya resi|tidak ditemukan|lebih dari 0|wajib/i.test(message);
    return {
      ok: false,
      error: known ? message : "Gagal menyimpan ongkir. Coba lagi.",
      status: known ? 409 : 500,
    };
  }

  const result = data as { balance_deduction: number; shortfall: number; total: number; status: string };

  // WA ke reseller; tidak pernah menggagalkan ongkir yang sudah tersimpan.
  await Promise.allSettled([
    notifyResellerShippingFilled(order.reseller_id, orderNumber, {
      cost: check.cost,
      shortfall: Number(result.shortfall) || 0,
      total: Number(result.total) || 0,
      // Nama ekspedisi hanya disebut untuk kurir lain (teks WA J&T tetap seperti semula).
      ...(isCustom ? { courier: customCourierLabel(check.method) } : {}),
    }),
  ]);

  return {
    ok: true,
    orderNumber,
    cost: check.cost,
    method: check.method,
    balanceDeduction: Number(result.balance_deduction) || 0,
    shortfall: Number(result.shortfall) || 0,
    total: Number(result.total) || 0,
    status: String(result.status),
  };
}
