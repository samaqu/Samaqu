import type { Metadata } from "next";
import "./reseller.css";
import ResellerShell from "@/components/reseller/ResellerShell";

export const metadata: Metadata = {
  title: "SAMAQU Reseller Center",
  description: "Portal reseller SAMAQU: saldo, pesanan, dan top up.",
  robots: { index: false, follow: false },
};

/** Portal reseller — terpisah dari toko, /akun, /affiliate, dan dashboard internal. */
export default function ResellerLayout({ children }: { children: React.ReactNode }) {
  return <ResellerShell>{children}</ResellerShell>;
}
