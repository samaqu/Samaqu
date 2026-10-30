"use client";

/**
 * Satu-satunya pemanggil API admin reseller (`/api/ops/reseller/**`) dari browser.
 * Token sesi Supabase admin dipakai sebagai Bearer — server memverifikasi `isOpsAdmin`.
 */

import { supabase } from "@/lib/supabase";

export class AdminApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
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
    try {
      const json = JSON.parse(text);
      if (json?.error) message = json.error;
    } catch {
      /* pesan default */
    }
    throw new AdminApiError(message, res.status);
  }

  return (await res.json()) as T;
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
  saldo?: { saldo_tersedia: number; saldo_ditahan: number; saldo_total: number };
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

export interface LedgerRow {
  id: number;
  reseller_id: string;
  type: string;
  amount: number;
  balance_after: number;
  reference: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  resellers: { store_name: string; owner_name: string } | null;
}

export interface CatalogRow {
  id: string;
  name: string;
  category: string;
  series: string | null;
  /** Foto utama (product_images → images → image, tanpa video). */
  thumbnail: string | null;
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
  ledger: {
    id: number;
    type: string;
    amount: number;
    balance_after: number;
    note: string | null;
    created_at: string;
  }[];
  orders: { id: string; order_number: string; status: string; total: number; customer_name: string | null; created_at: string }[];
}

export interface ResellerSettings {
  defaultDiscountPercent: number;
  adminFeeNonBsi: number;
  bsiBankName: string;
  bsiAccountNumber: string;
  bsiAccountHolder: string;
  qrisImageUrl: string | null;
}

/* ── Pemanggil endpoint ── */

export const opsResellerApi = {
  stats: () => adminFetch<ResellerStats>("/api/ops/reseller/stats"),

  queue: () => adminFetch<QueuePayload>("/api/ops/reseller/queue"),

  resellers: () => adminFetch<{ data: ResellerAdminRow[] }>("/api/ops/reseller/resellers"),

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

  updateSettings: (payload: Record<string, unknown>) =>
    adminFetch<{ ok: true }>("/api/ops/reseller/settings", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
};
