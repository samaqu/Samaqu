import OpenOrderWizard from "@/components/open-order/OpenOrderWizard";
import { OPEN_ORDER_PERIOD } from "@/lib/open-order-config";
import {
  formatOpenOrderPeriod,
  openOrderDeadline,
  openOrderStartDeadline,
  resolveOpenOrderState,
} from "@/lib/open-order-window";
import { supabase } from "@/lib/supabase";

/**
 * Open Order Samaqu — alur 6 langkah (daftar produk → detail → keranjang → data pemesan →
 * review → pesanan berhasil). Tampil tanpa navbar (lihat (customer)/layout.tsx).
 *
 * Jendela Open Order (tanggal mulai & tutup) dibaca dari `store_settings` **di server** lalu
 * dikirim sebagai prop. Alasannya: hook `useStoreSettings()` di sisi klien baru terisi setelah
 * hydration, jadi kalau countdown & status buka/tutup dihitung dari situ, numbers-nya akan
 * nongkar belakangan (pop-in) dan halaman sempat menampilkan tombol yang seharusnya terkunci.
 */
export default async function OpenOrderPage() {
  const { data } = await supabase
    .from("store_settings")
    .select("open_order_start_date, open_order_end_date, open_order_active")
    .eq("id", 1)
    .maybeSingle();

  const window = {
    open_order_start_date: data?.open_order_start_date ?? null,
    open_order_end_date: data?.open_order_end_date ?? null,
    open_order_active: data?.open_order_active ?? null,
  };

  return (
    <OpenOrderWizard
      initialState={resolveOpenOrderState(window)}
      startDeadline={openOrderStartDeadline(window)}
      endDeadline={openOrderDeadline(window)}
      period={formatOpenOrderPeriod(window, OPEN_ORDER_PERIOD)}
    />
  );
}
