import AdminShell from "@/components/AdminShell";
import StokOpnameDetail from "@/components/stock-opname/StokOpnameDetail";

export default async function AdminStokOpnameDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AdminShell>
      <StokOpnameDetail sessionId={id} basePath="/admin/stok-opname" />
    </AdminShell>
  );
}
