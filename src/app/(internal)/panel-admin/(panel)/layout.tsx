import type { ReactNode } from "react";
import "../panel-ops.css";
import PanelShell from "../PanelShell";

/**
 * Layout panel admin (`admin.samaqu.id` → /panel-admin/*).
 *
 * Tampilan mengikuti mockup HTML (samaqu-admin-dashboard-2/pages/index.html); font Plus Jakarta
 * Sans dimuat dari Google Fonts dengan bobot 400–800 seperti mockup.
 */
export const metadata = {
  title: "SAMAQU · Panel Admin",
};

export default function PanelAdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Font sama seperti mockup (Plus Jakarta Sans 400–800) — lewat tag link supaya tidak
          menambah ketergantungan saat build. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
        rel="stylesheet"
      />
      {/* Terapkan status sidebar SEBELUM cat pertama supaya tidak ada kedip (flash) saat
          halaman dibuka dengan sidebar dalam keadaan terlipat. Nilainya dari localStorage. */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            "try{if(localStorage.getItem('samaqu:panel-sidebar')==='collapsed'){document.documentElement.setAttribute('data-panel-sidebar','collapsed')}}catch(e){}",
        }}
      />
      <PanelShell>{children}</PanelShell>
    </>
  );
}
