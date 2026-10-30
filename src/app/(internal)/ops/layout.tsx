import type { Metadata } from "next";
import "./ops.css";
import OpsShell from "@/components/ops/OpsShell";

export const metadata: Metadata = {
  title: "SAMAQU Internal",
  robots: { index: false, follow: false, nocache: true },
};

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return <OpsShell>{children}</OpsShell>;
}
