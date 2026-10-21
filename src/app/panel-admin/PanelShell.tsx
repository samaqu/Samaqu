"use client";

/**
 * Kerangka panel admin — tema dari mockup HTML (samaqu-admin-dashboard-2/pages/index.html).
 *
 * Ada gerbang login: semua API `/api/ops/*` butuh sesi admin Supabase, jadi isi panel baru
 * dirender setelah sesi terbukti admin (probe `GET /api/ops/leads?limit=1`), sama seperti ops.
 *
 * Catatan: menu Transaksi/Produk/Leads belum dibangun (badge `SOON`), jadi sengaja non-link.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Toaster } from "@/components/ops/ui/toaster";
import { OpsPageMapProvider } from "@/lib/ops-router";
import { useWibLongDate } from "./wib-date";
import styles from "./panel.module.css";

const AVATAR =
  "https://res.cloudinary.com/j4ka1ty6/image/upload/w_96,h_96,c_fill,f_auto,q_auto/v1792158930/Avatar_Hijab_Merah_Muda_dalam_Lencana.png";

type PanelTheme = "berry" | "sunflower" | "tropical";
const THEME_KEY = "samaqu:panel-theme";
const THEMES: { id: PanelTheme; label: string; hint: string }[] = [
  { id: "berry", label: "Berry", hint: "Tema default SAMAQU" },
  { id: "sunflower", label: "Bunga Matahari", hint: "Krem hangat + aksen emas" },
  { id: "tropical", label: "Tropical Beach", hint: "Biru laut + krem pantai" },
];
/** Kelas CSS module per tema. Berry = tema dasar (tanpa kelas tambahan). */
const THEME_APP_CLASS: Record<PanelTheme, string> = {
  berry: "",
  sunflower: styles.sunflower,
  tropical: styles.tropical,
};
/** Swatch kecil di tombol & menu pemilih tema. */
const THEME_SWATCH_CLASS: Record<PanelTheme, string> = {
  berry: "",
  sunflower: styles.themeSwatchSun,
  tropical: styles.themeSwatchTropical,
};
const themeLabel = (id: PanelTheme) => THEMES.find((option) => option.id === id)?.label ?? "Berry";

type IconName = "home" | "card" | "box" | "users" | "spark" | "return";

function NavIcon({ name }: { name: IconName }) {
  switch (name) {
    case "home":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M3 11l9-8 9 8v10H3z" />
        </svg>
      );
    case "card":
      return (
        <svg viewBox="0 0 24 24">
          <rect x="3" y="6" width="18" height="13" rx="2" />
          <path d="M3 10h18" />
        </svg>
      );
    case "box":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8" />
        </svg>
      );
    case "users":
      return (
        <svg viewBox="0 0 24 24">
          <circle cx="9" cy="8" r="4" />
          <path d="M2 21c0-4 3-6 7-6s7 2 7 6M17 4a4 4 0 010 8" />
        </svg>
      );
    case "spark":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M11 3l1.7 4.9L17.6 9.6l-4.9 1.7L11 16.2 9.3 11.3 4.4 9.6l4.9-1.7z" />
          <path d="M18 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
        </svg>
      );
    case "return":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 4v5h5" />
        </svg>
      );
  }
}

type NavItem = { label: string; href: string; icon: IconName; soon?: boolean };

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Operasional",
    items: [
      { label: "Beranda", href: "/panel-admin", icon: "home" },
      { label: "Transaksi", href: "/panel-admin/transaksi", icon: "card" },
      { label: "Return", href: "/panel-admin/retur", icon: "return" },
    ],
  },
  {
    section: "Katalog & Data",
    items: [
      { label: "Produk", href: "/panel-admin/produk", icon: "box" },
      { label: "Stok Opname", href: "/panel-admin/stok-opname", icon: "box" },
      { label: "Leads", href: "/panel-admin/leads", icon: "users" },
    ],
  },
  {
    section: "Bantuan",
    items: [{ label: "Asisten", href: "/panel-admin/assistant", icon: "spark" }],
  },
];

