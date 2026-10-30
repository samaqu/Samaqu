"use client";

/**
 * Admin → Affiliate → Data Affiliate.
 * Route di bawah /admin (tanpa prefix locale) —middleware tidak mengalihkannya.
 * Isinya satu komponen supaya salinan /id/admin/affiliate/data memakai tampilan sama.
 */

import AdminShell from "@/components/AdminShell";
import AffiliateDataView from "@/components/admin/affiliate/AffiliateDataView";

export default function AdminAffiliateDataPage() {
  return (
    <AdminShell>
      <section className="p-5 lg:p-8 max-w-7xl">
        <AffiliateDataView />
      </section>
    </AdminShell>
  );
}
