/**
 * Halaman Reseller panel admin.
 *
 * Sengaja MEMAKAI halaman yang sama dengan dashboard ops (`/ops/reseller`) —
 * bukan disalin — supaya antrean, tabel, modal, dan seluruh aksinya tidak
 * pernah drift. Yang berbeda hanya bungkus tema panel (ops-root + panel-ops).
 */
import "@/app/(internal)/ops/ops.css";
import "@/app/(internal)/panel-admin/panel-transaksi.css";
import OpsReseller from "@/app/(internal)/ops/reseller/page";

export default function PanelResellerPage() {
  return (
    <div className="ops-root panel-ops">
      <OpsReseller variant="panel" />
    </div>
  );
}
