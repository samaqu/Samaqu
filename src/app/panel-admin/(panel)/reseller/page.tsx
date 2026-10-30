/**
 * Halaman Reseller panel admin.
 *
 * Sengaja MEMAKAI halaman yang sama dengan dashboard ops (`/ops/reseller`) —
 * bukan disalin — supaya antrean, tabel, modal, dan seluruh aksinya tidak
 * pernah drift. Yang berbeda hanya bungkus tema panel (ops-root + panel-ops).
 */
import "@/app/ops/ops.css";
import "@/app/panel-admin/panel-transaksi.css";
import OpsReseller from "@/app/ops/reseller/page";

export default function PanelResellerPage() {
  return (
    <div className="ops-root panel-ops">
      <OpsReseller variant="panel" />
    </div>
  );
}
