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
  Layers,
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
  Menu,
  X,
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
      ["/reseller/stok", "Stok", <Layers key="i" size={17} />],
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
  { href: "/reseller/stok", label: "Stok", icon: <Layers size={20} /> },
];

const TITLES: [string, string][] = [
  ["/reseller/pesanan/baru", "Buat Pesanan"],
  ["/reseller/pesanan/", "Detail Pesanan"],
  ["/reseller/pesanan", "Pesanan"],
  ["/reseller/katalog", "Katalog"],
  ["/reseller/stok", "Stok"],
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
  const [state, setState] = useState<"loading" | "ready" | "unauth" | "error">("loading");
  const loadedRef = useRef(false);
  // Menu samping versi HP (drawer geser dari kiri). Di desktop sidebar selalu tampil.
  const [drawer, setDrawer] = useState(false);

  const isLogin = pathname === "/reseller/login";

  // Drawer menutup saat pindah halaman, dan bisa ditutup dengan tombol Esc.
  useEffect(() => {
    setDrawer(false);
  }, [pathname]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  /**
   * Ambil sesi reseller. Dipakai saat shell dimuat dan saat `refreshMe`.
   *
   * CATATAN PENTING (bug "OTP kelihatan crash, harus refresh dulu"):
   * setelah OTP diverifikasi, `router.replace("/reseller")` menjalankan shell ini SELAGI
   * token baru saja ditulis. Satu kegagalan sesaat di titik itu (request balapan, jaringan,
   * atau sesi belum kebaca) DULU langsung disimpulkan "unauth" → halaman dilempar balik ke
   * /reseller/login, jadi terasa crash; refresh barunya normal karena percobaan berikutnya
   * berhasil. Sekarang: 401 pun dicoba ulang beberapa kali sebelum menyerah, dan kalau masih
   * gagal bukan karena 401 (gangguan sementara) shell TIDAK meng-unauth-kan sesi.
   */
  const load = useCallback(async () => {
    const token = getResellerToken();
    if (!token) {
      setState("unauth");
      return;
    }

    // Beberapa percobaan singkat: cukup untuk menutup jeda pasca-login tanpa bikin
    // pengunjung yang memang belum login menunggu lama.
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const payload = await resellerApi.me();
        setMe(payload);
        setState("ready");
        return;
      } catch (error) {
        const unauthorized = error instanceof ApiError && error.status === 401;

        // Token masih ada → anggap gangguan sementara, coba lagi sebentar.
        if (attempt < maxAttempts) {
          await new Promise((resolve) => window.setTimeout(resolve, 250 * attempt));
          continue;
        }

        if (unauthorized) {
          // 401 setelah beberapa percobaan = sesi benar-benar tidak sah.
          clearResellerToken();
          setState("unauth");
        } else {
          // Gangguan sementara (jaringan / 5xx): JANGAN buang sesi dan JANGAN lempar ke
          // login — cukup tampilkan keadaan "gagal sementara" agar pengunjung bisa coba lagi.
          setState(me ? "ready" : "error");
        }
        return;
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
    // Muat sekali per kunjungan halaman reseller (bukan per render).
    if (loadedRef.current) return;
    loadedRef.current = true;
    load();
  }, [isLogin, load, router]);

  // Halaman login TIDAK boleh punya efek ini: jangan pernah redirect dari /reseller/login
  // ke /reseller/login (itu yang membuat tampilan seperti "crash"/berkedip).
  useEffect(() => {
    if (isLogin || state !== "unauth") return;
    router.replace("/reseller/login");
  }, [isLogin, state, router]);

  const refreshMe = useCallback(async () => {
    await load();
  }, [load]);

  // Selama "unauth" jangan render spinner: halaman sedang dialihkan ke /reseller/login oleh
  // effect di atas. Spinner tanpa keterangan itulah yang dulu terlihat seperti "crash".
  if (isLogin) return <>{children}</>;

  if (state === "unauth") return null;

  // Gagal sementara (bukan 401): sesi dipertahankan, tampilkan tombol coba lagi.
  if (state === "error" && !me) {
    return (
      <div className="rs-root" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, textAlign: "center" }}>
          <span style={{ fontSize: 14, color: "#6f6f6d" }}>
            Koneksi ke portal reseller sedang terganggu.
          </span>
          <button
            type="button"
            className="btn blk"
            onClick={() => {
              loadedRef.current = true;
              setState("loading");
              void load();
            }}
          >
            Coba lagi
          </button>
        </div>
      </div>
    );
  }

  if (state !== "ready" || !me) {
    return (
      <div className="rs-root" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
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
          <span style={{ fontSize: 13, color: "#6f6f6d" }}>Memuat portal reseller…</span>
        </div>
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
          <div className={`ovl${drawer ? " show" : ""}`} onClick={() => setDrawer(false)} aria-hidden="true" />

          <aside className={`sb${drawer ? " open" : ""}`}>
            <div className="sb-head">
              <img src="/logo.svg" alt="SAMAQU" />
              <button type="button" className="sb-close show-m" onClick={() => setDrawer(false)} aria-label="Tutup menu">
                <X size={18} />
              </button>
            </div>
            <p className="sb-kicker">Reseller Center</p>
            <nav className="sb-nav">
              {NAV_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="sb-label">{group.label}</p>
                  {group.items.map(([href, label, icon]) => (
                    <Link
                      key={href}
                      href={href}
                      className={`sbn-item ${isActive(pathname, href) ? "on" : ""}`}
                      onClick={() => setDrawer(false)}
                    >
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
              <button
                type="button"
                className="iconbtn show-m"
                onClick={() => setDrawer(true)}
                aria-label="Buka menu"
                aria-expanded={drawer}
              >
                <Menu size={18} />
              </button>
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
