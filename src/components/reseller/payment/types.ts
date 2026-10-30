/** Metode pembayaran reseller (top up & bayar kekurangan). */
export type PaymentMethodChoice = "bsi" | "qris";

/** Status halaman bayar bersama (top up & kekurangan pesanan). */
export type PaymentPageStatus =
  | "unpaid"
  | "submitted"
  | "approved"
  | "rejected"
  | "expired"
  | "cancelled";
