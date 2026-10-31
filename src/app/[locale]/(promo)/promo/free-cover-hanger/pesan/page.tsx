import { readOpenOrderWindow } from "@/lib/open-order-settings";
import { openOrderDeadline, openOrderStartDeadline, resolveOpenOrderState } from "@/lib/open-order-window";
import { readPromoFchSettings } from "@/lib/promo/free-cover-hanger-settings";
import PromoOrderWizard from "@/components/promo/free-cover-hanger/order/PromoOrderWizard";

/**
 * Halaman pesan promo Free Cover Hanger.
 *
 * Memakai `PromoOrderWizard` — SALINAN wizard Open Order di folder promo, jadi file
 * `src/components/open-order/*` tidak tersentuh sama sekali. Tampilan, alur, ongkir J&T,
 * pemotongan stok, dan pembayaran tetap sama dengan Open Order.
 *
 * Judul katalog & bar sisa bonus dibaca dari pengaturan promo di `store_settings`
 * (`promo_fch_*`, diatur nanti di menu admin "Promo"). Kolom itu belum ada → nilai bawaan.
 */
export const revalidate = 60;

export default async function PromoOrderPage() {
  const [window, promo] = await Promise.all([readOpenOrderWindow(), readPromoFchSettings()]);
  const state = resolveOpenOrderState(window);

  return (
    <PromoOrderWizard
      initialState={state}
      startDeadline={openOrderStartDeadline(window)}
      endDeadline={openOrderDeadline(window)}
      startDate={window.open_order_start_date}
      endDate={window.open_order_end_date}
      heroEyebrow={promo.eyebrow}
      heroTitle={promo.title}
      heroDescription={promo.description}
      bonus={{ left: promo.quotaLeft, total: promo.quotaTotal, note: promo.quotaNote }}
    />
  );
}
