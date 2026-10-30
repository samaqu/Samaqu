"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  ShoppingBag,
  PackagePlus,
  ReceiptText,
  Wallet,
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  UserRound,
  LogOut,
} from "lucide-react";
import {
  ApiError,
  clearResellerToken,
  getResellerToken,
  resellerApi,
  type MeResponse,
} from "@/lib/reseller/client";

/** Kerangka portal reseller: sidebar (desktop), header, bottom nav 5 menu (mobile). */

const NAV_GROUPS: { label: string; items: [string, string, ReactNode][] }[] = [
  { label: "Utama", items: [["/reseller", "Beranda", <Home key="i" size={17} />]] },
  {
    label: "Jualan",
    items: [
      ["/reseller/pesanan/baru", "Buat Pesanan", <PackagePlus key="i" size={17} />],
      ["/reseller/katalog", "Katalog", <ShoppingBag key="i" size={17} />],
      ["/reseller/pesanan", "Pesanan", <ReceiptText key="i" size={17} />],
    ],
  },
  {
    label: "Saldo",
    items: [
      ["/reseller/top-up", "Top Up", <ArrowUpFromLine key="i" size={17} />],
      ["/reseller/tarik-saldo", "Tarik Saldo", <ArrowDownToLine key="i" size={17} />],
      ["/reseller/saldo", "Riwayat Saldo", <Wallet key="i" size={17} />],
    ],
  },
  { label: "Akun", items: [["/reseller/profil", "Profil", <UserRound key="i" size={17} />]] },
];

const BOTTOM_NAV: { href: string; label: string; icon: ReactNode }[] = [
  { href: "/reseller", label: "Beranda", icon: <Home size={20} /> },
  { href: "/reseller/pesanan/baru", label: "Pesan", icon: <PackagePlus size={20} /> },
  { href: "/reseller/pesanan", label: "Pesanan", icon: <History size={20} /> },
  { href: "/reseller/saldo", label: "Saldo", icon: <Wallet size={20} /> },
  { href: "/reseller/profil", label: "Akun", icon: <UserRound size={20} /> },
];

const TITLES: [string, string][] = [
  ["/reseller/pesanan/baru", "Buat Pesanan"],
  ["/reseller/pesanan/", "Detail Pesanan"],
  ["/reseller/pesanan", "Pesanan"],
  ["/reseller/katalog", "Katalog"],
  ["/reseller/top-up", "Top Up"],
  ["/reseller/tarik-saldo", "Tarik Saldo"],
  ["/reseller/saldo", "Riwayat Saldo"],
  ["/reseller/profil", "Profil"],
  ["/reseller", "Beranda"],
];

function titleFor(pathname: string): string {
  return TITLES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1] || "Beranda";
}

/** Menu aktif: `pesanan/baru` jangan ikut menyalakan menu "Pesanan". */
function isActive(pathname: string, href: string): boolean {
  if (href === "/reseller") return pathname === "/reseller";
  if (href === "/reseller/pesanan") return pathname === "/reseller/pesanan" || (pathname.startsWith("/reseller/pesanan/") && !pathname.startsWith("/reseller/pesanan/baru"));
  return pathname === href || pathname.startsWith(`${href}/`);
}

const ResellerContext = createContext<{ me: MeResponse; refreshMe: () => Promise<void> } | null>(null);

export function useReseller() {
  const ctx = useContext(ResellerContext);
  if (!ctx) throw new Error("useReseller harus dipakai di dalam <ResellerShell>");
  return ctx;
}

export default function ResellerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unauth">("loading");
  const loadedRef = useRef(false);

  const isLogin = pathname === "/reseller/login";

  const load = useCallback(async () => {
    if (!getResellerToken()) {
      setState("unauth");
      return;
    }
    try {
      const payload = await resellerApi.me();
      setMe(payload);
      setState("ready");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearResellerToken();
        setState("unauth");
      } else {
        // Gangguan sementara: tetap tampilkan shell dengan data terakhir.
        setState(me ? "ready" : "unauth");
      }
    }
  }, [me]);

  useEffect(() => {
    if (isLogin) {
      // Sudah punya sesi? Langsung ke dashboard.
      if (!getResellerToken()) return;
      resellerApi
        .me()
        .then(() => router.replace("/reseller"))
        .catch(() => clearResellerToken());
      return;
    }
    if (loadedRef.current) return;
    loadedRef.current = true;
    load();
  }, [isLogin, load, router]);

  useEffect(() => {
    if (isLogin || state !== "unauth") return;
    router.replace("/reseller/login");
  }, [isLogin, state, router]);

  const refreshMe = useCallback(async () => {
    await load();
  }, [load]);

  if (isLogin) return <>{children}</>;

  if (state !== "ready" || !me) {
    return (
      <div className="rs-root" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <span
          aria-label="Memuat"
          style={{
            width: 20,
            height: 20,
            border: "2px solid #e4e4e0",
            borderTopColor: "#111",
            borderRadius: "50%",
            animation: "rsSpin .7s linear infinite",
          }}
        />
        <style>{`@keyframes rsSpin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  const logout = async () => {
    try {
      await resellerApi.logout();
    } catch {
      /* sesi lokal tetap dihapus */
    }
    clearResellerToken();
    router.replace("/reseller/login");
  };

  const value = { me, refreshMe };

  return (
    <ResellerContext.Provider value={value}>
      <div className="rs-root">
        <div className="app">
          <aside className="sb">
            <div className="sb-head">
              <img src="/logo.svg" alt="SAMAQU" />
            </div>
            <p className="sb-kicker">Reseller Center</p>
            <nav className="sb-nav">
              {NAV_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="sb-label">{group.label}</p>
                  {group.items.map(([href, label, icon]) => (
                    <Link key={href} href={href} className={`sbn-item ${isActive(pathname, href) ? "on" : ""}`}>
                      {icon}
                      <span>{label}</span>
                    </Link>
                  ))}
                </div>
              ))}
            </nav>
            <div className="sb-foot">
              <button className="sbn-item" onClick={logout} type="button">
                <LogOut size={17} />
                <span>Keluar</span>
              </button>
            </div>
          </aside>

          <div className="main">
            <header className="hd">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="crumb hide-m">Reseller Center</div>
                <h1>{titleFor(pathname)}</h1>
              </div>
              <span className="muted small hide-m">
                Halo, <b className="bold">{me.reseller.owner_name.split(" ")[0]}</b>
              </span>
              <Link href="/reseller/profil" className="iconbtn" aria-label="Profil">
                <UserRound size={18} />
              </Link>
            </header>

            <main className="content">{children}</main>
          </div>
        </div>

        <nav className="bnav" aria-label="Menu portal reseller">
          {BOTTOM_NAV.map((item) => (
            <Link key={item.href} href={item.href} className={isActive(pathname, item.href) ? "on" : ""}>
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </ResellerContext.Provider>
  );
}
