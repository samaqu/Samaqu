/**
 * Halaman Produk (master produk + laporan stok + barang masuk/keluar) di panel admin.
 *
 * Memakai halaman yang SAMA dengan dashboard ops (`/ops/master-produk`) — bukan disalin — supaya
 * tab, filter, import, dan form produk berperilaku identik.
 *
 * Navigasi internal halaman itu ("Tambah Produk", "Tambah Barang Masuk") mengikuti peta halaman
 * panel lewat `OpsPageMapProvider` di `PanelShell`, jadi tetap berada di `/panel-admin/...`.
 */
import "@/app/(internal)/ops/ops.css";
import OpsMasterProduk from "@/app/(internal)/ops/master-produk/page";

export default function PanelProdukPage() {
  return (
    <div className="ops-root panel-ops">
      <OpsMasterProduk />
    </div>
  );
}
