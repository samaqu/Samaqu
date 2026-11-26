/**
 * Diskon promo gratis cover pada draft transaksi (Perlu Review).
 *
 * Dipindah apa adanya dari `api/ops/perlu-review/route.ts` supaya bisa diuji (file route Next.js tidak boleh
 * mengekspor fungsi lain). Perilaku lama TIDAK berubah, ditambah satu pengecualian:
 * baris yang bertanda `cover_berbayar: true` (Cover + Hanger yang DIBELI customer, ditawarkan bot ke customer lama
 * atau saat promo free cover mati) tidak dihitung sebagai bonus, jadi tidak ikut didiskon Rp35.000.
 * Tanpa tanda itu (draft biasa dan free cover customer baru), hasilnya sama persis dengan sebelumnya.
 */

/** Diskon promo gratis cover: satu item "Cover Thobe + Hanger" = Rp35.000. */
export const COVER_DISCOUNT = 35000;

/**
 * Samakan diskon draft dengan promo cover hanger. Dipakai saat draft dibuat, dibaca,
 * diedit, dan disetujui supaya angka di layar = angka yang dibukukan.
 * Diskon yang lebih besar dari promo (diisi admin) tidak diturunkan.
 */
export function applyCoverDiscount(payload: any) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const subtotal = items.reduce(
    (sum: number, item: any) => sum + (Number(item?.price) || 0) * (Number(item?.quantity) || 0),
    0,
  );
  const current = Math.max(0, Math.round(Number(payload?.discount) || 0));
  const coverQty = items
    .filter(
      (item: any) =>
        item?.cover_berbayar !== true &&
        String(item?.product_id || "") === "cover-hanger" &&
        /cover\s*thobe/i.test(String(item?.color || "")),
    )
    .reduce((sum: number, item: any) => sum + Math.max(1, Number(item?.quantity) || 1), 0);
  const target = coverQty ? Math.min(COVER_DISCOUNT * coverQty, subtotal) : 0;
  return { ...payload, discount: Math.min(Math.max(current, target), subtotal) };
}
