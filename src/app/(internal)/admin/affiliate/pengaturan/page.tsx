"use client";

/** Admin → Affiliate → Pengaturan Komisi. */

import AdminShell from "@/components/AdminShell";
import AffiliateSettingsView from "@/components/admin/affiliate/AffiliateSettingsView";

export default function AdminAffiliateSettingsPage() {
  return (
    <AdminShell>
      <section className="p-5 lg:p-8 max-w-5xl">
        <AffiliateSettingsView />
      </section>
    </AdminShell>
  );
}
