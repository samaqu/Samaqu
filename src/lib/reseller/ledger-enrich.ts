/**
 * Tempelkan status TERKINI dari tabel sumber ke baris `reseller_ledger`:
 * penarikan, top up, dan pembayaran kekurangan pesanan. Hanya data tampilan —
 * tidak menulis/mengubah saldo atau status apa pun.
 *
 * Dipakai API portal (nomor rekening tersamar) dan API admin
 * (`revealAccount` = nomor lengkap). Aturan labelnya satu: `describeLedgerRow`.
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type {
  LedgerOrderPaymentInfo,
  LedgerTopupInfo,
  LedgerWithdrawalInfo,
} from "./format";

export interface LedgerSourceRow {
  id: number | string;
  type: string;
  reference: string | null;
  created_at: string;
}

export type EnrichedLedgerRow<T extends LedgerSourceRow> = T & {
  withdrawal: LedgerWithdrawalInfo | null;
  topup: LedgerTopupInfo | null;
  order_payment: LedgerOrderPaymentInfo | null;
};

interface WithdrawalSource {
  id: string;
  status: string;
  bank_name: string | null;
  bank_number: string | null;
  admin_fee: number | null;
  transfer_amount: number | null;
  created_at: string;
  paid_at: string | null;
  reviewed_by: string | null;
  reject_reason: string | null;
}

interface TopupSource {
  code: string;
  status: string;
  amount: number | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  reject_reason: string | null;
}

interface OrderRef {
  id: string;
  order_number: string;
}

interface OrderPaymentSource {
  order_id: string;
  status: string;
  amount: number | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  reject_reason: string | null;
}

function uniqueRefs(rows: LedgerSourceRow[], predicate: (row: LedgerSourceRow) => boolean): string[] {
  return [
    ...new Set(
      rows.filter((row) => predicate(row) && row.reference).map((row) => String(row.reference))
    ),
  ];
}

export async function enrichResellerLedger<T extends LedgerSourceRow>(
  rows: T[],
  options: { revealAccount?: boolean } = {}
): Promise<EnrichedLedgerRow<T>[]> {
  if (rows.length === 0) return [];

  const admin = getSupabaseAdmin();
  const withdrawalIds = uniqueRefs(rows, (row) => row.type.startsWith("withdrawal_"));
  const topupCodes = uniqueRefs(rows, (row) => row.type === "topup");
  const orderNumbers = uniqueRefs(rows, (row) => row.type === "order_debit");

  const [withdrawals, topups, orders] = await Promise.all([
    withdrawalIds.length
      ? admin
          .from("reseller_withdrawals")
          .select("id, status, bank_name, bank_number, admin_fee, transfer_amount, created_at, paid_at, reviewed_by, reject_reason")
          .in("id", withdrawalIds)
      : Promise.resolve({ data: [] as WithdrawalSource[] }),
    topupCodes.length
      ? admin
          .from("reseller_topups")
          .select("code, status, amount, created_at, reviewed_at, reviewed_by, reject_reason")
          .in("code", topupCodes)
      : Promise.resolve({ data: [] as TopupSource[] }),
    orderNumbers.length
      ? admin.from("orders").select("id, order_number").in("order_number", orderNumbers)
      : Promise.resolve({ data: [] as OrderRef[] }),
  ]);

  const orderRefs = (orders.data ?? []) as OrderRef[];
  const orderIdByNumber = new Map(orderRefs.map((order) => [String(order.order_number), String(order.id)]));
  const orderIds = [...new Set(orderRefs.map((order) => String(order.id)))];

  const payments = orderIds.length
    ? await admin
        .from("reseller_order_payments")
        .select("order_id, status, amount, created_at, reviewed_at, reviewed_by, reject_reason")
        .in("order_id", orderIds)
        .order("created_at", { ascending: false })
    : { data: [] as OrderPaymentSource[] };

  // Satu pesanan hanya punya satu baris pembayaran kekurangan; kalau ada
  // duplikat historis, pakai yang terbaru.
  const paymentByOrderId = new Map<string, LedgerOrderPaymentInfo>();
  for (const payment of (payments.data ?? []) as OrderPaymentSource[]) {
    const key = String(payment.order_id);
    if (paymentByOrderId.has(key)) continue;
    paymentByOrderId.set(key, {
      status: String(payment.status),
      amount: Number(payment.amount) || 0,
      created_at: payment.created_at,
      reviewed_at: payment.reviewed_at,
      reviewed_by: payment.reviewed_by,
      reject_reason: payment.reject_reason,
    });
  }

  const withdrawalById = new Map<string, LedgerWithdrawalInfo>();
  for (const row of (withdrawals.data ?? []) as WithdrawalSource[]) {
    const digits = String(row.bank_number || "").replace(/\D/g, "");
    const info: LedgerWithdrawalInfo = {
      status: String(row.status) as LedgerWithdrawalInfo["status"],
      bank_name: row.bank_name,
      bank_last4: digits.slice(-4) || "????",
      transfer_amount: Number(row.transfer_amount) || 0,
      admin_fee: Number(row.admin_fee) || 0,
      created_at: row.created_at,
      paid_at: row.paid_at,
      reviewed_by: row.reviewed_by,
      reject_reason: row.reject_reason,
    };
    if (options.revealAccount) info.bank_number = digits || null;
    withdrawalById.set(String(row.id), info);
  }

  const topupByCode = new Map<string, LedgerTopupInfo>();
  for (const row of (topups.data ?? []) as TopupSource[]) {
    topupByCode.set(String(row.code), {
      code: row.code,
      status: String(row.status),
      amount: Number(row.amount) || 0,
      created_at: row.created_at,
      reviewed_at: row.reviewed_at,
      reviewed_by: row.reviewed_by,
      reject_reason: row.reject_reason,
    });
  }

  return rows.map((row) => {
    const reference = row.reference ? String(row.reference) : "";
    const orderId = row.type === "order_debit" && reference ? orderIdByNumber.get(reference) : undefined;
    return {
      ...row,
      withdrawal:
        row.type.startsWith("withdrawal_") && reference
          ? withdrawalById.get(reference) ?? null
          : null,
      topup: row.type === "topup" && reference ? topupByCode.get(reference) ?? null : null,
      order_payment: orderId ? paymentByOrderId.get(orderId) ?? null : null,
    };
  });
}
