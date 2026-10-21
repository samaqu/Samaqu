"use client";

/**
 * Stok Opname di dashboard /admin — admin melihat sesi yang menunggu persetujuan dan
 * memutuskan Setujui / Tolak. Komponennya sama dengan panel operasional supaya
 * perilaku & angkanya tidak pernah berbeda antar dashboard.
 */
import AdminShell from "@/components/AdminShell";
import StokOpnameList from "@/components/stock-opname/StokOpnameList";

export default function AdminStokOpnamePage() {
  return (
    <AdminShell>
      <StokOpnameList basePath="/admin/stok-opname" />
    </AdminShell>
  );
}
