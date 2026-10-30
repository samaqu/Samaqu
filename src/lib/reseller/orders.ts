/**
 * Pesanan reseller — pembuatan, daftar, detail.
 *
 * Pembuatan SEPENUHNYA di database lewat RPC `samaqu_reseller_create_order`
 * (satu transaksi: stok → saldo → order + item + kekurangan). Kode di file
 * ini hanya memvalidasi input, menghitung ulang harga/berat/ongkir dari
 * database, lalu memanggil RPC. Harga dari browser tidak pernah dipercaya.
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifyJntShipping } from "@/lib/shipping-verify";
import { sumWeightGramsBySize, productWeightMapFromRows, variantWeightMapFromRows } from "@/lib/shipping-weight";
import { orderItemPhoto } from "@/lib/order-photo";
import { loadOrderPhotoLookup } from "@/lib/order-photo-data";
import { notifyAdminNewOrder } from "@/lib/fonnte";
import { resellerBuyPrice, resellerMinSellPrice } from "./pricing";
import { getResellerSettings } from "./settings";
import { notifyResellerOrderCreated } from "./notify";
import type { ResellerRow } from "./types";

const MAX_ITEMS = 30;
const MAX_QTY = 99;

export interface ResellerOrderItemInput {
  productId: string;
  color: string;
  size: string;
  quantity: number;
  /** Harga jual reseller ke pelanggannya (di atas batas harga jual). */
  sellPrice: number;
}

export interface ResellerOrderInput {
  items: ResellerOrderItemInput[];
  customer: {
    name: string;
    whatsapp: string;
  };
  shipping: {
    address: string;
    city: string;
    district: string;
    province?: string;
    postalCode?: string;
    notes?: string;
    method: string;
    cost: number;
    /** Berat cadangan dari klien — hanya dipakai kalau data berat di DB tidak lengkap. */
    weight?: number;
  };
  showResellerNameOnLabel: boolean;
}

export type CreateResellerOrderResult =
  | {
      ok: true;
      orderNumber: string;
      orderId: string;
      total: number;
      subtotal: number;
      shippingCost: number;
      balanceDeduction: number;
      shortfall: number;
      status: string;
    }
  | { ok: false; error: string; status: number };

/** Nomor pesanan reseller: RSL-YYYYMMDD-NNN (pola yang sama dengan SMQ-). */
function generateResellerOrderNumber(): string {
  const d = new Date();
  return `RSL-${d.toISOString().slice(0, 10).replace(/-/g, "")}-${String(Math.floor(Math.random() * 900) + 100)}`;
}

interface ProductRow {
  id: string;
  name: string;
  price: number;
  reseller_enabled: boolean;
  reseller_discount_percent: number | string | null;
  series: string | null;
  image: string | null;
  jenis_kain?: { name?: string | null } | null;
}

interface ValidatedItem {
  productId: string;
  name: string;
  series: string | null;
  kain: string | null;
  image: string | null;
  color: string;
  size: string;
  quantity: number;
  buyPrice: number;
  sellPrice: number;
}

