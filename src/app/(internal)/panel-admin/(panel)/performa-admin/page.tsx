import "@/app/(internal)/ops/ops.css";
import "@/app/(internal)/panel-admin/panel-transaksi.css";
import PerformaView from "@/components/team/PerformaView";

export default function PerformaAdminPage() {
  return (
    <div className="ops-root panel-ops panel-tx">
      <PerformaView />
    </div>
  );
}
