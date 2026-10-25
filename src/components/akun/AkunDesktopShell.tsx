"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSafeLocale } from "@/lib/safe-i18n";
import { useAkunCustomer, AkunCustomer } from "./AkunContext";
import AkunPageTransition from "./AkunPageTransition";

interface NavItem {
  href: string;
  label: string;
  group: string | null;
  icon: string;
  match: string[];
}

const NAV: NavItem[] = [
  { href: "/akun", label: "Dashboard", group: null, icon: "M4 11 12 4l8 7M6 10v10h12V10", match: ["/akun"] },
  { href: "/akun/pesanan", label: "Pesanan Saya", group: "Pesanan", icon: "M3 8.5 12 4l9 4.5-9 4.5-9-4.5ZM3 8.5v7L12 20l9-4.5v-7", match: ["/akun/pesanan"] },
  { href: "/akun/ulasan", label: "Ulasan Saya", group: "Pesanan", icon: "M12 3l2.6 5.4 5.9.9-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.3l5.9-.9Z", match: ["/akun/ulasan"] },
  { href: "/akun/wishlist", label: "Wishlist", group: "Akses Cepat", icon: "M12 20s-7-4.35-7-9a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 4.65-7 9-7 9Z", match: ["/akun/wishlist"] },
  { href: "/akun/panduan-ukuran", label: "Panduan Ukuran", group: "Akses Cepat", icon: "M3 14 14 3l7 7L10 21zM7.5 12.5 9 14M10.5 9.5 12 11", match: ["/akun/panduan-ukuran"] },
  { href: "/akun/profil", label: "Informasi Profil", group: "Data Saya", icon: "M12 8a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM4.5 20a7.5 7.5 0 0 1 15 0", match: ["/akun/profil"] },
  { href: "/akun/alamat", label: "Alamat Pengiriman", group: "Data Saya", icon: "M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11ZM12 10a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z", match: ["/akun/alamat"] },
  { href: "/akun/bantuan", label: "Hubungi Admin", group: "Bantuan", icon: "M21 12a8 8 0 1 1-3.2-6.4M8 11h8M8 15h5", match: ["/akun/bantuan"] },
];

function isActive(pathname: string, item: { href: string; match: string[] }): boolean {
  const bare = pathname.replace(/^\/(id|en)/, "") || "/";
  if (bare === "/akun" || bare === "/akun/") return item.href === "/akun";
  return item.match.some((m) => m !== "/akun" && bare.startsWith(m));
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export default function AkunDesktopShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const locale = useSafeLocale();
  const { customer, ready } = useAkunCustomer();
  const prefix = `/${locale}`;
  const to = (href: string) => `${prefix}${href}`;

  const initials = getInitials(customer?.name || "U");

  const groups: { group: string | null; items: NavItem[] }[] = [];
  for (const item of NAV) {
    const last = groups[groups.length - 1];
    if (last && last.group === item.group) last.items.push(item);
    else groups.push({ group: item.group, items: [item] });
  }

  if (!ready) {
    return (
      <div className="akun-root hidden md:grid min-h-screen place-items-center" style={{ background: "#F3F3F3" }}>
        <div className="w-9 h-9 rounded-full animate-pulse" style={{ background: "#000000" }} />
      </div>
    );
  }

  return (
    <div className="akun-root hidden md:block min-h-screen" style={{ background: "#F3F3F3" }}>
      {/* ═══ DESKTOP: wireframe structure ═══ */}
      <div>
        {/* ── Sidebar (fixed left) ── */}
        <aside className="fixed inset-y-0 left-0 w-64 bg-white border-r border-[#E0E0E0] z-50 flex flex-col">
          <div className="h-16 flex items-center px-5 border-b border-[#E0E0E0] shrink-0">
            <span className="w-8 h-8 rounded-xl grid place-items-center text-[11px] font-extrabold mr-2.5" style={{ background: "#000000", color: "#fff" }}>S</span>
            <span className="font-extrabold text-[15px] tracking-tight" style={{ color: "#000000" }}>SAMAQU<span className="font-medium" style={{ color: "#C5C5C5" }}> Akun</span></span>
          </div>

          <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5 text-[13.5px] font-semibold">
            {groups.map((g, gi) => (
              <div key={g.group ?? `g${gi}`}>
                {g.group ? <p className="text-[10px] uppercase tracking-widest text-[#8b9793] px-3 pt-4 pb-2 font-bold">{g.group}</p> : null}
                {g.items.map((item) => {
                  const on = isActive(pathname, item);
                  return (
                    <Link
                      key={item.href}
                      href={to(item.href)}
                      prefetch={true}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-[10px] transition-all ${on ? "text-white" : "text-[#777777] hover:text-[#000000] hover:bg-[#f5f1ea]"}`}
                      style={on ? { background: "#000000" } : undefined}
                    >
                      <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <path d={item.icon} />
                      </svg>
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="p-3 border-t border-[#E0E0E0] shrink-0">
            <a
              href="https://wa.me/6281234567890?text=Halo%20SAMAQU,%20saya%20butuh%20bantuan"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-[10px] text-sm font-bold text-white transition hover:opacity-90"
              style={{ background: "#000000" }}
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
              CS Support
            </a>
          </div>
        </aside>

        {/* ── Main area ── */}
        <div className="md:ml-64 flex flex-col min-h-screen">
          <header className="bg-white border-b border-[#E0E0E0] sticky top-0 z-30">
            <div className="h-16 flex items-center gap-3 px-4 sm:px-6">
              <div className="w-9 h-9 rounded-full grid place-items-center text-[12px] font-extrabold shrink-0" style={{ background: "#000000", color: "#fff" }}>
                {initials}
              </div>
              <div className="min-w-0">
                <p className="font-bold text-[#000000] text-sm leading-tight truncate">{customer?.name || "Pelanggan"}</p>
                <p className="text-[11px] text-[#8b9793] truncate">{customer?.email || ""}</p>
              </div>
              <Link href={to("/akun/profil")} className="ml-auto text-sm font-bold px-3 py-1.5 rounded-[8px] transition hover:bg-[#f5f1ea]" style={{ color: "#000000" }}>
                <span className="hidden sm:inline">Profil</span>
              </Link>
            </div>
          </header>

          <main className="flex-1 w-full px-4 sm:px-6 py-6">
            <AkunPageTransition>{children}</AkunPageTransition>
          </main>

          <footer className="bg-white border-t border-[#E0E0E0] py-6">
            <p className="text-center text-xs text-[#8b9793]">&copy; 2026 SAMAQU. All rights reserved.</p>
          </footer>
        </div>
      </div>
    </div>
  );
}