export async function createResellerOrder(
  reseller: ResellerRow,
  input: ResellerOrderInput
): Promise<CreateResellerOrderResult> {
  const supabase = getSupabaseAdmin();

  const items = input?.items;
  const customer = input?.customer;
  const shipping = input?.shipping;

  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS) {
    return { ok: false, error: "Item pesanan tidak valid", status: 400 };
  }
  if (!customer?.name || !customer?.whatsapp) {
    return { ok: false, error: "Data penerima tidak lengkap", status: 400 };
  }
  if (!shipping?.address || !shipping?.city || !shipping?.district) {
    return { ok: false, error: "Alamat pengiriman tidak lengkap", status: 400 };
  }

  // ── Produk & harga: dihitung ulang dari database ──
  const productIds = [...new Set(items.map((i) => String(i?.productId || "").trim()).filter(Boolean))];
  const settings = await getResellerSettings();
  const defaultDiscount = settings.defaultDiscountPercent;

  const { data: productRows, error: productsError } = await supabase
    .from("products")
    .select(
      "id, name, price, reseller_enabled, reseller_discount_percent, series, image, jenis_kain_id, jenis_kain(name)"
    )
    .in("id", productIds);

  if (productsError) {
    console.error("[RESELLER-ORDER] Gagal membaca produk:", productsError.message);
    return { ok: false, error: "Gagal memvalidasi produk", status: 500 };
  }

  const productsById = new Map<string, ProductRow>(
    (productRows ?? []).map((row) => [String(row.id), row as ProductRow])
  );

  const validated: ValidatedItem[] = [];

  for (const raw of items) {
    const product = productsById.get(String(raw?.productId || "").trim());
    if (!product) {
      return { ok: false, error: "Produk tidak ditemukan", status: 400 };
    }
    // Hanya series yang diaktifkan admin di tab Produk & Harga yang bisa dipesan.
    if (product.reseller_enabled !== true) {
      return { ok: false, error: `"${product.name}" tidak dijual ke reseller`, status: 400 };
    }

    const quantity = Math.round(Number(raw?.quantity));
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) {
      return { ok: false, error: `Jumlah untuk "${product.name}" tidak valid`, status: 400 };
    }

    const color = String(raw?.color || "").trim();
    const size = String(raw?.size || "").trim();
    if (!color || !size) {
      return { ok: false, error: `Warna/ukuran untuk "${product.name}" tidak lengkap`, status: 400 };
    }

    const buyPrice = resellerBuyPrice(product, defaultDiscount);
    const minSell = resellerMinSellPrice(product, defaultDiscount);
    const sellPrice = Math.round(Number(raw?.sellPrice));
    if (!Number.isFinite(sellPrice) || sellPrice < minSell) {
      return {
        ok: false,
        error: `Harga jual minimal Rp ${minSell.toLocaleString("id-ID")} (harga beli kamu)`,
        status: 400,
      };
    }

    validated.push({
      productId: product.id,
      name: product.name,
      series: product.series ?? null,
      kain: product.jenis_kain?.name ?? null,
      image: product.image ?? null,
      color,
      size,
      quantity,
      buyPrice,
      sellPrice,
    });
  }

  const subtotal = validated.reduce((sum, item) => sum + item.buyPrice * item.quantity, 0);

  // ── Berat kirim: dihitung ulang dari database (fungsi yang sama dengan checkout) ──
  const weightIds = [...new Set(validated.map((i) => i.productId))];
  const [{ data: pRows }, { data: vRows }] = await Promise.all([
    supabase.from("products").select("id, weight").in("id", weightIds),
    supabase.from("product_variants").select("product_id, color, size, weight").in("product_id", weightIds),
  ]);
  const productWeights = productWeightMapFromRows(pRows);
  const variantWeights = variantWeightMapFromRows(vRows);
  const { grams: serverWeight, missingQty } = sumWeightGramsBySize(
    validated.map((i) => ({ productId: i.productId, color: i.color, size: i.size, quantity: i.quantity })),
    productWeights,
    variantWeights
  );
  const weightGrams =
    missingQty === 0
      ? Math.max(300, serverWeight)
      : Math.max(300, Number(shipping.weight) || serverWeight || 0);

  // ── Ongkir diverifikasi ke tarif J&T (bukan dari body) ──
  const shippingCheck = await verifyJntShipping({
    city: shipping.city,
    district: shipping.district,
    weightGrams,
    method: shipping.method,
    cost: shipping.cost,
  });
  if (!shippingCheck.ok) {
    return { ok: false, error: shippingCheck.error, status: shippingCheck.status };
  }

  const total = subtotal + shippingCheck.cost;

  // ── Foto item (snapshot seperti checkout) ──
  const photoLookup = await loadOrderPhotoLookup(validated.map((i) => i.productId));

  const itemsJsonb = validated.map((item) => ({
    product_id: item.productId,
    product_name: item.name,
    series: item.series,
    kain: item.kain,
    image:
      item.image ||
      orderItemPhoto(
        { product_id: item.productId, product_name: item.name, color: item.color, kain: item.kain, series: item.series },
        photoLookup
      ) ||
      null,
    color: item.color,
    size: item.size,
    quantity: item.quantity,
    buy_price: item.buyPrice,
    sell_price: item.sellPrice,
  }));

  const shippingCity = [shipping.district, shipping.city].filter(Boolean).join(", ");

  // ── RPC atomik (stok + saldo + order + item + kekurangan dalam SATU transaksi) ──
  // Kalau nomor pesanan bentrok (unik), coba sekali lagi dengan nomor baru.
  const rpcParams = {
    p_reseller_id: reseller.id,
    p_items: itemsJsonb,
    p_customer_name: String(customer.name).trim(),
    p_customer_whatsapp: String(customer.whatsapp).trim(),
    p_shipping_address: String(shipping.address).trim(),
    p_shipping_city: shippingCity,
    p_shipping_kecamatan: String(shipping.district || "").trim() || null,
    p_shipping_province: String(shipping.province || "").trim() || null,
    p_shipping_postal_code: String(shipping.postalCode || "").trim() || null,
    p_shipping_notes: String(shipping.notes || "").trim() || null,
    p_shipping_method: shippingCheck.method,
    p_shipping_cost: shippingCheck.cost,
    p_weight: weightGrams,
    p_subtotal: subtotal,
    p_total: total,
    p_show_label: input.showResellerNameOnLabel === true,
    p_created_by: "reseller",
  };

  let orderNumber = generateResellerOrderNumber();
  interface RpcResult {
    ok: boolean;
    order_id: string;
    balance_deduction: number;
    shortfall: number;
    status: string;
  }
  let rpcResult: RpcResult | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabase.rpc("samaqu_reseller_create_order", {
      ...rpcParams,
      p_order_number: orderNumber,
    });
    if (!error && data) {
      rpcResult = data as RpcResult;
      break;
    }
    // Nomor bentrok (unik) → ulangi sekali; error lain langsung dilaporkan.
    const isDuplicate =
      (error as { code?: string; message?: string } | null)?.code === "23505" &&
      /order_number/i.test((error as { message?: string }).message || "");
    if (!isDuplicate) {
      console.error("[RESELLER-ORDER] RPC gagal:", error?.message || error);
      return { ok: false, error: "Gagal menyimpan pesanan. Coba lagi.", status: 500 };
    }
    orderNumber = generateResellerOrderNumber();
  }

  if (!rpcResult) {
    return { ok: false, error: "Gagal menyimpan pesanan. Coba lagi.", status: 500 };
  }

  // Notifikasi ke reseller (bukan customer akhir — dropship). Tidak pernah
  // menggagalkan pesanan yang sudah tersimpan.
  await Promise.allSettled([
    notifyResellerOrderCreated(reseller.id, orderNumber, rpcResult.shortfall || 0, total),
    // Admin tetap perlu tahu ada pesanan reseller masuk (tanpa harga jual reseller).
    notifyAdminNewOrder({
      orderNumber,
      customerName: String(customer.name).trim(),
      customerWhatsapp: String(customer.whatsapp).trim(),
      total,
      paymentType: "Saldo reseller",
      items: validated.map((item) => ({
        name: item.name,
        series: item.series,
        kain: item.kain,
        color: item.color,
        size: item.size,
        quantity: item.quantity,
        price: item.buyPrice,
      })),
      shippingCity,
      source: `Reseller${reseller.store_name ? ` — ${reseller.store_name}` : ""}`,
    }),
  ]);

  return {
    ok: true,
    orderNumber,
    orderId: rpcResult.order_id,
    total,
    subtotal,
    shippingCost: shippingCheck.cost,
    balanceDeduction: rpcResult.balance_deduction,
    shortfall: rpcResult.shortfall,
    status: rpcResult.status,
  };
}

