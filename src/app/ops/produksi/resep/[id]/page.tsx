import ResepDetailView from "@/components/produksi/ResepDetailView";

export default async function OpsProduksiResepDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ResepDetailView id={id} />;
}
