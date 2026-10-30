"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import AdminShell from "@/components/AdminShell";
import { ProductDetailPanel } from "@/components/admin/ProductDetailDrawer";

/**
 * Halaman route detail produk (salinan non-locale, /admin) — memakai panel yang
 * sama dengan drawer supaya tampilannya konsisten di dua tempat.
 */
export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  return (
    <AdminShell>
      <div className="px-4 py-5 lg:px-8 lg:py-8">
        <ProductDetailPanel productId={id} onClose={() => router.push("/admin")} mode="page" />
      </div>
    </AdminShell>
  );
}
