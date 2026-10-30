import KomponenDetailView from "@/components/produksi/KomponenDetailView";

export default async function OpsProduksiKomponenDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <KomponenDetailView id={id} />;
}
