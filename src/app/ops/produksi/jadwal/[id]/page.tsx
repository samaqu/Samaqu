import JadwalDetailView from "@/components/produksi/JadwalDetailView";

export default async function OpsProduksiJadwalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <JadwalDetailView id={id} />;
}
