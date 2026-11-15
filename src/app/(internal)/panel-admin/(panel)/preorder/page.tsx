/**
 * Menu Pre-Order panel admin (/panel-admin/preorder).
 *
 * Memakai halaman Transaksi yang sama dengan dashboard ops (`mode="preorder"`), dibungkus persis
 * seperti `/panel-admin/transaksi` (tema `.ops-root` + `panel-tx`), supaya tidak ada logika kembar.
 */
import "@/app/(internal)/ops/ops.css";
import "@/app/(internal)/panel-admin/panel-transaksi.css";
import OpsTransaksi from "@/app/(internal)/ops/transaksi/page";

export default function PanelPreorderPage() {
  return (
    <div className="ops-root panel-ops panel-tx">
      <OpsTransaksi variant="panel" mode="preorder" />
    </div>
  );
}