/* ── Daftar & detail ── */

const ORDER_LIST_COLUMNS =
  "id, order_number, status, shipping_status, created_at, total, customer_name, shipping_city, awb_no, tracking_status_code, reseller_shortfall_amount, reseller_shortfall_status";

export async function listResellerOrders(
  resellerId: string,
  page: number,
  pageSize: number
): Promise<{ rows: unknown[]; total: number } | { error: string }> {
  const safePage = Math.max(1, Math.round(Number(page) || 1));
  const safeSize = Math.min(50, Math.max(1, Math.round(Number(pageSize) || 10)));
  const from = (safePage - 1) * safeSize;
  const to = from + safeSize - 1;

  const supabase = getSupabaseAdmin();
  const [{ data, error, count }, { count: totalCount, error: countError }] = await Promise.all([
    supabase
      .from("orders")
      .select(ORDER_LIST_COLUMNS, { count: "exact" })
      .eq("reseller_id", resellerId)
      .order("created_at", { ascending: false })
      .range(from, to),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("reseller_id", resellerId),
  ]);

  if (error || countError) {
    console.error("[RESELLER-ORDER] Gagal membaca daftar pesanan:", error?.message || countError?.message);
    return { error: "Gagal memuat daftar pesanan" };
  }

  return { rows: data ?? [], total: totalCount ?? count ?? 0 };
}

