"use client";

/**
 * Menu admin "Open Order" — dipakai di route /admin/open-order, yang sengaja dipisah dari
 * prefix locale oleh src/middleware.ts.
 *
 * Isi formulirnya ada di src/components/admin/OpenOrderSettingsForm.tsx supaya halaman ini dan
 * salinan /id/admin/open-order tidak dobel. Lihat supabase/open-order-settings.sql untuk
 * kolom-kolom store_settings yang dipakai.
 */

import AdminShell from "@/components/AdminShell";
import OpenOrderSettingsForm from "@/components/admin/OpenOrderSettingsForm";

export default function AdminOpenOrderPage() {
  return (
    <AdminShell>
      <OpenOrderSettingsForm />
    </AdminShell>
  );
}
