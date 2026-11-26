/**
 * Menu "Promo" di panel-admin.
 *
 * Memakai komponen yang sama dengan /admin/promo supaya pengaturan & daftar produk
 * tidak pernah berbeda antara dua dashboard.
 */
import "@/app/(internal)/ops/ops.css";
import PromoFchSettingsForm from "@/components/admin/PromoFchSettingsForm";
import PromoBotCard from "@/components/admin/promo-bot/PromoBotCard";

export default function PanelAdminPromoPage() {
  return (
    <div className="ops-root panel-ops">
      <PromoFchSettingsForm />
      <PromoBotCard />
    </div>
  );
}
