"use client";

/**
 * Menu admin "Promo" — dipakai di route /admin/promo (tanpa prefix locale, lihat
 * `src/middleware.ts`). Isinya ada di `PromoFchSettingsForm` supaya halaman ini dan
 * `/id/admin/promo` tidak dobel.
 */

import AdminShell from "@/components/AdminShell";
import PromoFchSettingsForm from "@/components/admin/PromoFchSettingsForm";

export default function AdminPromoPage() {
  return (
    <AdminShell>
      <PromoFchSettingsForm />
    </AdminShell>
  );
}
