"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "./icons";
import { Badge } from "./ui";
import { affiliateFetch, type MePayload } from "@/lib/affiliate/client";
import { portalBaseFor, portalPath } from "@/lib/affiliate/site";
import { supabaseAffiliate as supabase } from "@/lib/supabase-affiliate";
import AffiliateLanding from "./AffiliateLanding";

/**
 * Kerangka portal Affiliate — sidebar + header, mengikuti mockup
 * "SAMAQU Affiliate Center" (struktur class & urutan menu sama persis).
 */

export const AFFILIATE_NAV: [string, string, string][] = [
  ["", "Ringkasan", "dash"],
  ["produk", "Katalog Produk", "bag"],
  ["produk-saya", "Produk Saya", "pkg"],
  ["tautan", "Tautan Affiliate", "link"],
  ["pesanan", "Pesanan", "receipt"],
  ["komisi", "Komisi Saya", "coins"],
  ["penarikan", "Penarikan Dana", "cash"],
  ["materi", "Materi Promosi", "image"],
  ["performa", "Performa", "chart"],
  ["notifikasi", "Pusat Notifikasi", "bell"],
  ["bantuan", "Pusat Bantuan", "help"],
  ["pengaturan", "Pengaturan Akun", "gear"],
];

const AffiliateContext = createContext<{
  me: MePayload | null;
  refresh: () => Promise<void>;
} | null>(null);

export function useAffiliate() {
  const ctx = useContext(AffiliateContext);
  if (!ctx) throw new Error("useAffiliate harus dipakai di dalam <AffiliateShell>");
  return ctx;
}

