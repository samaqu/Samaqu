"use client";

/** Admin → Affiliate → Pencairan Komisi. */

import AdminShell from "@/components/AdminShell";
import AffiliateWithdrawalsView from "@/components/admin/affiliate/AffiliateWithdrawalsView";

export default function AdminAffiliateWithdrawalsPage() {
  return (
    <AdminShell>
      <section className="p-5 lg:p-8 max-w-7xl">
        <AffiliateWithdrawalsView />
      </section>
    </AdminShell>
  );
}
