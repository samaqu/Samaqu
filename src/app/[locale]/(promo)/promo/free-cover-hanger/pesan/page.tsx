import { readPromoFchSettings } from "@/lib/promo/free-cover-hanger-settings";
import PromoOrderWizard from "@/components/promo/free-cover-hanger/order/PromoOrderWizard";

/**
 * Halaman pesan promo Free Cover Hanger.
 *
 * Status buka/tutup ditentukan oleh ATURAN PROMO SENDIRI (`promo_fch_active` +
 * `promo_fch_start_date` / `promo_fch_end_date` di `store_settings`), BUKAN jadwal
 * Open Order. Dulu halaman ini meminjam jendela Open Order, sehingga produk tampil
 * "Sudah ditutup" begitu jadwal Open Order lewat — padahal promo masih aktif.
 *
 * Alur pesanan (ongkir J&T, pemotongan stok, pembayaran) memakai `PromoOrderWizard`
 * yang merupakan salinan wizard Open Order, jadi `src/components/open-order/*` tidak
 * tersentuh.
 */
/**
 * 600 detik (dulu 180/60). Halaman ini membaca data server (status promo, kuota,
 * periode), jadi tidak bisa dibiarkan basi lama — tapi 180 detik membuang lebih banyak
 * penulisan cache tanpa manfaat: katalog & ongkir di wizard tetap diambil di browser.
 * Perubahan dari admin tetap instan untuk produk/katalog lewat /api/revalidate.
 */
export const revalidate = 21600;

export default async function PromoOrderPage() {
  const promo = await readPromoFchSettings();

  return (
    <PromoOrderWizard
      heroEyebrow={promo.eyebrow}
      heroTitle={promo.title}
      heroDescription={promo.description}
      bonus={{ left: promo.quotaLeft, total: promo.quotaTotal, note: promo.quotaNote }}
      /* Status program promo, dibaca di server supaya tidak "pop-in" di klien. */
      promoActive={promo.active}
      promoPhase={promo.phase}
      promoStartDate={promo.startDate}
      promoEndDate={promo.endDate}
      /* Bonus habis (kuota 0 / di luar periode) -> tampil "Bonus sudah habis". */
      promoBonusAvailable={promo.bonusAvailable}
    />
  );
}
