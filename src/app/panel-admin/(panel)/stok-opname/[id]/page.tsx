import "@/app/ops/ops.css";
import StokOpnameDetail from "@/components/stock-opname/StokOpnameDetail";

export default async function PanelStokOpnameDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="ops-root panel-ops">
      <StokOpnameDetail sessionId={id} basePath="/panel-admin/stok-opname" />
    </div>
  );
}
