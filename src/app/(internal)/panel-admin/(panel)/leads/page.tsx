/**
 * Halaman Leads (database leads) di panel admin.
 *
 * Memakai halaman yang SAMA dengan dashboard ops (`/ops/leads`) — bukan disalin — supaya tabel,
 * filter tanggal, form tambah/edit, import tempel, dan hapus berperilaku identik.
 *
 * Dibungkus `.ops-root` + `ops.css` karena halaman ops memakai token & font tema ops.
 */
import "@/app/(internal)/ops/ops.css";
import OpsLeads from "@/app/(internal)/ops/leads/page";

export default function PanelLeadsPage() {
  return (
    <div className="ops-root panel-ops">
      <OpsLeads />
    </div>
  );
}