/**
 * Peta nama halaman (konvensi Base44) → route panel admin. Dipakai halaman ops yang dititipkan
 * ke panel supaya navigasi internalnya ("Tambah Produk", "Tambah Barang Masuk", "kembali")
 * tetap berada di `/panel-admin/...`, bukan lompat ke `/ops/*` (yang akan 404 di host admin).
 */
const PANEL_PAGES: Record<string, string> = {
  Dashboard: "/panel-admin",
  Transaksi: "/panel-admin/transaksi",
  Leads: "/panel-admin/leads",
  MasterProduk: "/panel-admin/produk",
  TambahProduk: "/panel-admin/produk/tambah",
  TambahBarangMasuk: "/panel-admin/produk/barang-masuk",
};

export default function PanelShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const tanggal = useWibLongDate();
  const [ready, setReady] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<PanelTheme>("berry");
  const [themeOpen, setThemeOpen] = useState(false);

  // Halaman Transaksi memakai halaman ops yang sama → butuh React Query + Toaster (keduanya di
  // OpsShell). Client dibuat per-instance supaya tidak dibagi antar-request saat SSR.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
            staleTime: 60 * 1000,
            gcTime: 10 * 60 * 1000,
            // PENTING: halaman /ops memakai `initialData: []`. Tanpa baris ini, array kosong
            // dianggap data segar sehingga query tidak jalan dan tabel tampil kosong.
            initialDataUpdatedAt: 0,
          },
        },
      })
  );

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(THEME_KEY);
      if (saved && THEMES.some((option) => option.id === saved)) setTheme(saved as PanelTheme);
    } catch {
      /* localStorage bisa diblokir — tetap pakai tema default */
    }
  }, []);

  function selectTheme(next: PanelTheme) {
    setTheme(next);
    setThemeOpen(false);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      /* abaikan */
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        if (!cancelled) setReady(true);
        return;
      }
      try {
        const res = await fetch("/api/ops/leads?limit=1", { headers: { Authorization: `Bearer ${token}` } });
        if (!cancelled) setAuthorized(res.ok);
      } catch {
        if (!cancelled) setAuthorized(false);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err || !data.session) {
      setError(err?.message || "Login gagal");
      setBusy(false);
      return;
    }
    const res = await fetch("/api/ops/leads?limit=1", {
      headers: { Authorization: `Bearer ${data.session.access_token}` },
    });
    if (!res.ok) {
      setError("Akun ini bukan admin SAMAQU");
      await supabase.auth.signOut();
      setBusy(false);
      return;
    }
    setAuthorized(true);
    setBusy(false);
  }

  const appClass = `${styles.app}${THEME_APP_CLASS[theme] ? ` ${THEME_APP_CLASS[theme]}` : ""}`;

  if (!ready) {
    return (
      <div className={appClass}>
        <div className={styles.gate}>
          <div className={styles.gateCard}>
            <div className={styles.gateBrand}>
              <div className={styles.logo}>S</div>
              <div>
                <b>SAMAQU</b>
                <small>Panel Admin</small>
              </div>
            </div>
            <p className={styles.gateHint}>Memuat…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className={appClass}>
        <div className={styles.gate}>
          <form className={styles.gateCard} onSubmit={handleLogin}>
            <div className={styles.gateBrand}>
              <div className={styles.logo}>S</div>
              <div>
                <b>SAMAQU</b>
                <small>Panel Admin</small>
              </div>
            </div>
            <label className={styles.gateLabel} htmlFor="pa-email">
              Email
            </label>
            <input
              id="pa-email"
              className={styles.gateInput}
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <label className={styles.gateLabel} htmlFor="pa-pass">
              Password
            </label>
            <input
              id="pa-pass"
              className={styles.gateInput}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error ? <p className={styles.gateError}>{error}</p> : null}
            <button className={styles.gateBtn} type="submit" disabled={busy}>
              {busy ? "Memproses…" : "Masuk"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const activeItem = NAV.flatMap((g) => g.items).find((item) =>
    item.href === "/panel-admin" ? pathname === item.href : pathname.startsWith(item.href)
  );

  return (
    <QueryClientProvider client={queryClient}>
      <div className={appClass}>
      <aside className={styles.side}>
        <div className={styles.brand}>
          <div className={styles.logo}>S</div>
          <div>
            <b>SAMAQU</b>
            <small>Admin Operasional</small>
          </div>
        </div>

        <nav className={styles.nav}>
          {NAV.map((group) => (
            <div key={group.section}>
              <div className={styles.sec}>{group.section}</div>
              {group.items.map((item) => {
                if (item.soon) {
                  return (
                    <div key={item.label} className={`${styles.navItem} ${styles.navItemSoon}`}>
                      <NavIcon name={item.icon} />
                      <span>{item.label}</span>
                      <span className={styles.soon}>SOON</span>
                    </div>
                  );
                }
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={activeItem?.href === item.href ? styles.on : undefined}
                  >
                    <NavIcon name={item.icon} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className={styles.foot}>
          <img className={styles.footAv} src={AVATAR} alt="" width={44} height={44} />
          <div className={styles.footText}>
            Engineered by <b>Surya</b>
          </div>
        </div>
      </aside>

      <main className={`${styles.main}${pathname.startsWith("/panel-admin/assistant") ? ` ${styles.mainFill}` : ""}`}>
        <div className={styles.top}>
          <div className={styles.date}>
            <svg viewBox="0 0 24 24">
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M3 10h18M8 3v4M16 3v4" />
            </svg>
            {tanggal}
          </div>
          <div className={styles.themeWrap}>
            <button
              type="button"
              className={styles.themeBtn}
              onClick={() => setThemeOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={themeOpen}
              aria-label="Ganti tema panel admin"
              title="Ganti tema"
            >
              <span className={`${styles.themeSwatch} ${THEME_SWATCH_CLASS[theme]}`} />
              <span className={styles.themeLabel}>{themeLabel(theme)}</span>
              <svg viewBox="0 0 24 24" className={styles.themeChevron}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {themeOpen ? (
              <>
                <button
                  type="button"
                  className={styles.themeScrim}
                  onClick={() => setThemeOpen(false)}
                  aria-label="Tutup pilihan tema"
                />
                <div className={styles.themeMenu} role="menu">
                  {THEMES.map((option) => {
                    const active = theme === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={active}
                        className={`${styles.themeOption}${active ? ` ${styles.themeOptionOn}` : ""}`}
                        onClick={() => selectTheme(option.id)}
                      >
                        <span className={`${styles.themeSwatch} ${THEME_SWATCH_CLASS[option.id]}`} />
                        <span className={styles.themeOptionText}>
                          <b>{option.label}</b>
                          <small>{option.hint}</small>
                        </span>
                        {active ? (
                          <svg viewBox="0 0 24 24" className={styles.themeCheck}>
                            <path d="M5 12l4 4L19 6" />
                          </svg>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>
          <div className={styles.bell}>
            <svg viewBox="0 0 24 24">
              <path d="M6 16V11a6 6 0 0112 0v5l2 2H4zM10 21h4" />
            </svg>
          </div>
          <div className={styles.user}>
            <img className={styles.av} src={AVATAR} alt="Lea" width={40} height={40} />
            <div>
              <b>Lea</b>
              <small>SAMAQU</small>
            </div>
          </div>
        </div>

        <OpsPageMapProvider pages={PANEL_PAGES}>{children}</OpsPageMapProvider>
      </main>
      <Toaster />
      </div>
    </QueryClientProvider>
  );
}