export async function getResellerOrderDetail(
  resellerId: string,
  orderNumber: string
): Promise<unknown | null> {
  const supabase = getSupabaseAdmin();
  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, shipping_status, payment_status, created_at, paid_at, cancelled_at, cancel_reason, subtotal, discount, shipping_cost, shipping_method, total, customer_name, customer_whatsapp, shipping_address, shipping_city, shipping_province, shipping_kecamatan, shipping_postal_code, shipping_notes, awb_no, tracking_status_code, tracking_status_text, tracking_city, tracking_updated_at, reseller_balance_deduction, reseller_shortfall_amount, reseller_shortfall_status, show_reseller_name_on_label, order_items(id, product_id, product_name, product_image, color, size, series, kain, quantity, price, reseller_buy_price, reseller_sell_price)"
    )
    .eq("reseller_id", resellerId)
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (error || !order) return null;

  const [{ data: tracking }, { data: payment }] = await Promise.all([
    supabase
      .from("order_tracking_events")
      .select("status_code, status_text, city_name, event_time")
      .eq("order_id", order.id)
      .order("event_time", { ascending: true }),
    supabase
      .from("reseller_order_payments")
      .select("amount, proof_url, payment_method, status, created_at")
      .eq("order_id", order.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // Batas bayar kekurangan = 24 jam sejak pesanan dibuat — SAMA dengan jendela
  // auto-cancel yang sudah ada (cron tidak diubah; ini hanya tampilan batas).
  const shortfallDeadline = order.created_at
    ? new Date(new Date(order.created_at as string).getTime() + 24 * 3600 * 1000).toISOString()
    : null;

  return {
    ...order,
    tracking: tracking ?? [],
    shortfall: payment
      ? {
          amount: Number(payment.amount) || 0,
          status: String(payment.status),
          proof_url: (payment.proof_url as string | null) ?? null,
          payment_method: (payment.payment_method as string | null) ?? null,
          deadline: shortfallDeadline,
        }
      : null,
  };
}

/**
 * Upload bukti transfer kekurangan — hanya untuk pesanan milik reseller
 * yang masih menunggu bukti (status kekurangan `pending`).
 */
export async function uploadShortfallProof(
  resellerId: string,
  orderNumber: string,
  proofUrl: string,
  paymentMethod: "bsi" | "qris" = "bsi"
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const url = String(proofUrl || "").trim();
  if (!/^https?:\/\/\S+$/i.test(url)) {
    return { ok: false, error: "URL bukti tidak valid", status: 400 };
  }

  const supabase = getSupabaseAdmin();
  const { data: order } = await supabase
    .from("orders")
    .select("id, status, created_at, reseller_shortfall_status")
    .eq("reseller_id", resellerId)
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (!order) return { ok: false, error: "Pesanan tidak ditemukan", status: 404 };
  if (order.status !== "pending" || order.reseller_shortfall_status !== "pending") {
    return { ok: false, error: "Pesanan ini tidak menunggu bukti pembayaran kekurangan", status: 400 };
  }
  // Lewat 24 jam = jendela auto-cancel; bukti tidak diterima lagi (cron tetap yang membatalkan).
  const deadline = new Date(order.created_at as string).getTime() + 24 * 3600 * 1000;
  if (Date.now() > deadline) {
    return { ok: false, error: "Waktu pembayaran habis. Pesanan dibatalkan otomatis.", status: 410 };
  }

  const { error } = await supabase
    .from("reseller_order_payments")
    .update({ proof_url: url, payment_method: paymentMethod })
    .eq("order_id", order.id)
    .eq("status", "pending");

  if (error) {
    console.error("[RESELLER-ORDER] Gagal menyimpan bukti:", error.message);
    return { ok: false, error: "Gagal menyimpan bukti", status: 500 };
  }

  return { ok: true };
}
