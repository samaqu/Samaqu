"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useSafeLocale } from "@/lib/safe-i18n";
import { useAkunCustomer } from "./AkunContext";
import AkunPageTransition from "./AkunPageTransition";
import AkunBreadcrumb from "./AkunBreadcrumb";
import { logoutCustomer } from "@/lib/customer-auth";
import { CartBadge } from "@/components/CartBadge";

interface NavItem {
  href: string;
  label: string;
  group: string | null;
  icon: string;
  match: string[];
}

/**
 * Menu sidebar desktop — DUA grup saja (BELANJA / AKUN). Hanya mengelompokkan ulang menu yang
 * sudah ada; tidak ada halaman baru atau yang dihapus.
 */
const NAV: NavItem[] = [
  { href: "/akun", label: "Dashboard", group: "Belanja", icon: "M4 11 12 4l8 7M6 10v10h12V10", match: ["/akun"] },
  { href: "/akun/pesanan", label: "Pesanan Saya", group: "Belanja", icon: "M3 8.5 12 4l9 4.5-9 4.5-9-4.5ZM3 8.5v7L12 20l9-4.5v-7", match: ["/akun/pesanan"] },
  { href: "/akun/ulasan", label: "Ulasan Saya", group: "Belanja", icon: "M12 3l2.6 5.4 5.9.9-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.3l5.9-.9Z", match: ["/akun/ulasan"] },
  { href: "/akun/wishlist", label: "Wishlist", group: "Belanja", icon: "M12 20s-7-4.35-7-9a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 4.65-7 9-7 9Z", match: ["/akun/wishlist"] },
  { href: "/akun/panduan-ukuran", label: "Panduan Ukuran", group: "Belanja", icon: "M3 14 14 3l7 7L10 21zM7.5 12.5 9 14M10.5 9.5 12 11", match: ["/akun/panduan-ukuran"] },
  { href: "/akun/profil", label: "Informasi Profil", group: "Akun", icon: "M12 8a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM4.5 20a7.5 7.5 0 0 1 15 0", match: ["/akun/profil"] },
  { href: "/akun/alamat", label: "Alamat Pengiriman", group: "Akun", icon: "M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11ZM12 10a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z", match: ["/akun/alamat"] },
  { href: "/akun/ubah-password", label: "Ubah Password", group: "Akun", icon: "M6 10V8a6 6 0 0 1 12 0v2M4 10h16v10H4z", match: ["/akun/ubah-password"] },
  { href: "/akun/bantuan", label: "Hubungi Admin", group: "Akun", icon: "M4 14v-2a8 8 0 0 1 16 0v2M4 14h2.5A1.5 1.5 0 0 1 8 15.5v3A1.5 1.5 0 0 1 6.5 20H6a2 2 0 0 1-2-2v-4ZM20 14h-2.5A1.5 1.5 0 0 0 16 15.5v3A1.5 1.5 0 0 0 17.5 20h.5a2 2 0 0 0 2-2v-4Z", match: ["/akun/bantuan"] },
];

/**
 * Bottom nav dashboard customer — mengikuti wireframe mobile 5 tab:
 * Dashboard, Katalog, cart FAB di tengah, Pesanan, Profil.
 * Desktop memakai sidebar dan tidak memakai array ini.
 */
