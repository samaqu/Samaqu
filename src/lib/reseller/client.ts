"use client";

/**
 * Satu-satunya pemanggil API reseller dari browser (tahap 2: /api/reseller/**).
 * Token sesi disimpan di localStorage — reseller tidak memakai Supabase Auth.
 */

const TOKEN_KEY = "samaqu:reseller-token";

export function getResellerToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setResellerToken(token: string): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* penyimpanan diblokir — sesi hanya berlaku sampai tab ditutup */
  }
}

export function clearResellerToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* abaikan */
  }
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    // Harga & saldo bisa berubah kapan saja dari admin — jangan pakai cache browser.
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getResellerToken()}`,
      ...(init?.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = `HTTP ${res.status}`;
    try {
      const json = JSON.parse(text);
      if (json?.error) message = json.error;
    } catch {
      /* pesan default */
    }
    throw new ApiError(message, res.status);
  }

  return (await res.json()) as T;
}

/* ── Tipe respons ── */

export interface ResellerProfile {
  id: string;
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
}

export interface ResellerBalanceView {
  saldo_tersedia: number;
  saldo_ditahan: number;
  saldo_total: number;
}

export interface ResellerSettingsView {
  admin_fee_non_bsi: number;
  bsi_bank_name: string;
  bsi_account_number: string;
  bsi_account_holder: string;
  /** Gambar QRIS untuk top up & bayar kekurangan (null = belum diatur admin). */
  qris_image_url: string | null;
  rekening_bsi: boolean;
}

export interface MeResponse {
  reseller: ResellerProfile;
  saldo: ResellerBalanceView;
  pengaturan: ResellerSettingsView;
}

export interface KatalogVariant {
  color: string;
  hex: string | null;
  size: string;
  stock: number;
}

export interface KatalogProduct {
  id: string;
  name: string;
  category: string;
  series: string | null;
  image: string | null;
  price: number;
  discount_percent: number;
  buy_price: number;
  min_sell_price: number;
  variants: KatalogVariant[];
}

export interface LedgerRow {
  id: number;
  type: string;
  amount: number;
  balance_after: number;
  reference: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  /** Status terkini penarikan (untuk baris withdrawal_hold / withdrawal_release). */
  withdrawal?: {
    status: "pending" | "paid" | "rejected";
    bank_name: string | null;
    bank_last4: string;
    transfer_amount: number;
    admin_fee: number;
    created_at: string;
    paid_at: string | null;
    reject_reason: string | null;
  } | null;
  /** Status terkini top up (untuk baris topup). */
  topup?: { status: string; reviewed_at: string | null } | null;
}

export interface TopupRow {
  id: string;
  code: string;
  amount: number;
  proof_url: string | null;
  payment_method: string | null;
  status: string;
  reject_reason: string | null;
  reviewed_at: string | null;
  /** Batas waktu bayar (ISO) — hanya untuk status menunggu_bayar. */
  pay_deadline: string | null;
  created_at: string;
}

export interface WithdrawalRow {
  id: string;
  amount: number;
  bank_name: string;
  bank_number: string;
  is_bsi: boolean;
  admin_fee: number;
  transfer_amount: number;
  status: string;
  reject_reason: string | null;
  reviewed_at: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface OrderListRow {
  id: string;
  order_number: string;
  status: string;
  shipping_status: string | null;
  created_at: string;
  total: number;
  customer_name: string | null;
  shipping_city: string | null;
  awb_no: string | null;
  tracking_status_code: number | null;
  reseller_shortfall_amount: number;
  reseller_shortfall_status: string;
}

export interface OrderItemDetail {
  id: string;
  product_id: string;
  product_name: string;
  product_image: string | null;
  color: string | null;
  size: string | null;
  series: string | null;
  kain: string | null;
  quantity: number;
  price: number;
  reseller_buy_price: number | null;
  reseller_sell_price: number | null;
}

export interface OrderDetail extends OrderListRow {
  payment_status: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  subtotal: number;
  discount: number;
  shipping_cost: number;
  shipping_method: string;
  customer_whatsapp: string | null;
  shipping_address: string;
  shipping_province: string | null;
  shipping_kecamatan: string | null;
  shipping_postal_code: string | null;
  shipping_notes: string | null;
  tracking_status_text: string | null;
  tracking_city: string | null;
  tracking_updated_at: string | null;
  reseller_balance_deduction: number;
  show_reseller_name_on_label: boolean;
  order_items: OrderItemDetail[];
  tracking: { status_code: number | null; status_text: string | null; city_name: string | null; event_time: string | null }[];
  /** Data pembayaran kekurangan (null kalau pesanan lunas dari saldo). */
  shortfall: {
    amount: number;
    status: string;
    proof_url: string | null;
    payment_method: string | null;
    deadline: string | null;
  } | null;
}

export interface StatsResponse {
  bulan: string;
  pesanan: number;
  pcs: number;
  belanja_modal: number;
  estimasi_untung: number;
  pending_topup: number;
}

export interface ShippingOption {
  courier: string;
  service: string;
  serviceCode: string;
  cost: number;
  etd: string;
}

export interface CreateOrderPayload {
  items: { product_id: string; color: string; size: string; quantity: number; sell_price: number }[];
  customer: { name: string; whatsapp: string };
  shipping: {
    address: string;
    city: string;
    district: string;
    province?: string;
    postalCode?: string;
    notes?: string;
    method: string;
    cost: number;
  };
  show_reseller_name_on_label: boolean;
}

/* ── Pemanggil endpoint ── */

export const resellerApi = {
  requestOtp: (whatsapp: string) =>
    api<{ ok: true; message: string }>("/api/reseller/auth/request-otp", {
      method: "POST",
      body: JSON.stringify({ whatsapp }),
    }),

  verifyOtp: (whatsapp: string, code: string) =>
    api<{ ok: true; token: string; reseller: Pick<ResellerProfile, "id" | "store_name" | "owner_name"> }>(
      "/api/reseller/auth/verify-otp",
      { method: "POST", body: JSON.stringify({ whatsapp, code }) }
    ),

  logout: () => api<{ ok: true }>("/api/reseller/auth/logout", { method: "POST" }),

  me: () => api<MeResponse>("/api/reseller/me"),

  updateBank: (bank: { bank_name: string; bank_number: string; bank_holder: string }) =>
    api<{ ok: true }>("/api/reseller/me", { method: "PATCH", body: JSON.stringify(bank) }),

  katalog: () => api<{ data: KatalogProduct[] }>("/api/reseller/katalog"),

  ledger: (params: { jenis?: string; bulan?: string; page?: number; pageSize?: number }) => {
    const q = new URLSearchParams();
    if (params.jenis) q.set("jenis", params.jenis);
    if (params.bulan) q.set("bulan", params.bulan);
    if (params.page) q.set("page", String(params.page));
    if (params.pageSize) q.set("pageSize", String(params.pageSize));
    return api<{ data: LedgerRow[]; total: number; page: number; pageSize: number }>(
      `/api/reseller/ledger?${q.toString()}`
    );
  },

  topups: () => api<{ data: TopupRow[] }>("/api/reseller/topups"),

  /** Langkah 1: buat top up `menunggu_bayar` (60 menit) lalu lanjut ke halaman bayar. */
  createTopup: (amount: number, paymentMethod: "bsi" | "qris") =>
    api<{ ok: true; code: string; status: string }>("/api/reseller/topups", {
      method: "POST",
      body: JSON.stringify({ amount, payment_method: paymentMethod }),
    }),

  topupDetail: (code: string) =>
    api<{ data: TopupRow }>(`/api/reseller/topups/${encodeURIComponent(code)}`),

  patchTopup: (code: string, body: { action: "submit_proof" | "cancel"; proof_url?: string; payment_method?: "bsi" | "qris" }) =>
    api<{ ok: true; status: string }>(`/api/reseller/topups/${encodeURIComponent(code)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  withdrawals: () => api<{ data: WithdrawalRow[] }>("/api/reseller/withdrawals"),

  createWithdrawal: (amount: number) =>
    api<{ ok: true; withdrawal_id: string; biaya_admin: number; jumlah_ditransfer: number; saldo_setelah: number }>(
      "/api/reseller/withdrawals",
      { method: "POST", body: JSON.stringify({ amount }) }
    ),

  ongkir: (payload: {
    city: string;
    district: string;
    items: { product_id: string; color: string; size: string; quantity: number }[];
  }) =>
    api<{ data: ShippingOption[]; weight?: number; configured?: boolean }>("/api/reseller/ongkir", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  stats: () => api<StatsResponse>("/api/reseller/stats"),

  orders: (params: { page?: number; pageSize?: number } = {}) => {
    const q = new URLSearchParams();
    q.set("page", String(params.page || 1));
    q.set("pageSize", String(params.pageSize || 20));
    return api<{ rows: OrderListRow[]; total: number }>(`/api/reseller/orders?${q.toString()}`);
  },

  createOrder: (payload: CreateOrderPayload) =>
    api<{
      ok: true;
      orderNumber: string;
      orderId: string;
      total: number;
      subtotal: number;
      shippingCost: number;
      balanceDeduction: number;
      shortfall: number;
      status: string;
    }>("/api/reseller/orders", { method: "POST", body: JSON.stringify(payload) }),

  orderDetail: (orderNumber: string) =>
    api<{ data: OrderDetail }>(`/api/reseller/orders/${encodeURIComponent(orderNumber)}`),

  uploadProof: (orderNumber: string, proofUrl: string, paymentMethod: "bsi" | "qris") =>
    api<{ ok: true }>(`/api/reseller/orders/${encodeURIComponent(orderNumber)}/payment-proof`, {
      method: "POST",
      body: JSON.stringify({ proof_url: proofUrl, payment_method: paymentMethod }),
    }),

  alamatTebak: (text: string) =>
    api<{
      name: string;
      whatsapp: string;
      street: string;
      province: string;
      city: string;
      kecamatan: string;
      postal_code: string;
      missing: string[];
      filled: string[];
      notes: string[];
      postal_missing: boolean;
      postal_options: string[];
    }>("/api/reseller/alamat-tebak", { method: "POST", body: JSON.stringify({ text }) }),
};
