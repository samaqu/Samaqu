import type { Metadata } from "next";
import "./affiliate.css";
import "./public.css";
import AffiliateShell from "@/components/affiliate/AffiliateShell";
import { ModalProvider, ToastProvider } from "@/components/affiliate/ui";

export const metadata: Metadata = {
  title: "SAMAQU Affiliate Center",
  description: "Portal partner affiliate SAMAQU: pantau penjualan, komisi, dan pencairan.",
  robots: { index: false, follow: false },
};

/**
 * Portal Affiliate SAMAQU.
 *
 * Terpisah dari dashboard admin (halaman, navigasi, dan hak akses), tapi memakai
 * backend & database yang sama. CSS diambil dari mockup "SAMAQU Affiliate Center"
 * (src/app/affiliate/affiliate.css) supaya tampilannya sama persis.
 */
export default function AffiliateLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ModalProvider>
        <AffiliateShell>{children}</AffiliateShell>
      </ModalProvider>
    </ToastProvider>
  );
}
