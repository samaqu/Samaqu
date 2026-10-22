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

/** Menu dikelompokkan seperti sidebar /ops (label grup + item rounded). */
const NAV_GROUPS: { label: string; items: [string, string, string][] }[] = [
  { label: "Utama", items: [["", "Ringkasan", "dash"]] },
  {
    label: "Afiliasi",
    items: [
      ["produk", "Katalog Produk", "bag"],
      ["produk-saya", "Produk Saya", "pkg"],
      ["tautan", "Tautan Affiliate", "link"],
      ["pesanan", "Pesanan", "receipt"],
      ["komisi", "Komisi Saya", "coins"],
      ["penarikan", "Penarikan Dana", "cash"],
    ],
  },
  {
    label: "Konten",
    items: [
      ["materi", "Materi Promosi", "image"],
      ["performa", "Performa", "chart"],
      ["notifikasi", "Pusat Notifikasi", "bell"],
    ],
  },
  {
    label: "Akun",
    items: [
      ["bantuan", "Pusat Bantuan", "help"],
      ["pengaturan", "Pengaturan Akun", "gear"],
    ],
  },
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

/** Halaman legal publik (tanpa sesi), sama seperti login/daftar. */
function isLegalPath(pathname: string): boolean {
  const seg = pathname.replace(/\/+$/, "").split("/").filter(Boolean).pop() || "";
  return seg === "syarat-ketentuan" || seg === "kebijakan-privasi";
}

/** Semua halaman publik yang tidak butuh sidebar/sesi. */
function isPublicPath(pathname: string): boolean {
  return isAuthPath(pathname) || isLegalPath(pathname);
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
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const [unread, setUnread] = useState(0);
  // Sesi affiliate cukup dimuat sekali per mount; pindah menu tidak boleh
  // memicu spinner/refetch penuh.
  const loadedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      // Tanpa sesi lokal, jangan panggil API (menghindari 401 yang tidak perlu).
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        setMe(null);
        return;
      }
      const payload = await affiliateFetch<MePayload>("/api/affiliate/me");
      setMe(payload);
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isPublicPath(pathname)) {
      setLoading(false);
      return;
    }
    if (loadedRef.current) return;
    loadedRef.current = true;
    setLoading(true);
    load();
  }, [pathname, load]);

  // Halaman dalam portal tanpa sesi → langsung ke halaman masuk (bukan kartu fallback).
  useEffect(() => {
    if (loading || me) return;
    if (isPublicPath(pathname) || isLandingPath(pathname)) return;
    router.replace(portalPath(portalBaseFor(window.location.hostname), "login"));
  }, [loading, me, pathname, router]);

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

  if (isPublicPath(pathname)) {
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
    // Halaman depan portal = landing publik; halaman dalam sudah diarahkan ke login.
    if (isLandingPath(pathname)) return <AffiliateLanding />;
    return null;
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
      className={`sbn-item ${key === seg ? "on" : ""}`}
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

  const statusLabel =
    affiliate.status === "aktif"
      ? "Affiliate Aktif"
      : affiliate.status === "menunggu"
        ? "Menunggu Persetujuan"
        : affiliate.status === "ditolak"
          ? "Ditolak"
          : "Nonaktif";

  const logout = async () => {
    await supabase.auth.signOut();
    loadedRef.current = false;
    setMe(null);
    router.push(portalPath(base, "login"));
  };

  return (
    <AffiliateContext.Provider value={value}>
      <div className="af-root">
      <div className="app">
        <div className={`ovl ${drawer ? "show" : ""}`} onClick={() => setDrawer(false)} />

        <aside className={`sb ${drawer ? "open" : ""}`}>
          <div className="sbn-head">
            <Link href={portalPath(base)} aria-label="SAMAQU Affiliate Center">
              <img src="/logo.svg" alt="SAMAQU" />
            </Link>
            <p className="sbn-kicker">Affiliate Center</p>
            <button
              className="sbn-close show-m"
              onClick={() => setDrawer(false)}
              aria-label="Tutup menu"
              type="button"
            >
              <Icon name="x" />
            </button>
          </div>

          <div className="sbn-scroll">
            {NAV_GROUPS.map((group) => (
              <div className="sbn-group" key={group.label}>
                <p className="sbn-label">{group.label}</p>
                <div className="sbn-items">{group.items.map(navItem)}</div>
              </div>
            ))}
          </div>

          <div className="sbn-foot">
            <button className="sbn-item sbn-logout" onClick={logout} type="button">
              <Icon name="logout" />
              <span>Keluar</span>
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
                    <div className="small muted" style={{ marginTop: 2 }}>
                      {affiliate.affiliate_code}
                    </div>
                    <div style={{ marginTop: 5 }}>
                      <Badge label={statusLabel} />
                    </div>
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
      </div>
    </AffiliateContext.Provider>
  );
}
