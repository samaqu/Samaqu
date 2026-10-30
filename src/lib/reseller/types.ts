/**
 * Tipe bersama modul Reseller SAMAQU.
 *
 * Semua baris tabel reseller dibaca lewat service role (server-side) lalu
 * difilter per-reseller sebelum dikirim ke browser — pola yang sama dengan
 * modul affiliate (lihat src/lib/affiliate/auth.ts).
 *
 * Skema: supabase/migrations/20261030_reseller.sql
 */

export type ResellerStatus = "pending" | "active" | "rejected" | "suspended";

export type TopupStatus = "pending" | "approved" | "rejected";

export type WithdrawalStatus = "pending" | "paid" | "rejected";

export type OrderPaymentStatus = "pending" | "approved" | "rejected";

export type ResellerShortfallStatus = "none" | "pending" | "approved" | "rejected";

export type LedgerType =
  | "topup"
  | "order_debit"
  | "order_refund"
  | "withdrawal_hold"
  | "withdrawal_release"
  | "adjustment";

export interface ResellerRow {
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
  status: ResellerStatus;
  reject_reason: string | null;
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResellerLedgerRow {
  id: number;
  reseller_id: string;
  type: LedgerType;
  /** Bertanda: + masuk, − keluar. */
  amount: number;
  balance_after: number;
  reference: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ResellerTopupRow {
  id: string;
  /** TOP-YYYYMMDD-NNN */
  code: string;
  reseller_id: string;
  amount: number;
  proof_url: string | null;
  status: TopupStatus;
  reviewed_at: string | null;
  reviewed_by: string | null;
  reject_reason: string | null;
  created_at: string;
}

export interface ResellerWithdrawalRow {
  id: string;
  reseller_id: string;
  amount: number;
  bank_name: string;
  bank_number: string;
  bank_holder: string;
  is_bsi: boolean;
  admin_fee: number;
  transfer_amount: number;
  status: WithdrawalStatus;
  reviewed_at: string | null;
  reviewed_by: string | null;
  reject_reason: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface ResellerOrderPaymentRow {
  id: string;
  order_id: string;
  reseller_id: string;
  amount: number;
  proof_url: string | null;
  status: OrderPaymentStatus;
  reviewed_at: string | null;
  reviewed_by: string | null;
  reject_reason: string | null;
  created_at: string;
}

/** Kolom reseller pada tabel orders (nullable/default untuk pesanan biasa). */
export interface ResellerOrderFields {
  reseller_id: string | null;
  reseller_balance_deduction: number;
  reseller_shortfall_amount: number;
  reseller_shortfall_status: ResellerShortfallStatus;
  show_reseller_name_on_label: boolean;
}

/** Kolom reseller pada tabel order_items. */
export interface ResellerOrderItemFields {
  reseller_buy_price: number | null;
  reseller_sell_price: number | null;
}

/** Pengaturan reseller di store_settings. */
export interface ResellerSettings {
  reseller_admin_fee_non_bsi: number;
  reseller_bsi_bank_name: string;
  reseller_bsi_account_number: string | null;
  reseller_bsi_account_holder: string | null;
}

/** Hasil RPC samaqu_reseller_saldo. */
export interface ResellerBalance {
  saldo_tersedia: number;
  saldo_ditahan: number;
  saldo_total: number;
}
