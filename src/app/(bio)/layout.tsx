import { RootDocument, ROOT_METADATA } from "@/components/RootDocument";
import "@/app/globals.css";

export const metadata = ROOT_METADATA;

/** Root layout untuk Bio Link publik tanpa prefix locale. */
export default function BioRootLayout({ children }: { children: React.ReactNode }) {
  return <RootDocument lang="id">{children}</RootDocument>;
}
