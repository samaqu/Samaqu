"use client";

/**
 * Satu-satunya pemanggil API admin reseller (`/api/ops/reseller/**`) dari browser.
 * Token sesi Supabase admin dipakai sebagai Bearer — server memverifikasi `isOpsAdmin`.
 */

import { supabase } from "@/lib/supabase";
import type { LevelSummary, LevelTier } from "@/lib/reseller/level";
import type { MateriRow } from "@/lib/reseller/materi";
import type { RiwayatOrder, RiwayatSummary } from "@/lib/reseller/riwayat";
import type { KatalogProduct, ShippingOption } from "@/lib/reseller/client";
import type { AddressInput, ResellerAddress } from "@/lib/reseller/addresses";
import type {
  LedgerOrderPaymentInfo,
  LedgerTopupInfo,
  LedgerWithdrawalInfo,
} from "@/lib/reseller/format";

export class AdminApiError extends Error {
  status: number;
  /** Kode galat dari server (mis. "possible_duplicate"), kalau ada. */
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.code = code;
  }
}

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const res = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token || ""}`,
      ...(init?.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = `HTTP ${res.status}`;
    let code: string | undefined;
    try {
      const json = JSON.parse(text);
      if (json?.error) message = json.error;
      if (typeof json?.code === "string") code = json.code;
    } catch {
      /* pesan default */
    }
    throw new AdminApiError(message, res.status, code);
  }

  return (await res.json()) as T;
}

/** Filter tab Riwayat Pesanan (dikirim apa adanya sebagai query string). */
export interface RiwayatQuery {
  reseller_id?: string;
  bulan?: string;
  dari?: string;
  sampai?: string;
  status?: string;
  q?: string;
}

export interface RiwayatPayload {
  data: RiwayatOrder[];
  total: number;
  page: number;
  pageSize: number;
  has_more: boolean;
  summary: RiwayatSummary;
}

function riwayatParams(params: RiwayatQuery): URLSearchParams {
  const q = new URLSearchParams();
  (Object.keys(params) as (keyof RiwayatQuery)[]).forEach((key) => {
    const value = params[key];
    if (value) q.set(key, value);
  });
  return q;
}

/** Unduh CSV riwayat (butuh token admin, jadi tidak bisa berupa tautan biasa). */
async function riwayatCsvBlob(params: RiwayatQuery): Promise<{ blob: Blob; filename: string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const q = riwayatParams(params);
  q.set("format", "csv");
  const res = await fetch(`/api/ops/reseller/riwayat?${q.toString()}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${session?.access_token || ""}` },
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const json = await res.json();
      if (json?.error) message = json.error;
    } catch {
      /* pesan default */
    }
    throw new AdminApiError(message, res.status);
  }
  const disposition = res.headers.get("Content-Disposition") || "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] || "riwayat-pesanan-reseller.csv";
  return { blob: await res.blob(), filename };
}

/* ── Buat Pesanan atas nama reseller ── */

export interface AdminBalance {
  saldo_tersedia: number;
  saldo_ditahan: number;
  saldo_total: number;
}

export interface AdminOrderPayload {
  reseller_id: string;
  items: { product_id: string; color: string; size: string; quantity: number; sell_price: number }[];
  customer: { name: string; whatsapp: string };
  shipping: {
    address: string;
    city: string;
    district: string;
    province?: string;
    postalCode?: string;
    notes?: string;
    method?: string;
    cost?: number;
  };
  /** "otomatis" = layanan J&T dipilih sekarang; "menyusul" = ongkir diisi admin belakangan. */
  mode: "otomatis" | "menyusul";
  show_reseller_name_on_label: boolean;
  confirm_duplicate?: boolean;
}

export interface AdminOrderResult {
  ok: true;
  orderNumber: string;
  orderId: string;
  total: number;
  subtotal: number;
  shippingCost: number;
  balanceDeduction: number;
  shortfall: number;
  status: string;
  shippingPending?: true;
}

export interface ShippingFillOptions {
  data?: ShippingOption[];
  weight?: number;
  configured?: boolean;
  error?: string;
  tariff_status?: number;
  order: { order_number: string; total: number; weight: number };
  saldo: AdminBalance;
}

export interface ShippingFillResult {
  ok: true;
  orderNumber: string;
  cost: number;
  method: string;
  balanceDeduction: number;
  shortfall: number;
  total: number;
  status: string;
}

/* ── Tipe ── */

export interface ResellerStats {
  aktif: number;
  total_saldo: number;
  pesanan_bulan_ini: number;
  perlu_dicek: number;
}

export interface ResellerAdminRow {
  id: string;
  user_id: string | null;
  store_name: string;
  owner_name: string;
  whatsapp: string | null;
  city: string | null;
  store_info: string | null;
  social_media: string | null;
  bank_name: string | null;
  bank_number: string | null;
  bank_holder: string | null;
  status: string;
  reject_reason: string | null;
  created_at: string;
  /** Diskon khusus reseller (persen). null = ikut diskon default. */
  discount_percent?: number | string | null;
  saldo?: { saldo_tersedia: number; saldo_ditahan: number; saldo_total: number };
  /** Level Silver/Gold/Platinum (null kalau gagal dihitung). */
  level?: LevelSummary | null;
  /** Level manual dari admin ("silver" | "gold" | "platinum"); kosong = otomatis dari belanja. */
  level_override?: string | null;
}

export interface QueueTopup {
  id: string;
  code: string;
  amount: number;
  proof_url: string | null;
  payment_method: string | null;
  created_at: string;
  reseller_id: string;
  resellers: { store_name: string; owner_name: string; whatsapp: string | null } | null;
}

export interface QueueOrderPayment {
  id: string;
  order_id: string;
  amount: number;
  proof_url: string | null;
  payment_method: string | null;
  created_at: string;
  reseller_id: string;
  resellers: { store_name: string; owner_name: string; whatsapp: string | null } | null;
  orders: { order_number: string; total: number; status: string; reseller_shortfall_status: string } | null;
}

export interface QueueWithdrawal {
  id: string;
  amount: number;
  bank_name: string;
  bank_number: string;
  bank_holder: string;
  is_bsi: boolean;
  admin_fee: number;
  transfer_amount: number;
  created_at: string;
  reseller_id: string;
  resellers: { store_name: string; owner_name: string; whatsapp: string | null } | null;
}

export interface QueuePayload {
  topups: QueueTopup[];
  order_payments: QueueOrderPayment[];
  withdrawals: QueueWithdrawal[];
}

export interface LedgerMutation {
  id: number;
  type: string;
  amount: number;
  balance_after: number;
  reference: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  withdrawal?: LedgerWithdrawalInfo | null;
  topup?: LedgerTopupInfo | null;
  order_payment?: LedgerOrderPaymentInfo | null;
}

export interface LedgerRow extends LedgerMutation {
  reseller_id: string;
  resellers: { store_name: string; owner_name: string } | null;
}

export interface CatalogRow {
  id: string;
  name: string;
  category: string;
  series: string | null;
  kain: string | null;
  price: number;
  is_published: boolean;
  open_order_enabled: boolean;
  created_at: string | null;
  reseller_enabled: boolean;
  reseller_discount_percent: number | null;
  reseller_min_sell_price: number | null;
  buy_price: number;
  min_sell_price: number;
}

export interface CatalogPayload {
  data: CatalogRow[];
  default_discount: number;
}

export interface CatalogUpdate {
  id: string;
  reseller_enabled?: boolean;
  reseller_discount_percent?: number | null;
  reseller_min_sell_price?: number | null;
}

export interface ResellerDetail {
  reseller: ResellerAdminRow;
  saldo: { saldo_tersedia: number; saldo_ditahan: number; saldo_total: number };
  /** Jumlah penarikan berstatus paid (sudah ditransfer). */
  total_withdrawn: number;
  ledger: LedgerMutation[];
  orders: {
    id: string;
    order_number: string;
    status: string;
    total: number;
    customer_name: string | null;
    created_at: string;
    reseller_shortfall_status?: string | null;
  }[];
  level?: LevelSummary | null;
}

export interface ResellerSettings {
  defaultDiscountPercent: number;
  adminFeeNonBsi: number;
  bsiBankName: string;
  bsiAccountNumber: string;
  bsiAccountHolder: string;
  qrisImageUrl: string | null;
  /** Batas level reseller (Silver/Gold/Platinum) yang berlaku sekarang. */
  levels: LevelTier[];
}

/* ── Pemanggil endpoint ── */

export const opsResellerApi = {
  stats: () => adminFetch<ResellerStats>("/api/ops/reseller/stats"),

  queue: () => adminFetch<QueuePayload>("/api/ops/reseller/queue"),

  resellers: () =>
    adminFetch<{ data: ResellerAdminRow[]; default_discount_percent?: number; levels?: LevelTier[] }>("/api/ops/reseller/resellers"),

  resellerDetail: (id: string) => adminFetch<ResellerDetail>(`/api/ops/reseller/resellers/${encodeURIComponent(id)}`),

  createReseller: (payload: Record<string, unknown>) =>
    adminFetch<{ ok: true; id: string }>("/api/ops/reseller/resellers", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateReseller: (id: string, payload: Record<string, unknown>) =>
    adminFetch<{ ok: true }>(`/api/ops/reseller/resellers/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  reviewTopup: (id: string, action: "approve" | "reject", reason?: string) =>
    adminFetch<{ ok: true }>(`/api/ops/reseller/topups/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ action, reason }),
    }),

  reviewOrderPayment: (id: string, action: "approve" | "reject", reason?: string) =>
    adminFetch<{ ok: true; cancelled?: boolean }>(`/api/ops/reseller/order-payments/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ action, reason }),
    }),

  reviewWithdrawal: (id: string, action: "approve" | "reject", reason?: string) =>
    adminFetch<{ ok: true }>(`/api/ops/reseller/withdrawals/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ action, reason }),
    }),

  ledger: (params: { reseller_id?: string; jenis?: string; bulan?: string; page?: number; pageSize?: number }) => {
    const q = new URLSearchParams();
    if (params.reseller_id) q.set("reseller_id", params.reseller_id);
    if (params.jenis) q.set("jenis", params.jenis);
    if (params.bulan) q.set("bulan", params.bulan);
    q.set("page", String(params.page || 1));
    q.set("pageSize", String(params.pageSize || 50));
    return adminFetch<{ data: LedgerRow[]; total: number }>(`/api/ops/reseller/ledger?${q.toString()}`);
  },

  /* Buat Pesanan atas nama reseller (admin) */
  orderKatalog: (resellerId: string) =>
    adminFetch<{ data: KatalogProduct[]; saldo: AdminBalance }>(
      `/api/ops/reseller/orders/katalog?reseller_id=${encodeURIComponent(resellerId)}`
    ),
  orderOngkir: (payload: {
    city: string;
    district: string;
    items: { product_id: string; color: string; size: string; quantity: number }[];
  }) =>
    adminFetch<{ data: ShippingOption[]; weight?: number; configured?: boolean }>("/api/ops/reseller/orders/ongkir", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  createOrder: (payload: AdminOrderPayload) =>
    adminFetch<AdminOrderResult>("/api/ops/reseller/orders", { method: "POST", body: JSON.stringify(payload) }),
  shippingOptions: (orderNumber: string) =>
    adminFetch<ShippingFillOptions>(`/api/ops/reseller/orders/${encodeURIComponent(orderNumber)}/ongkir`),
  fillShipping: (
    orderNumber: string,
    payload: { method: string; cost: number; custom?: { name: string; service: string } }
  ) =>
    adminFetch<ShippingFillResult>(`/api/ops/reseller/orders/${encodeURIComponent(orderNumber)}/ongkir`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  /** Baca alamat dari teks tempelan — pendeteksi yang sama dengan form Transaksi (`/api/ops/alamat-tebak`). */
  alamatTebak: (text: string) =>
    adminFetch<Awaited<ReturnType<typeof import("@/lib/reseller/client").resellerApi.alamatTebak>>>(
      "/api/ops/alamat-tebak",
      { method: "POST", body: JSON.stringify({ text }) }
    ),

  /* Buku alamat reseller (admin) */
  resellerAddresses: (resellerId: string) =>
    adminFetch<{ data: ResellerAddress[] }>(`/api/ops/reseller/resellers/${encodeURIComponent(resellerId)}/addresses`),
  addAddress: (resellerId: string, payload: AddressInput) =>
    adminFetch<{ ok: true; data: ResellerAddress }>(`/api/ops/reseller/resellers/${encodeURIComponent(resellerId)}/addresses`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateAddress: (resellerId: string, addressId: string, payload: AddressInput) =>
    adminFetch<{ ok: true; data: ResellerAddress }>(
      `/api/ops/reseller/resellers/${encodeURIComponent(resellerId)}/addresses/${encodeURIComponent(addressId)}`,
      { method: "PATCH", body: JSON.stringify(payload) }
    ),
  setDefaultAddress: (resellerId: string, addressId: string) =>
    adminFetch<{ ok: true; data: ResellerAddress }>(
      `/api/ops/reseller/resellers/${encodeURIComponent(resellerId)}/addresses/${encodeURIComponent(addressId)}`,
      { method: "PATCH", body: JSON.stringify({ action: "set_default" }) }
    ),
  deleteAddress: (resellerId: string, addressId: string) =>
    adminFetch<{ ok: true; promoted_id: string | null }>(
      `/api/ops/reseller/resellers/${encodeURIComponent(resellerId)}/addresses/${encodeURIComponent(addressId)}`,
      { method: "DELETE" }
    ),

  /* Riwayat pesanan reseller (baca saja) */
  riwayat: (params: RiwayatQuery & { page?: number; pageSize?: number }) => {
    const q = riwayatParams(params);
    q.set("page", String(params.page || 1));
    q.set("pageSize", String(params.pageSize || 25));
    return adminFetch<RiwayatPayload>(`/api/ops/reseller/riwayat?${q.toString()}`);
  },
  riwayatCsv: (params: RiwayatQuery) => riwayatCsvBlob(params),

  adjust: (payload: { reseller_id: string; amount: number; note: string }) =>
    adminFetch<{ ok: true; saldo_setelah: number }>("/api/ops/reseller/ledger", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  settings: () => adminFetch<{ data: ResellerSettings }>("/api/ops/reseller/settings"),

  catalog: () => adminFetch<CatalogPayload>("/api/ops/reseller/catalog"),

  saveCatalog: (updates: CatalogUpdate[]) =>
    adminFetch<{ ok: true; updated: number }>("/api/ops/reseller/catalog", {
      method: "PATCH",
      body: JSON.stringify({ updates }),
    }),

  /* Materi reseller */
  materi: () => adminFetch<{ data: MateriRow[]; belum_siap?: boolean }>("/api/ops/reseller/materi"),
  createMateri: (payload: Record<string, unknown>) =>
    adminFetch<{ ok: true; data: MateriRow }>("/api/ops/reseller/materi", { method: "POST", body: JSON.stringify(payload) }),
  updateMateri: (id: string, payload: Record<string, unknown>) =>
    adminFetch<{ ok: true; data: MateriRow }>(`/api/ops/reseller/materi/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteMateri: (id: string) =>
    adminFetch<{ ok: true }>(`/api/ops/reseller/materi/${encodeURIComponent(id)}`, { method: "DELETE" }),

  updateSettings: (payload: Record<string, unknown>) =>
    adminFetch<{ ok: true }>("/api/ops/reseller/settings", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
};
