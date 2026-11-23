/**
 * Kurir lain (ekspedisi di luar J&T / GoSend) untuk pesanan reseller "ongkir menyusul".
 *
 * Disimpan di `orders.shipping_method` (teks bebas) dengan awalan baku "Kurir Lain - <nama> (<layanan>)".
 * Awalan itulah penandanya — SATU sumber supaya server, tracking, pembatalan, dan tampilan memakai
 * nilai yang sama.
 *
 * ATURAN PENTING (jangan dilanggar):
 *  - Nama ekspedisi bisa memuat kata "EZ"/"ECO"/"HBO" (mis. "Pandu ECO"). Karena itu
 *    `jntServiceCodeFromShippingMethod` mengembalikan null untuk kurir lain SEBELUM mencari kata itu.
 *  - Resi kurir lain diinput manual (`manualResi`) dan disimpan di `awb_no`, tapi J&T TIDAK tahu resi itu:
 *    jangan di-track ke J&T (cron `sync-tracking`, drawer) dan jangan di-void ke J&T saat pesanan dibatalkan
 *    (`cancelOrderCompletely`), kalau tidak pembatalan ditolak / tracking selalu "Invalid AWB".
 */

export const CUSTOM_COURIER_PREFIX = "Kurir Lain";

/** Batas isian supaya teks `shipping_method` tetap ringkas di tabel, label, dan WA. */
export const CUSTOM_COURIER_NAME_MAX = 40;
export const CUSTOM_COURIER_SERVICE_MAX = 30;
/** Pagar kewajaran ongkir isian admin (tanpa verifikasi tarif). Di atas ini hampir pasti salah ketik. */
export const CUSTOM_COURIER_MAX_COST = 10_000_000;

/** True kalau teks `shipping_method` adalah kurir lain (toleran huruf besar/kecil & spasi). */
export function isCustomCourier(value?: string | null): boolean {
  return /^kurir\s+lain(\s|$|-)/i.test(String(value ?? "").trim());
}

/** Rapikan isian: spasi ganda → satu, buang karakter kontrol. */
function clean(value: unknown): string {
  return String(value ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type CustomCourierResult = { ok: true; method: string; name: string; service: string } | { ok: false; error: string };

/** Susun teks `shipping_method` dari isian admin; menolak isian kosong / terlalu panjang. */
export function buildCustomCourierMethod(nameInput: unknown, serviceInput?: unknown): CustomCourierResult {
  const name = clean(nameInput);
  const service = clean(serviceInput);
  if (!name) return { ok: false, error: "Nama ekspedisi wajib diisi." };
  if (name.length < 2) return { ok: false, error: "Nama ekspedisi terlalu pendek." };
  if (name.length > CUSTOM_COURIER_NAME_MAX) {
    return { ok: false, error: `Nama ekspedisi maksimal ${CUSTOM_COURIER_NAME_MAX} karakter.` };
  }
  if (service.length > CUSTOM_COURIER_SERVICE_MAX) {
    return { ok: false, error: `Layanan maksimal ${CUSTOM_COURIER_SERVICE_MAX} karakter.` };
  }
  return {
    ok: true,
    name,
    service,
    method: `${CUSTOM_COURIER_PREFIX} - ${name}${service ? ` (${service})` : ""}`,
  };
}

/** Teks tampilan tanpa awalan: "Dakota Cargo (Darat)". Bukan kurir lain → teks apa adanya. */
export function customCourierLabel(value?: string | null): string {
  const text = String(value ?? "").trim();
  if (!isCustomCourier(text)) return text;
  return text.replace(/^kurir\s+lain\s*-?\s*/i, "").trim() || CUSTOM_COURIER_PREFIX;
}

/**
 * Pecah teks tersimpan "Kurir Lain - Baraka Express (Cargo)" menjadi { name, service }. Bukan kurir lain → null.
 * Dipakai form Transaksi (mengisi ulang isian saat Ubah) dan server (merapikan ulang sebelum disimpan).
 */
export function parseCustomCourier(value?: string | null): { name: string; service: string } | null {
  const text = String(value ?? "").trim();
  if (!isCustomCourier(text)) return null;
  const rest = text.replace(/^kurir\s+lain\s*-?\s*/i, "").trim();
  const match = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(rest);
  return match ? { name: match[1].trim(), service: match[2].trim() } : { name: rest, service: "" };
}
