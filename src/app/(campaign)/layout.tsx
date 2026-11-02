import type { Metadata } from "next";
import { RootDocument } from "@/components/RootDocument";
import { cormorantCampaign, dmSans } from "@/lib/campaign/create-your-price-font";
import "@/app/globals.css";

/**
 * Root layout kampanye (tanpa prefix locale).
 *
 * Halaman kampanye berdiri sendiri: tidak memakai Navbar, Footer, MobileBottomNav, maupun
 * ChatWidget dari layout `[locale]/(customer)` — hanya `RootDocument` (dokumen HTML, font
 * global, provider, analytics) supaya tetap satu dokumen dengan sisa aplikasi.
 *
 * Font Cormorant Garamond + DM Sans hanya dipasang di grup rute ini lewat CSS variable,
 * jadi halaman lain tidak ikut memuatnya.
 *
 * `robots: noindex, nofollow` dipasang di layout juga (bukan cuma di page) agar berlaku
 * untuk semua halaman kampanye di masa depan.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function CampaignRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <RootDocument lang="id">
      <div className={`${cormorantCampaign.variable} ${dmSans.variable}`}>{children}</div>
    </RootDocument>
  );
}
