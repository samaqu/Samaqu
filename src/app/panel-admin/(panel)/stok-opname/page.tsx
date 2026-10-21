/**
 * Stok Opname di panel Admin Operasional — memakai komponen yang sama dengan dashboard ops,
 * hanya alamat halaman (basePath) yang berbeda supaya tautan tetap di /panel-admin/*.
 */
import "@/app/ops/ops.css";
import StokOpnameList from "@/components/stock-opname/StokOpnameList";

export default function PanelStokOpnamePage() {
  return (
    <div className="ops-root panel-ops">
      <StokOpnameList basePath="/panel-admin/stok-opname" />
    </div>
  );
}
