"use client";

/**
 * Nav bawah ala aplikasi (mobile) untuk halaman toko: Beranda · Kategori · Open Order ·
 * Pesanan · Akun. Muncul di bawah breakpoint `lg` — sama dengan navbar atas yang beralih ke
 * drawer di sana — dan hanya dipasang di route group `(customer)`.
 *
 * Bar aksi bawah milik halaman (keranjang, checkout, detail produk) digeser naik setinggi
 * `--mobile-nav-h` supaya tidak bertumpuk dengan bar ini, dan layout memberi padding bawah
 * sebesar variabel yang sama (lihat globals.css).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { SquaresFour } from "@phosphor-icons/react/dist/csr/SquaresFour";
import { Package } from "@phosphor-icons/react/dist/csr/Package";
import { TShirt } from "@phosphor-icons/react/dist/csr/TShirt";
import { User } from "@phosphor-icons/react/dist/csr/User";
import HouseIcon from "@/components/icons/HouseIcon";
import { useSafeLocale } from "@/lib/safe-i18n";
import { useIsCustomerLoggedIn } from "@/lib/use-customer-login";

type NavItem = {
  href: string;
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Icon: ComponentType<any>;
  match: (path: string) => boolean;
};

/** Path tanpa prefix locale supaya pencocokan tidak bergantung bahasa. */
function barePath(pathname: string | null): string {
  return (pathname ?? "/").replace(/^\/(id|en)(?=\/|$)/, "") || "/";
}

const ITEMS: NavItem[] = [
  { href: "/", label: "Beranda", Icon: HouseIcon, match: (p) => p === "/" },
  { href: "/katalog", label: "Katalog", Icon: SquaresFour, match: (p) => p.startsWith("/katalog") },
  { href: "/open-order", label: "Open Order", Icon: TShirt, match: (p) => p.startsWith("/open-order") },
  { href: "/akun/pesanan", label: "Pesanan", Icon: Package, match: (p) => p.startsWith("/akun/pesanan") },
  {
    href: "/akun",
    label: "Akun",
    Icon: User,
    match: (p) => p === "/akun" || (p.startsWith("/akun") && !p.startsWith("/akun/pesanan")),
  },
];

export default function MobileBottomNav() {
  const pathname = usePathname();
  const locale = useSafeLocale();
  const customerLoggedIn = useIsCustomerLoggedIn();
  const bare = barePath(pathname);

  return (
    <nav
      aria-label="Navigasi bawah"
      className="lg:hidden fixed bottom-0 inset-x-0 z-40"
      style={{
        background: "rgba(248,245,241,.97)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderTop: "1px solid rgba(0,0,0,.35)",
        boxShadow: "0 -6px 24px -14px rgba(0,0,0,.18)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="mx-auto flex h-[62px] max-w-lg items-stretch justify-around px-2">
        {ITEMS.map(({ href, label, Icon, match }) => {
          const active = match(bare);
          return (
            <Link
              key={href}
              href={
                href === "/"
                  ? customerLoggedIn
                    ? `/${locale}/akun`
                    : `/${locale}`
                  : `/${locale}${href}`
              }
              aria-current={active ? "page" : undefined}
              className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl transition-colors duration-200"
              style={{ color: active ? "#000" : "var(--text-muted)" }}
            >
              <Icon size={21} weight={active ? "bold" : "regular"} style={{ color: active ? "#000" : undefined }} />
              <span className="text-[10px] font-medium tracking-[0.02em]">{label}</span>
              <span
                className="h-1 w-1 rounded-full"
                style={{ background: active ? "#000" : "transparent" }}
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
