import ResellerAdminPage from "@/components/reseller/admin/ResellerAdminPage";

/**
 * Menu Reseller dashboard ops — halaman yang sama dipakai panel admin lewat
 * pembungkus tipis `panel-admin/(panel)/reseller` dengan prop `variant="panel"`.
 */
export default function OpsResellerPage({ variant = "ops" }: { variant?: "ops" | "panel" }) {
  return <ResellerAdminPage variant={variant} />;
}
