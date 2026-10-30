import { RootDocument, ROOT_METADATA } from "@/components/RootDocument";
import "@/app/globals.css";

export const metadata = ROOT_METADATA;
// Dashboard internal tetap dinamis seperti sebelumnya (auth, data live, useSearchParams).
export const dynamic = "force-dynamic";

/** Root layout untuk dashboard internal (ops, panel-admin, admin, affiliate, reseller). */
export default function InternalRootLayout({ children }: { children: React.ReactNode }) {
  return <RootDocument lang="id">{children}</RootDocument>;
}