function initials(name: string): string {
  return (
    name
      .split(" ")
      .map((x) => x[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "A"
  );
}

function isAuthPath(pathname: string): boolean {
  // Di subdomain portal middleware me-rewrite path, jadi yang dicek adalah segmen
  // terakhir ("/login", "/daftar") — bukan path lengkap.
  const seg = pathname.replace(/\/+$/, "").split("/").filter(Boolean).pop() || "";
  return seg === "login" || seg === "daftar";
}

/** Halaman depan portal: `/affiliate` (atau `/` di subdomain) → landing publik. */
function isLandingPath(pathname: string): boolean {
  const parts = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  return parts.length === 0 || (parts.length === 1 && parts[0] === "affiliate");
}

export default function AffiliateShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // Prefix path portal: "" di affiliate.samaqu.id, "/affiliate" di domain utama.
  // Di-set setelah mount supaya render server & klien sama (nggak hydration mismatch).
  const [base, setBase] = useState("/affiliate");
  useEffect(() => {
    setBase(portalBaseFor(window.location.hostname));
  }, []);
  const [me, setMe] = useState<MePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const payload = await affiliateFetch<MePayload>("/api/affiliate/me");
      setMe(payload);
      setAuthError("");
    } catch (e) {
      setMe(null);
      const message = e instanceof Error ? e.message : "";
      // 401 = sesi tidak valid / bukan akun affiliate → pakai kalimat yang ramah,
      // bukan "Unauthorized" mentah dari API.
      setAuthError(
        !message || /unauthorized|401/i.test(message)
          ? ""
          : message,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthPath(pathname)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    load();
  }, [pathname, load]);

  // Notifikasi belum dibaca (dihitung dari data nyata, disimpan di browser).
  useEffect(() => {
    if (!me) return;
    let alive = true;
    (async () => {
      try {
        const res = await affiliateFetch<{ notifications: { id: string }[] }>(
          "/api/affiliate/notifications",
        );
        if (!alive) return;
        const readIds: string[] = JSON.parse(localStorage.getItem("sq_af_read") || "[]");
        const unreadCount = (res.notifications || []).filter((n) => !readIds.includes(n.id)).length;
        setUnread(unreadCount);
      } catch {
        /* abaikan — notifikasi bukan hal kritis */
      }
    })();
    return () => {
      alive = false;
    };
  }, [me, pathname]);

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  const value = useMemo(() => ({ me, refresh }), [me, refresh]);

  if (isAuthPath(pathname)) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span
          style={{
            width: 18,
            height: 18,
            border: "2px solid #E5E7EB",
            borderTopColor: "#111827",
            borderRadius: "50%",
            animation: "afSpin .7s linear infinite",
          }}
        />
        <style>{`@keyframes afSpin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (!me) {
    // Halaman depan portal = landing publik (ajakan daftar/masuk). Halaman dalam lain
    // tetap menampilkan kartu "masuk dulu" seperti sebelumnya.
    if (isLandingPath(pathname)) return <AffiliateLanding />;

    return (
      <div
        className="min-h-screen flex items-center justify-center p-5 relative"
        style={{ background: "#f0f2f5" }}
      >
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div
            className="absolute left-0 top-0 w-[65%] h-full"
            style={{ clipPath: "polygon(0 0, 55% 0, 48% 100%, 0 100%)" }}
          >
            <img
              src="/affiliate/auth-hero.jpg"
              alt=""
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/30" />
          </div>
        </div>

        <div className="main-card relative w-full max-w-[520px] bg-white rounded-[2.5rem] shadow-lg p-4 md:p-5">
          <div className="w-full px-4 py-6 flex flex-col justify-center">
            <div className="flex items-center justify-between mb-12">
              <span className="font-extrabold text-xl tracking-widest text-gray-900 uppercase">
                SAMAQU
              </span>
              <span className="flex items-center gap-2 border border-gray-200 rounded-full px-3 py-1 text-xs font-medium text-gray-600">
                🇮🇩 ID
              </span>
            </div>

            <div className="w-full max-w-[340px] mx-auto text-center mb-10">
              <h1 className="text-4xl font-extrabold text-gray-900 mb-2">
                Masuk ke akun affiliate
              </h1>
              <p className="text-sm text-gray-500 font-medium">
                {authError || "Sesi affiliate tidak ditemukan. Silakan masuk kembali."}
              </p>
            </div>

            <div className="w-full max-w-[340px] mx-auto">
              <Link
                href={portalPath(base, "login")}
                className="w-full rounded-xl py-3.5 text-sm font-semibold flex items-center justify-center"
                style={{
                  backgroundColor: "#eb4d4b",
                  color: "white",
                  boxShadow: "0 10px 15px -3px rgba(235,77,75,0.2)",
                }}
              >
                Masuk
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const affiliate = me.affiliate;
  const displayName = affiliate.display_name || affiliate.full_name;
  const initial = initials(displayName);
  const seg = (base && pathname.startsWith(base) ? pathname.slice(base.length) : pathname)
    .split("/")
    .filter(Boolean)[0] || "";
  const current = AFFILIATE_NAV.find((n) => n[0] === seg) || AFFILIATE_NAV[0];

  const navItem = ([key, label, icon]: [string, string, string]) => (
    <Link
      key={key}
      href={portalPath(base, key)}
      className={`ni ${key === seg ? "on" : ""}`}
      data-tip={label}
      onClick={() => {
        setDrawer(false);
        setMenu(false);
      }}
    >
      <Icon name={icon} />
      <span>{label}</span>
      {key === "notifikasi" && unread ? <b className="cnt">{unread}</b> : null}
    </Link>
  );

  const logout = async () => {
    await supabase.auth.signOut();
    router.push(portalPath(base, "login"));
  };

  return (
    <AffiliateContext.Provider value={value}>
      <div className={`app ${collapsed ? "colp" : ""}`}>
        <div className={`ovl ${drawer ? "show" : ""}`} onClick={() => setDrawer(false)} />

        <aside className={`sb ${collapsed ? "col" : ""} ${drawer ? "open" : ""}`}>
          <div className="brand">
            <div className="logo">S</div>
            <div>
              <b>SAMAQU</b>
              <small>AFFILIATE CENTER</small>
            </div>
          </div>

          <div className="prof">
            <div className="av">{initial}</div>
            <div style={{ minWidth: 0 }}>
              <div className="n">{displayName}</div>
              <div className="id">ID Affiliate: {affiliate.affiliate_code}</div>
              <div style={{ marginTop: 5 }}>
                <Badge
                  label={
                    affiliate.status === "aktif"
                      ? "Affiliate Aktif"
                      : affiliate.status === "menunggu"
                        ? "Menunggu Persetujuan"
                        : affiliate.status === "ditolak"
                          ? "Ditolak"
                          : "Nonaktif"
                  }
                />
              </div>
            </div>
          </div>

          <nav className="nav">
            <div className="lbl">MENU UTAMA</div>
            {AFFILIATE_NAV.slice(0, 10).map(navItem)}
          </nav>

          <div className="sbf">
            {navItem(AFFILIATE_NAV[10])}
            {navItem(AFFILIATE_NAV[11])}
            <button className="ni" data-tip="Keluar" onClick={logout} type="button">
              <Icon name="logout" />
              <span>Keluar</span>
            </button>
            <button
              className="ni hide-m"
              data-tip="Perluas menu"
              onClick={() => setCollapsed((v) => !v)}
              type="button"
            >
              <Icon name="panel" />
              <span>Ciutkan menu</span>
            </button>
          </div>
        </aside>

        <div className="main">
          <header className="hd">
            <button
              className="iconbtn show-m"
              onClick={() => setDrawer((v) => !v)}
              aria-label="Buka menu"
              type="button"
            >
              <Icon name="menu" />
            </button>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="bc">
                <Link href={portalPath(base)}>Affiliate Center</Link>
                {seg ? (
                  <>
                    {" "}
                    <Icon name="chevr" className="sm" />{" "}
                    <Link href={portalPath(base, seg)}>{current[1]}</Link>
                  </>
                ) : null}
              </div>
              <h1>{current[1]}</h1>
            </div>

            {seg ? (
              <Link href={portalPath(base)} className="btn s sm hide-m">
                <Icon name="back" className="sm" />
                Ringkasan
              </Link>
            ) : null}

            <span className="muted small hide-m">
              Halo, <b className="dark">{displayName.split(" ")[0]}</b>
            </span>

            <Link href={portalPath(base, "notifikasi")} className="iconbtn" aria-label="Notifikasi">
              <Icon name="bell" />
              {unread ? <span className="dot">{unread}</span> : null}
            </Link>

            <div style={{ position: "relative" }}>
              <button
                className="row"
                style={{ border: 0, background: "none", cursor: "pointer", gap: 6 }}
                onClick={() => setMenu((v) => !v)}
                type="button"
              >
                <div className="av" style={{ width: 36, height: 36 }}>
                  {initial}
                </div>
                <Icon name="chevd" className="sm" />
              </button>

              {menu ? (
                <div className="dd">
                  <div
                    style={{
                      padding: "8px 10px 10px",
                      borderBottom: "1px solid var(--af-bd)",
                      marginBottom: 4,
                    }}
                  >
                    <div className="b dark">{affiliate.full_name}</div>
                    <div className="small muted">{affiliate.email}</div>
                  </div>
                  <Link href={portalPath(base, "pengaturan")} onClick={() => setMenu(false)}>
                    <Icon name="user" className="sm" />
                    Lihat Profil
                  </Link>
                  <Link href={portalPath(base, "pengaturan")} onClick={() => setMenu(false)}>
                    <Icon name="gear" className="sm" />
                    Pengaturan Akun
                  </Link>
                  <Link href={portalPath(base, "bantuan")} onClick={() => setMenu(false)}>
                    <Icon name="help" className="sm" />
                    Pusat Bantuan
                  </Link>
                  <button onClick={logout} style={{ color: "var(--af-err)" }} type="button">
                    <Icon name="logout" className="sm" />
                    Keluar
                  </button>
                </div>
              ) : null}
            </div>
          </header>

          <main className="content">{children}</main>
        </div>
      </div>
    </AffiliateContext.Provider>
  );
}
