/** Awalan nomor pesanan reseller (Exclusive Partner). */
export const RESELLER_ORDER_PREFIX = "EP-";
/** Awalan lama — tetap dikenali agar pesanan lama tidak rusak. */
export const LEGACY_RESELLER_ORDER_PREFIX = "RSL-";

export function isResellerOrderNumber(value: unknown): boolean {
  const number = String(value ?? "").trim().toUpperCase();
  return (
    number.startsWith(RESELLER_ORDER_PREFIX) || number.startsWith(LEGACY_RESELLER_ORDER_PREFIX)
  );
}
