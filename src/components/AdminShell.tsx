"use client";

import { useState, ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Search, Bell, Menu, LogOut, X, ChevronDown, MessageCircle,
} from "lucide-react";
import { ADMIN_SHELL_CSS } from "@/components/admin/admin-theme";
import { ADMIN_NAV_GROUPS, adminNavHref } from "@/components/admin/admin-nav";

/** Menu diambil dari SATU sumber (`admin-nav.ts`) supaya sidebar di subhalaman tidak pernah
 *  berbeda dengan sidebar di /admin — dulu daftarnya disalin di sini dan jadi tidak sinkron
 *  (menu Promo hilang saat membuka Ulasan Pelanggan). */
const navGroups = ADMIN_NAV_GROUPS;

export default function AdminShell({ children, onLogout }: { children: ReactNode; onLogout?: () => void }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  }

  return (
    <div id="admin-root" className="flex min-h-screen" style={{ background: "var(--bg)", color: "var(--fg)" }}>
      {/* Sidebar — dikelompokkan per section, item ringkas supaya muat tanpa scroll */}
      <aside
        className={`fixed lg:sticky z-40 top-0 left-0 h-screen lg:self-start w-64 shrink-0 transition-transform duration-300 flex flex-col admin-sidebar ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
        style={{ background: "var(--card)", borderRight: "1px solid var(--bd)" }}
      >
        <div className="h-16 flex items-center gap-2.5 px-4 shrink-0" style={{ borderBottom: "1px solid var(--bd)" }}>
          <div className="w-9 h-9 flex items-center justify-center shrink-0" style={{ background: "var(--fg)", borderRadius: "var(--rad3)" }}>
            <span className="text-white font-extrabold text-sm">S</span>
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-extrabold leading-tight truncate" style={{ color: "var(--fg)" }}>SAMAQU</p>
            <p className="text-[10px] font-bold" style={{ color: "var(--fg3)" }}>Admin Panel</p>
          </div>
        </div>

        {/* min-h-0 wajib: tanpa itu flex item nggak bisa mengecil dari isinya,
            jadi nav luber dan menutup footer (menu & "Keluar" jadi kepotong). */}
        <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-3 no-scrollbar">
          {navGroups.map((group, gi) => (
            <div key={group.title} className={gi > 0 ? "mt-3 pt-3" : ""} style={gi > 0 ? { borderTop: "1px solid var(--bd)" } : undefined}>
              <p className="px-2 mb-1.5 text-[10px] font-extrabold uppercase tracking-[0.08em]" style={{ color: "var(--fg3)" }}>{group.title}</p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const href = adminNavHref(item);
                  return (
                  <li key={item.label}>
                    <Link
                      href={href}
                      // `prefetch` = Next memuat halaman tujuan lebih dulu saat link ini
                      // terlihat di layar, jadi pindah menu terasa instan (bukan halaman
                      // kosong menunggu server). Halaman tujuan juga memakai <AdminShell>
                      // sehingga menu tetap sama.
                      prefetch
                      className={`sidebar-link ${isActive(href) ? "active" : ""}`}
                      onClick={() => setSidebarOpen(false)}
                    >
                      <item.icon size={16} strokeWidth={1.9} />
                      <span className="flex-1 truncate">{item.label}</span>
                    </Link>
                  </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Footer sidebar — bantuan + keluar, ala wireframe */}
        <div className="shrink-0 px-3 py-3 space-y-0.5" style={{ borderTop: "1px solid var(--bd)" }}>
          <a
            href="https://wa.me/6285212150100?text=Halo,%20saya%20ingin%20bertanya%20seputar%20dashboard%20admin%20SAMAQU."
            target="_blank"
            rel="noopener noreferrer"
            className="sidebar-link"
          >
            <MessageCircle size={16} strokeWidth={1.9} />
            <span className="flex-1">Butuh Bantuan?</span>
          </a>
          {onLogout && (
            <button onClick={onLogout} className="sidebar-link w-full" style={{ color: "#ef4444" }}>
              <LogOut size={16} strokeWidth={1.9} />
              <span className="flex-1 text-left">Keluar</span>
            </button>
          )}
        </div>
      </aside>

      {/* Overlay mobile */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0" style={{ background: "var(--bg)" }}>
        {/* Topbar */}
        <header className="sticky top-0 z-20 shrink-0" style={{ background: "var(--card)", borderBottom: "1px solid var(--bd)" }}>
          <div className="flex items-center gap-4 px-5 lg:px-8 h-16">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 -ml-2 rounded-lg" style={{ color: "var(--fg)" }}>
              <Menu size={22} strokeWidth={1.9} />
            </button>
            <div className="ml-auto flex items-center gap-3">
              <div className="relative hidden md:block">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--fg3)" }} />
                <input type="text" placeholder="Cari..." className="pl-9 pr-3 py-1.5 w-56 rounded-lg text-sm focus:outline-none focus:ring-2" style={{ background: "var(--sub)", border: "1px solid var(--bd)", color: "var(--fg)", "--tw-ring-color": "var(--bd)" } as React.CSSProperties} />
              </div>
              <button className="relative p-2 rounded-lg" style={{ color: "var(--fg2)" }}>
                <Bell size={19} strokeWidth={1.8} />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full" style={{ background: "#ef4444", border: "2px solid var(--card)" }} />
              </button>
              <div className="relative">
                <button onClick={() => setProfileOpen(!profileOpen)} className="flex items-center gap-2 pl-1">
                  <div className="w-8 h-8 flex items-center justify-center text-white font-extrabold text-sm" style={{ background: "var(--fg)", borderRadius: "var(--rad2)" }}>A</div>
                  <ChevronDown size={15} style={{ color: "var(--fg3)" }} />
                </button>
                {profileOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 w-48 z-50 overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--bd)", borderRadius: "var(--rad2)", boxShadow: "var(--el2)" }}>
                      {onLogout && (
                        <button onClick={onLogout} className="w-full flex items-center gap-2 px-4 py-3 text-sm font-bold hover:bg-[var(--sub)]" style={{ color: "var(--fg)" }}>
                          <LogOut size={16} strokeWidth={1.8} />
                          Keluar
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-x-hidden" style={{ background: "var(--bg)" }}>
          {children}
        </main>
      </div>

      <style jsx global>{ADMIN_SHELL_CSS}</style>
    </div>
  );
}