const BOTTOM_LEFT = [
  { href: "/akun", label: "Dashboard", icon: "M4 11 12 4l8 7M6 10v10h12V10", match: ["/akun"] },
  { href: "/katalog", label: "Katalog", icon: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z", match: ["/katalog"] },
];

const BOTTOM_RIGHT = [
  { href: "/akun/pesanan", label: "Pesanan", icon: "M3 8.5 12 4l9 4.5-9 4.5-9-4.5ZM3 8.5v7L12 20l9-4.5v-7", match: ["/akun/pesanan"] },
  { href: "/akun/profil", label: "Profil", icon: "M12 8a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM4.5 20a7.5 7.5 0 0 1 15 0", match: ["/akun/profil"] },
];

function isActive(pathname: string, item: { href: string; match: string[] }): boolean {
  const bare = pathname.replace(/^\/(id|en)/, "") || "/";
  if (bare === "/akun" || bare === "/akun/") return item.href === "/akun";
  return item.match.some((m) => m !== "/akun" && bare.startsWith(m));
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export function AkunHeader({ title, back }: { title: string; back?: string }) {
  const locale = useSafeLocale();
  const router = useRouter();
  const href = back ? `/${locale}${back}` : undefined;
  return (
    <div className="md:hidden sticky top-0 z-30 -mx-4 px-4 bg-[#F3F3F3]/90 backdrop-blur flex items-center gap-3 pt-3 pb-4 border-b border-[#E4E4E4]">
      <button
        type="button"
        onClick={() => (href ? router.push(href) : router.back())}
        className="w-10 h-10 -ml-1 grid place-items-center rounded-2xl bg-white shadow-[0_2px_8px_rgba(0,0,0,.08)] active:scale-95 transition"
        aria-label="Kembali"
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="#000000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg>
      </button>
      <AkunBreadcrumb current={title} className="min-w-0 flex-1" />
    </div>
  );
}

export default function AkunShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const locale = useSafeLocale();
  const { customer, ready } = useAkunCustomer();
  const prefix = `/${locale}`;
  const to = (href: string) => `${prefix}${href}`;

  const initials = getInitials(customer?.name || "U");

  /**
   * Keluar dari akun: hapus sesi lalu muat ulang ke beranda. Muat ulang penuh dipakai supaya
   * state customer yang sudah tersimpan di provider (dan halaman lain) ikut bersih.
   */
  async function handleLogout() {
    await logoutCustomer();
    window.location.href = `/${locale}`;
  }

  const bare = pathname.replace(/^\/(id|en)/, "") || "/";
  if (
    bare === "/akun/login" ||
    bare === "/akun/register" ||
    bare === "/akun/lupa-password"
  ) {
    return <>{children}</>;
  }

  const groups: { group: string | null; items: NavItem[] }[] = [];
  for (const item of NAV) {
    const last = groups[groups.length - 1];
    if (last && last.group === item.group) last.items.push(item);
    else groups.push({ group: item.group, items: [item] });
  }

  if (!ready) {
    return (
      <div className="akun-root min-h-screen grid place-items-center" style={{ background: "#F3F3F3" }}>
        <div className="w-9 h-9 rounded-full animate-pulse" style={{ background: "#000000" }} />
      </div>
    );
  }

  return (
    <div className="akun-root min-h-screen" style={{ background: "#F3F3F3" }}>
      {/* Gaya sidebar desktop — hanya berlaku md ke atas; mobile sama sekali tidak disentuh. */}
      <style>{AKUN_DESK_CSS}</style>
      {/* ── Desktop sidebar (fixed left) ── */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-64 bg-white border-r border-[#E0E0E0] z-50 flex-col">
        <div className="akun-side-brand h-16 flex items-center px-5 border-b border-[#E0E0E0] shrink-0">
          <span className="w-8 h-8 rounded-xl grid place-items-center text-[11px] font-extrabold mr-2.5" style={{ background: "#000000", color: "#fff" }}>S</span>
          <span className="font-extrabold text-[15px] tracking-tight" style={{ color: "#000000" }}>SAMAQU<span className="font-medium" style={{ color: "#C5C5C5" }}> Akun</span></span>
        </div>

        {/* min-h-0 wajib: tanpa itu flex item tidak bisa mengecil dari isinya, jadi nav luber
            dan scrollbar muncul walaupun sudah overflow-y-auto. */}
        <nav className="akun-side-nav flex-1 min-h-0 overflow-y-auto py-3 px-3">
          {groups.map((g, gi) => (
            <div key={g.group ?? `g${gi}`} className={gi > 0 ? "mt-4" : undefined}>
              {g.group ? <p className="akun-side-group">{g.group}</p> : null}
              {g.items.map((item) => {
                const on = isActive(pathname, item);
                return (
                  <Link
                    key={item.href}
                    href={to(item.href)}
                    prefetch={true}
                    aria-current={on ? "page" : undefined}
                    className={`akun-side-item${on ? " is-on" : ""}`}
                  >
                    <svg viewBox="0 0 24 24" className="akun-side-ico" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d={item.icon} />
                    </svg>
                    <span className="akun-side-label">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="akun-side-foot p-3 border-t border-[#E0E0E0] shrink-0">
          <a
            href="https://wa.me/6281234567890?text=Halo%20SAMAQU,%20saya%20butuh%20bantuan"
            target="_blank"
            rel="noopener noreferrer"
            className="akun-side-cs"
          >
            <svg viewBox="0 0 24 24" className="w-[15px] h-[15px]" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
            CS Support
          </a>

          {/* Keluar akun — ikut di sidebar desktop supaya paritas dengan mobile. */}
          <button type="button" onClick={handleLogout} className="akun-side-out">
            <svg viewBox="0 0 24 24" className="w-[15px] h-[15px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="m16 17 5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
            Keluar
          </button>
        </div>
      </aside>

      {/* ── Main area (single render of children) ── */}
      <div className="md:ml-64 flex flex-col min-h-screen">
        <header className="hidden md:block bg-white border-b border-[#E0E0E0] sticky top-0 z-30">
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

        <main className="flex-1 w-full">
          <div className="px-4 pt-4 pb-40 md:px-6 md:py-6 md:pb-6">
            <AkunBreadcrumb className="hidden md:block mb-5" />
            <AkunPageTransition>{children}</AkunPageTransition>
          </div>
        </main>

        <footer className="hidden md:block bg-white border-t border-[#E0E0E0] py-6">
          <p className="text-center text-xs text-[#8b9793]">&copy; 2026 SAMAQU. All rights reserved.</p>
        </footer>
      </div>

      {/* ── Mobile bottom nav (wireframe: 5 tab, cart FAB tengah) ── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 rounded-t-[24px] bg-white"
        style={{
          borderTop: "1px solid rgba(0,0,0,.06)",
          boxShadow: "0 -10px 30px -18px rgba(0,0,0,.22)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="mx-auto grid h-20 max-w-lg grid-cols-5 items-stretch px-3">
          {BOTTOM_LEFT.map((item) => {
            const on = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={to(item.href)}
                prefetch={true}
                aria-current={on ? "page" : undefined}
                className="flex h-20 flex-col items-center justify-center gap-1 pb-2 transition-colors"
                style={{ color: on ? "#000000" : "#a3aeaa" }}
              >
                <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" fill="none" stroke="currentColor" strokeWidth={on ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round">
                  <path d={item.icon} />
                </svg>
                <span className={`text-[10px] tracking-[0.02em] ${on ? "font-bold" : "font-medium"}`}>{item.label}</span>
              </Link>
            );
          })}

          <div className="relative flex h-20 items-end justify-center pb-2">
            <Link
              href={to("/cart")}
              aria-label="Keranjang"
              aria-current={isActive(pathname, { href: "/cart", match: ["/cart"] }) ? "page" : undefined}
              className={`absolute -top-6 grid h-14 w-14 place-items-center rounded-full bg-black text-white shadow-[0_8px_20px_rgba(0,0,0,.28)] transition active:scale-95 ${
                isActive(pathname, { href: "/cart", match: ["/cart"] }) ? "ring-2 ring-black ring-offset-2" : ""
              }`}
            >
              <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="20" r="1.4" />
                <circle cx="18" cy="20" r="1.4" />
                <path d="M3 4h2l2.4 10.4a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L21 8H7" />
              </svg>
              <CartBadge background="#ffffff" color="#000000" />
            </Link>
          </div>

          {BOTTOM_RIGHT.map((item) => {
            const on = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={to(item.href)}
                prefetch={true}
                aria-current={on ? "page" : undefined}
                className="flex h-20 flex-col items-center justify-center gap-1 pb-2 transition-colors"
                style={{ color: on ? "#000000" : "#a3aeaa" }}
              >
                <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" fill="none" stroke="currentColor" strokeWidth={on ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round">
                  <path d={item.icon} />
                </svg>
                <span className={`text-[10px] tracking-[0.02em] ${on ? "font-bold" : "font-medium"}`}>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

/**
 * Sidebar + tabel desktop (≥768px). Semua aturan di bawah hanya menyentuh elemen yang memang
 * khusus desktop; blok `md:hidden` (bottom nav, header mobile) tidak pernah kena.
 */
const AKUN_DESK_CSS = `
@media (min-width:768px){
  .akun-side-nav{padding:12px}
  .akun-side-group{margin:0 0 6px;padding:0 10px;font-size:10.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#9aa5a1}
  .akun-side-item{position:relative;display:flex;align-items:center;gap:10px;height:38px;padding:0 10px;margin-bottom:2px;border-radius:8px;font-size:13.5px;font-weight:600;color:#7b8481;text-decoration:none;transition:background .15s,color .15s}
  .akun-side-item:hover{background:#f7f5f0;color:#000}
  .akun-side-item.is-on{background:#f1f0ec;color:#000;font-weight:800}
  .akun-side-item.is-on::before{content:"";position:absolute;left:0;top:8px;bottom:8px;width:3px;border-radius:3px;background:#000}
  .akun-side-ico{width:17px;height:17px;flex:none}
  .akun-side-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .akun-side-badge{margin-left:auto;flex:none;min-width:18px;height:18px;padding:0 5px;display:grid;place-items:center;border-radius:999px;background:#000;color:#fff;font-size:10px;font-weight:800;line-height:1}
  .akun-side-cs{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;height:40px;border-radius:9px;background:#000;color:#fff;font-size:13px;font-weight:800;text-decoration:none;transition:opacity .15s}
  .akun-side-cs:hover{opacity:.9}
  .akun-side-out{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;height:36px;margin-top:6px;border:0;border-radius:9px;background:transparent;color:#b3261e;font-size:13px;font-weight:800;cursor:pointer;transition:background .15s}
  .akun-side-out:hover{background:#fdecec}

  /* ── Tabel pesanan desktop: fixed layout, tanpa scroll horizontal ── */
  .akun-table{width:100%;table-layout:fixed;border-collapse:collapse;text-align:left}
  .akun-table thead th{padding:10px 12px;border-bottom:1px solid #e6dfd2;font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#8a8a8a;white-space:nowrap}
  .akun-table thead th:first-child{padding-left:16px}
  .akun-table thead th:last-child{padding-right:16px}
  .akun-table thead th.is-right{text-align:right}
  .akun-table tbody td{padding:10px 12px;border-bottom:1px solid #f0f0f0;vertical-align:middle;min-width:0}
  .akun-table tbody td:first-child{padding-left:16px}
  .akun-table tbody td:last-child{padding-right:16px}
  .akun-table tbody tr:last-child td{border-bottom:0}
  .akun-table tbody tr{transition:background .15s}
  .akun-table tbody tr:hover{background:#fafafa}
  .akun-table td.is-right{text-align:right}
  .akun-order-no{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px;font-weight:800;color:#000;background:none;border:0;padding:0;cursor:pointer;text-align:left}
  .akun-order-no:hover{text-decoration:underline}
  .akun-order-date{display:block;margin-top:2px;font-size:11px;font-weight:500;color:#8b9793;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .akun-cell-thumb{width:40px;height:46px;border-radius:8px;background:#f2f2f2}
  .akun-cell-name{margin:0;font-size:12.5px;font-weight:700;color:#000;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .akun-cell-sub{margin:1px 0 0;font-size:11px;font-weight:500;color:#8b9793;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .akun-cell-total{font-size:12.5px;font-weight:800;color:#000;white-space:nowrap}
  .akun-pill{display:inline-block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:3px 9px;border-radius:999px;font-size:10.5px;font-weight:800;line-height:1.4;vertical-align:middle}
  .akun-pill.akun-pill-proses{background:#fdf3d9;color:#8a6516}
  .akun-pill.akun-pill-selesai{background:#000;color:#fff}
  .akun-row-go{display:inline-grid;place-items:center;width:24px;height:24px;border:0;border-radius:7px;background:#f5f3ee;color:#000;cursor:pointer;transition:background .15s}
  .akun-row-go:hover{background:#ebe7de}
  /* Tombol "Bayar Sekarang" di tabel pesanan — sejajar tinggi dengan pill status. */
  .akun-pay-btn{display:inline-flex;align-items:center;justify-content:center;padding:4px 11px;border:0;border-radius:999px;background:#B45309;color:#fff;font-size:10.5px;font-weight:800;line-height:1.4;white-space:nowrap;cursor:pointer;text-decoration:none;transition:background .15s}
  .akun-pay-btn:hover{background:#92400e}
}
`;