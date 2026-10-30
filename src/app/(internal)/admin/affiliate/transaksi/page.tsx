"use client";

/** Admin → Affiliate → Transaksi & Komisi. */

import AdminShell from "@/components/AdminShell";
import AffiliateTransactionsView from "@/components/admin/affiliate/AffiliateTransactionsView";

export default function AdminAffiliateTransactionsPage() {
  return (
    <AdminShell>
      <section className="p-5 lg:p-8 max-w-7xl">
        <AffiliateTransactionsView />
      </section>
    </AdminShell>
  );
}
