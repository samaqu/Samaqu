import { isPastDeadline } from "@/lib/reseller/deadline";
import type { PaymentPageStatus } from "./types";

type OrderPaymentStatusInput = {
  kind: "order";
  /** Status reseller_order_payments: pending/approved/rejected. */
  status: string;
  proofUrl: string | null;
  /** Status pesanan: pending/diproses/dikirim/selesai/dibatalkan. */
  orderStatus: string;
  deadlineIso: string | null;
};

type TopupPaymentStatusInput = {
  kind: "topup";
  /** Status reseller_topups: menunggu_bayar/pending/approved/rejected/kedaluwarsa/dibatalkan. */
  status: string;
  proofUrl: string | null;
  deadlineIso: string | null;
};

export type PaymentStatusInput = OrderPaymentStatusInput | TopupPaymentStatusInput;

/**
 * SATU penentu status halaman bayar (top up & kekurangan pesanan).
 *
 * Khusus pesanan: shortfall `pending` + `proof_url` sudah terisi + pesanan masih
 * pending + belum lewat 24 jam = `submitted` (bukti sudah terkirim).
 * Semua status lain tetap seperti sebelumnya.
 */
export function resolvePaymentPageStatus(
  input: PaymentStatusInput,
  now: number = Date.now()
): PaymentPageStatus {
  const expired = isPastDeadline(input.deadlineIso, now);

  if (input.status === "approved") return "approved";
  if (input.status === "rejected") return "rejected";

  if (input.kind === "order") {
    if (input.orderStatus === "dibatalkan") return expired ? "expired" : "cancelled";
    if (input.orderStatus !== "pending") return "approved";
    if (expired) return "expired";
    return input.proofUrl ? "submitted" : "unpaid";
  }

  if (input.status === "kedaluwarsa") return "expired";
  if (input.status === "dibatalkan") return "cancelled";
  if (input.status === "pending") return "submitted";
  if (expired) return "expired";
  return "unpaid";
}
