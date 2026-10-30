/**
 * Halaman Transaksi panel admin.
 *
 * Sengaja MEMAKAI halaman yang sama dengan dashboard ops (`/ops/transaksi`) — bukan disalin —
 * supaya form, logika, validasi, alur resi, dan tampilannya tidak pernah drift.
 *
 * Yang berbeda hanya TAMPILAN: prop `variant="panel"` membuat halaman merender gaya mockup
 * (`panel-transaksi.css`, di-scope `.panel-tx`), sementara dashboard ops tetap merender
 * tampilan ops yang lama (tanpa `panel-tx`).
 *
 * Dibungkus `.ops-root` + `ops.css` karena halaman ops memakai token & font tema ops
 * (Inter + token shadcn), sedangkan shell panel admin memakai tema mockup sendiri.
 */
import "@/app/(internal)/ops/ops.css";
import "@/app/(internal)/panel-admin/panel-transaksi.css";
import OpsTransaksi from "@/app/(internal)/ops/transaksi/page";

export default function PanelTransaksiPage() {
  return (
    <div className="ops-root panel-ops panel-tx">
      <OpsTransaksi variant="panel" />
    </div>
  );
}
