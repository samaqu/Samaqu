import OpenOrderWizard from "@/components/open-order/OpenOrderWizard";
import { OPEN_ORDER_PERIOD } from "@/lib/open-order-config";
import { readOpenOrderWindow } from "@/lib/open-order-settings";
import {
  formatOpenOrderPeriod,
  openOrderDeadline,
  openOrderStartDeadline,
  resolveOpenOrderState,
} from "@/lib/open-order-window";

/**
 * Jendela Open Order global. 180 detik (dulu 60): hemat penulisan cache, sementara
 * status buka/tutup masih terbaca baru dalam hitungan menit.
 */
export const revalidate = 180;

/**
 * Open Order Samaqu — alur 6 langkah (daftar produk → detail → keranjang → data pemesan →
 * review → pesanan berhasil). Tampil tanpa navbar (lihat (customer)/layout.tsx).
 *
 * Jendela Open Order (tanggal + jam buka/tutup) dibaca dari `store_settings` **di server** lalu
 * dikirim sebagai prop. Alasannya: hook `useStoreSettings()` di sisi klien baru terisi setelah
 * hydration, jadi kalau countdown & status buka/tutup dihitung dari situ, numbers-nya akan
 * nongkar belakangan (pop-in) dan halaman sempat menampilkan tombol yang seharusnya terkunci.
 */
export default async function OpenOrderPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const window = await readOpenOrderWindow();
  const params = await searchParams;
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  const focusProductId = first(params.product);
  const focusColor = first(params.warna) ?? first(params.color);
  const focusSize = first(params.ukuran) ?? first(params.size);
  const focusSeries = first(params.series);

  return (
    <OpenOrderWizard
      initialState={resolveOpenOrderState(window)}
      startDeadline={openOrderStartDeadline(window)}
      endDeadline={openOrderDeadline(window)}
      period={formatOpenOrderPeriod(window, OPEN_ORDER_PERIOD)}
      startDate={window.open_order_start_date}
      endDate={window.open_order_end_date}
      focusProductId={focusProductId}
      focusColor={focusColor}
      focusSize={focusSize}
      focusSeries={focusSeries}
    />
  );
}
