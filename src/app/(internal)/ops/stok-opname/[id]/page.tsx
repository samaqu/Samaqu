import StokOpnameDetail from "@/components/stock-opname/StokOpnameDetail";

/** Halaman hitung satu sesi Stok Opname (dashboard ops). */
export default async function OpsStokOpnameDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StokOpnameDetail sessionId={id} basePath="/ops/stok-opname" />;
}
