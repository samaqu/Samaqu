import type { Metadata } from "next";
import { RootDocument, ROOT_METADATA } from "@/components/RootDocument";
import "@/app/globals.css";

/**
 * Root layout dashboard internal (ops, panel-admin, admin, affiliate, reseller).
 *
 * `robots: noindex` dipasang di sini supaya SELURUH dashboard tertutup dari mesin
 * pencari — satu tempat, bukan per halaman. robots.txt saja tidak cukup: halaman
 * yang sudah terlanjur terindeks hanya keluar setelah Google membaca sinyal
 * `noindex` ini. `nofollow` sekalian supaya tautan internal dashboard tidak diikuti.
 *
 * Halaman publik toko memakai layout lain (`[locale]/layout.tsx` dan `(bio)/layout.tsx`),
 * jadi tidak terpengaruh.
 */
export const metadata: Metadata = {
  ...ROOT_METADATA,
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

// Dashboard internal tetap dinamis seperti sebelumnya (auth, data live, useSearchParams).
export const dynamic = "force-dynamic";

export default function InternalRootLayout({ children }: { children: React.ReactNode }) {
  return <RootDocument lang="id">{children}</RootDocument>;
}
