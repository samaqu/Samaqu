"use client";

/**
 * Breadcrumb area akun.
 *
 * Jejak navigasinya disusun dari URL (`/akun`, `/akun/pesanan`, `/akun/pesanan/SMQ-1`, …)
 * supaya tidak perlu ditulis ulang di tiap halaman: segmen statis diberi label lewat
 * AKUN_SEGMENT_LABEL, segmen dinamis (nomor pesanan, id alamat) diberi label apa adanya,
 * dan halaman aktif adalah crumb terakhir tanpa link.
 *
 * `current` dipakai AkunHeader (mobile) supaya crumb terakhir memakai judul halaman yang
 * sudah dimiliki halaman itu (mis. "Tambah Alamat" / "Detail Pesanan").
 * Halaman dashboard (`/akun`) hanya satu level, jadi breadcrumb tidak dirender di sana.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSafeLocale } from "@/lib/safe-i18n";

const AKUN_SEGMENT_LABEL: Record<string, string> = {
  akun: "Dashboard",
  pesanan: "Pesanan Saya",
  ulasan: "Ulasan Saya",
  wishlist: "Wishlist",
  profil: "Informasi Profil",
  alamat: "Alamat Pengiriman",
  bantuan: "Hubungi Admin",
  "panduan-ukuran": "Panduan Ukuran",
  lacak: "Lacak Pesanan",
  baru: "Tambah Alamat",
};

// Nomor pesanan (SMQ-… / CYO-…) ditampilkan seperti di halaman pesanan.
const ORDER_NUMBER = /^[A-Z]{2,}-/;

function segmentLabel(segment: string): string {
  const s = decodeURIComponent(segment);
  if (AKUN_SEGMENT_LABEL[s]) return AKUN_SEGMENT_LABEL[s];
  if (ORDER_NUMBER.test(s)) return `#${s}`;
  return s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface AkunCrumb {
  label: string;
  href?: string;
}

/** Susun jejak breadcrumb dari pathname; crumb terakhir = halaman aktif (tanpa link). */
export function akunCrumbs(pathname: string, locale: string, current?: string): AkunCrumb[] {
  const bare = pathname.replace(/^\/(id|en)/, "") || "/";
  const segments = bare.split("/").filter(Boolean);
  const rest = segments[0] === "akun" ? segments.slice(1) : [];

  const crumbs: AkunCrumb[] = [{ label: "Dashboard", href: `/${locale}/akun` }];
  let path = `/${locale}/akun`;
  for (const segment of rest) {
    path += `/${segment}`;
    crumbs.push({ label: segmentLabel(segment), href: path });
  }

  if (crumbs.length > 1) {
    const last = crumbs[crumbs.length - 1];
    crumbs[crumbs.length - 1] = { label: current || last.label };
  }
  return crumbs;
}

interface AkunBreadcrumbProps {
  current?: string;
  className?: string;
}

export default function AkunBreadcrumb({ current, className }: AkunBreadcrumbProps) {
  const pathname = usePathname();
  const locale = useSafeLocale();
  const crumbs = akunCrumbs(pathname, locale, current);

  if (crumbs.length < 2) return null;

  // Layar sempit: jejak panjang dipangkas jadi Dashboard + dua langkah terakhir.
  const mobileCrumbs = crumbs.length > 3 ? [crumbs[0], ...crumbs.slice(-2)] : crumbs;

  // Mobile: baris satu, crumb boleh menyusut & dipotong dengan elipsis supaya tidak meluber.
  const mobileItem = (crumb: AkunCrumb, i: number) => {
    const isLast = i === mobileCrumbs.length - 1;
    return (
      <li key={`${crumb.label}-${i}`} className="flex items-center gap-1.5 min-w-0" aria-current={isLast ? "page" : undefined}>
        {i > 0 && <span className="shrink-0" aria-hidden="true" style={{ color: "#C5C5C5" }}>/</span>}
        {isLast || !crumb.href ? (
          <span className="truncate font-semibold" style={{ color: "#000000" }}>{crumb.label}</span>
        ) : (
          <Link href={crumb.href} className="truncate transition-opacity hover:opacity-70" style={{ color: "#8b9793" }}>
            {crumb.label}
          </Link>
        )}
      </li>
    );
  };

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="md:hidden flex items-center gap-1.5 text-[12px] font-medium overflow-hidden">
        {mobileCrumbs.map(mobileItem)}
      </ol>
      <ol className="hidden md:flex items-center gap-1.5 text-[13px] font-medium flex-wrap">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${i}`} className="flex items-center gap-1.5 shrink-0" aria-current={isLast ? "page" : undefined}>
              {i > 0 && <span aria-hidden="true" style={{ color: "#C5C5C5" }}>/</span>}
              {isLast || !crumb.href ? (
                <span className="font-semibold" style={{ color: "#000000" }}>{crumb.label}</span>
              ) : (
                <Link href={crumb.href} className="transition-opacity hover:opacity-70" style={{ color: "#8b9793" }}>
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
