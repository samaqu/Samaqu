"use client";

/**
 * Kerangka panel admin — tema dari mockup HTML (samaqu-admin-dashboard-2/pages/index.html).
 *
 * Ada gerbang login: semua API `/api/ops/*` butuh sesi admin Supabase, jadi isi panel baru
 * dirender setelah sesi terbukti admin (probe `GET /api/ops/leads?limit=1&options=0`), sama seperti ops.
 *
 * Catatan: menu Transaksi/Produk/Leads belum dibangun (badge `SOON`), jadi sengaja non-link.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Toaster } from "@/components/ops/ui/toaster";
import ConfirmDialog from "@/components/ops/ConfirmDialog";
import { OpsPageMapProvider } from "@/lib/ops-router";
import { useWibLongDate } from "./wib-date";
import styles from "./panel.module.css";
import { useAdminPresenceTracker, useOnlineAdmins } from "@/lib/use-admin-presence";
import { STATUS_CHANGED_EVENT, STATUS_REQUEST_EVENT, STATUS_STYLE, asWorkStatus, needsCheckIn, optionsFor, shownStatus, type WorkStatus } from "@/lib/admin-status";
import { usePendingReviewCount } from "@/lib/use-pending-reviews";
import { useResellerQueueCount } from "@/lib/use-reseller-queue";
import { usePendingDraftCount } from "@/lib/use-pending-drafts";

const AVATAR =
  "https://res.cloudinary.com/j4ka1ty6/image/upload/w_96,h_96,c_fill,f_auto,q_auto/v1792158930/Avatar_Hijab_Merah_Muda_dalam_Lencana.png";

type PanelTheme = "berry" | "sunflower" | "tropical";
const THEME_KEY = "samaqu:panel-theme";
/** Status lipat sidebar (dipakai lagi saat halaman dibuka ulang / pindah halaman). */
const SIDEBAR_KEY = "samaqu:panel-sidebar";
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

type IconName = "home" | "card" | "box" | "users" | "spark" | "return" | "star" | "reseller" | "tag" | "alert" | "clock" | "clipboard" | "dashboard" | "chat";

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
    case "tag":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 3 12V5a2 2 0 0 1 2-2h7a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.6z" />
          <circle cx="7.5" cy="7.5" r="1.4" />
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
    case "alert":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M12 3 2.5 20h19z" />
          <path d="M12 9v5" />
          <path d="M12 17.5v.01" />
        </svg>
      );
    case "star":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M12 3l2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
        </svg>
      );
    case "dashboard":
      return (
        <svg viewBox="0 0 24 24">
          <rect x="3" y="3" width="7.5" height="7.5" rx="1.8" />
          <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.8" />
          <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.8" />
          <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.8" />
        </svg>
      );
    case "clock":
      return (
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "clipboard":
      return (
        <svg viewBox="0 0 24 24">
          <rect x="5" y="4" width="14" height="17" rx="2" />
          <path d="M9 4.5h6v2.5H9z" />
          <path d="M8.5 13l2.2 2.2L15.5 10.5" />
        </svg>
      );
    case "chat":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M4 5h16v11H9l-5 4z" />
          <path d="M8 9.5h8M8 12.5h5" />
        </svg>
      );
    case "reseller":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M3 9l2-5h14l2 5" />
          <path d="M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z" />
          <path d="M5 13v8h14v-8" />
        </svg>
      );
  }
}

type NavItem = { label: string; href: string; icon: IconName; soon?: boolean; badge?: "reviews" | "reseller" | "drafts" };

type NavGroup = { section: string; icon: IconName; items: NavItem[] };

/** Menu paling atas: berdiri sendiri, tidak masuk grup yang bisa dilipat. */
const NAV_TOP: NavItem[] = [
  { label: "Dashboard", href: "/panel-admin", icon: "dashboard" },
  { label: "AI Performance", href: "/panel-admin/ai-performance", icon: "spark" },
];

/** Menu paling bawah: juga berdiri sendiri. */
const NAV_BOTTOM: NavItem[] = [{ label: "Asisten", href: "/panel-admin/assistant", icon: "spark" }];

/**
 * Grup menu yang bisa dilipat (judul grup = ikon + nama + panah; isinya teks saja).
 * Grup yang berisi halaman aktif terbuka otomatis. Menu, route, dan badge sama seperti
 * sebelumnya — hanya cara menampilkannya yang berubah.
 */
const NAV: NavGroup[] = [
  {
    section: "Penjualan",
    icon: "card",
    items: [
      { label: "Perlu Review", href: "/panel-admin/perlu-review", icon: "alert", badge: "drafts" },
      { label: "Transaksi", href: "/panel-admin/transaksi", icon: "card" },
      { label: "Pre-Order", href: "/panel-admin/preorder", icon: "clock" },
      { label: "Return", href: "/panel-admin/retur", icon: "return" },
    ],
  },
  {
    section: "Tim & Chat",
    icon: "chat",
    items: [
      { label: "Inbox WA", href: "/panel-admin/inbox-wa", icon: "chat" },
      { label: "Template Chat", href: "/panel-admin/template-chat", icon: "clipboard" },
      { label: "Absensi", href: "/panel-admin/absensi", icon: "clock" },
      { label: "Performa Admin", href: "/panel-admin/performa-admin", icon: "dashboard" },
      { label: "Tim Admin", href: "/panel-admin/tim-admin", icon: "users" },
    ],
  },
  {
    section: "Pelanggan",
    icon: "users",
    items: [
      { label: "Leads", href: "/panel-admin/leads", icon: "users" },
      { label: "Reseller", href: "/panel-admin/reseller", icon: "reseller", badge: "reseller" },
      { label: "Promo", href: "/panel-admin/promo", icon: "tag" },
      { label: "Ulasan Pelanggan", href: "/panel-admin/ulasan", icon: "star", badge: "reviews" },
    ],
  },
  {
    section: "Produk & Stok",
    icon: "box",
    items: [
      { label: "Produk", href: "/panel-admin/produk", icon: "box" },
      { label: "Stok Opname", href: "/panel-admin/stok-opname", icon: "clipboard" },
      { label: "Anomali Stok", href: "/panel-admin/anomali-stok", icon: "alert" },
    ],
  },
];

/** Menu yang cocok dengan alamat sekarang (Dashboard hanya cocok persis). */
function activeNavItem(pathname: string): NavItem | undefined {
  return [...NAV_TOP, ...NAV.flatMap((group) => group.items), ...NAV_BOTTOM].find((item) =>
    item.href === "/panel-admin" ? pathname === item.href : pathname.startsWith(item.href)
  );
}

/** Nama grup yang berisi halaman aktif (kosong kalau yang aktif Dashboard). */
function activeNavGroup(pathname: string): string | undefined {
  const href = activeNavItem(pathname)?.href;
  return NAV.find((group) => group.items.some((item) => item.href === href))?.section;
}

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
  /** Nama + label jabatan akun yang login (header kanan atas). Sebelum terbaca / kalau gagal, tampilan lama ("Lea") dipakai. */
  const [me, setMe] = useState<{ name: string; title: string; userId: string; status: WorkStatus | null; statusAt: string | null } | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [pulangAsk, setPulangAsk] = useState(false);
  useAdminPresenceTracker(me?.userId);
  const onlineIds = useOnlineAdmins();
  /** Ulasan menunggu persetujuan -> badge menu "Ulasan Pelanggan". */
  const pendingReviews = usePendingReviewCount(authorized);
  /** Antrean reseller yang perlu dicek -> badge menu "Reseller". */
  const resellerQueue = useResellerQueueCount(authorized);
  /** Draft transaksi menunggu review -> badge menu "Perlu Review". */
  const pendingDrafts = usePendingDraftCount(authorized);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<PanelTheme>("berry");
  const [themeOpen, setThemeOpen] = useState(false);
  /**
   * Sidebar terlipat (mode ikon, desktop saja). Nilai asli dibaca dari atribut
   * `data-panel-sidebar` yang dipasang script di layout SEBELUM render pertama, jadi
   * tampilan tidak berkedip saat halaman dibuka dengan keadaan terlipat.
   */
  const [collapsed, setCollapsed] = useState(false);
  /** Drawer menu khusus mobile (<=900px). Desktop tidak memakai state ini. */
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  /** Grup menu yang sedang terbuka. Grup berisi halaman aktif otomatis ditambahkan. */
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const activeGroup = activeNavGroup(pathname);
  useEffect(() => {
    if (!activeGroup) return;
    setOpenGroups((prev) => (prev.includes(activeGroup) ? prev : [...prev, activeGroup]));
  }, [activeGroup]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileNavOpen]);

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

  // Sinkronkan state dengan atribut yang sudah dipasang script layout (anti-kedip).
  useEffect(() => {
    const isCollapsed = document.documentElement.getAttribute("data-panel-sidebar") === "collapsed";
    setCollapsed(isCollapsed);
  }, []);

  const toggleSidebar = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        document.documentElement.setAttribute("data-panel-sidebar", next ? "collapsed" : "open");
      } catch {
        /* abaikan */
      }
      try {
        window.localStorage.setItem(SIDEBAR_KEY, next ? "collapsed" : "open");
      } catch {
        /* localStorage bisa diblokir — status tetap jalan untuk sesi ini */
      }
      return next;
    });
  }, []);

  // Shortcut: "[" atau Ctrl/Cmd+B. Tidak aktif saat fokus di input/textarea/select/contenteditable
  // supaya tidak bentrok dengan pengisian angka di Stok Opname atau navigasi Enter/Tab.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const typing =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        Boolean(target?.isContentEditable);
      if (typing) return;

      const primary = event.ctrlKey || event.metaKey;
      if (primary && !event.altKey && event.key.toLowerCase() === "b") {
        event.preventDefault();
        toggleSidebar();
        return;
      }
      if (!primary && !event.altKey && event.key === "[") {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);

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
    if (!authorized) {
      setMe(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const res = await fetch("/api/ops/me", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json?.name) {
          setMe({
            name: String(json.name),
            title: String(json.title || ""),
            userId: String(json.userId || ""),
            // null = kolom status belum ada di database (migrasi belum dijalankan): pemilih disembunyikan.
            status: json.status == null ? null : asWorkStatus(json.status),
            statusAt: json.statusAt ? String(json.statusAt) : null,
          });
        }
      } catch {
        /* header tetap memakai tampilan lama */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authorized]);

  // "Online" = panel masih TERBUKA: kirim sinyal ringan tiap 2 menit selama tab ada, juga saat tab di latar belakang
  // (pindah tab tidak membuat admin dianggap offline). Tab/browser ditutup, laptop tidur, atau internet putus = sinyal berhenti.
  const seenUserId = me?.userId;
  useEffect(() => {
    if (!seenUserId) return;
    let stopped = false;
    const ping = async () => {
      if (stopped) return;
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const res = await fetch("/api/ops/heartbeat", { method: "POST", headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!stopped && json?.closedPrevious) {
          // Status kemarin ditutup otomatis (lupa Absen Pulang): hari ini mulai dari "belum absen masuk".
          setMe((prev) => (prev ? { ...prev, status: "pulang", statusAt: String(json.closedPrevious) } : prev));
          window.dispatchEvent(new Event(STATUS_CHANGED_EVENT));
        }
      } catch {
        /* sinyal berikutnya akan mencoba lagi */
      }
    };
    void ping();
    const id = setInterval(() => void ping(), 120_000);
    // Kembali ke tab ini: kirim sinyal segera (timer latar belakang bisa tertunda oleh browser).
    const onVisible = () => {
      if (document.visibilityState === "visible") void ping();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [seenUserId]);

  const checkInNeeded = me?.status ? needsCheckIn(me.status, me.statusAt) : false;

  async function changeStatus(next: WorkStatus, confirmed = false) {
    if (statusBusy) return;
    // Absen Pulang tidak sengaja bisa memotong jam kerja; minta konfirmasi lewat modal sendiri.
    if (next === "pulang" && !confirmed) {
      setStatusOpen(false);
      setPulangAsk(true);
      return;
    }
    setStatusBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/ops/status", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) {
        setMe((prev) => (prev ? { ...prev, status: next, statusAt: new Date().toISOString() } : prev));
        window.dispatchEvent(new Event(STATUS_CHANGED_EVENT));
      }
    } catch {
      /* status lama tetap tampil */
    } finally {
      setStatusBusy(false);
      setStatusOpen(false);
    }
  }

  // Komponen lain (kartu "Absensi Saya") meminta ganti status lewat event; satu jalur yang sama dengan tombol header.
  const changeStatusRef = useRef(changeStatus);
  changeStatusRef.current = changeStatus;
  useEffect(() => {
    const onRequest = (event: Event) => {
      const next = (event as CustomEvent<{ status?: string }>).detail?.status;
      if (next === "aktif" || next === "istirahat" || next === "pulang") void changeStatusRef.current(next);
    };
    window.addEventListener(STATUS_REQUEST_EVENT, onRequest);
    return () => window.removeEventListener(STATUS_REQUEST_EVENT, onRequest);
  }, []);

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
        const res = await fetch("/api/ops/leads?limit=1&options=0", { headers: { Authorization: `Bearer ${token}` } });
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
    const res = await fetch("/api/ops/leads?limit=1&options=0", {
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

  const activeItem = activeNavItem(pathname);

  const badgeCount = (item: NavItem) =>
    item.badge === "reviews" ? pendingReviews : item.badge === "drafts" ? pendingDrafts : item.badge === "reseller" ? resellerQueue : 0;

  /** Satu tautan menu. Submenu di dalam grup tampil tanpa ikon (withIcon = false). */
  const renderNavLink = (item: NavItem, withIcon: boolean) => {
    if (item.soon) {
      return (
        <div key={item.label} className={`${styles.navItem} ${styles.navItemSoon}`}>
          {withIcon ? <NavIcon name={item.icon} /> : null}
          <span className={styles.navLabel}>{item.label}</span>
          <span className={styles.soon}>SOON</span>
        </div>
      );
    }
    const count = badgeCount(item);
    return (
      <Link
        key={item.label}
        href={item.href}
        title={item.label}
        onClick={() => setMobileNavOpen(false)}
        className={activeItem?.href === item.href ? styles.on : undefined}
      >
        {withIcon ? <NavIcon name={item.icon} /> : null}
        <span className={styles.navLabel}>{item.label}</span>
        {count > 0 && <span className={styles.navBadge}>{count}</span>}
      </Link>
    );
  };

  const toggleGroup = (section: string) => {
    // Sidebar terlipat (mode ikon): submenu tidak punya tempat, jadi klik grup membuka sidebar
    // dan grup itu sekaligus.
    if (collapsed) {
      toggleSidebar();
      setOpenGroups((prev) => (prev.includes(section) ? prev : [...prev, section]));
      return;
    }
    setOpenGroups((prev) => (prev.includes(section) ? prev.filter((name) => name !== section) : [...prev, section]));
  };

  return (
    <QueryClientProvider client={queryClient}>
      <div className={appClass}>
      <aside className={`${styles.side}${mobileNavOpen ? ` ${styles.sideOpen}` : ""}`}>
        <div className={styles.brand}>
          <div className={styles.logo}>S</div>
          <div className={styles.brandText}>
            <b>SAMAQU</b>
            <small>Admin Operasional</small>
          </div>
        </div>

        <nav className={styles.nav}>
          {NAV_TOP.map((item) => renderNavLink(item, true))}
          {NAV.map((group) => {
            const open = openGroups.includes(group.section);
            const hasActive = group.section === activeGroup;
            const childBadges = group.items.reduce((sum, item) => sum + badgeCount(item), 0);
            const panelId = `nav-group-${group.section.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
            return (
              <div key={group.section}>
                <button
                  type="button"
                  className={`${styles.navItem} ${styles.navGroupBtn}${hasActive && (!open || collapsed) ? ` ${styles.navGroupActive}` : ""}`}
                  aria-expanded={open && !collapsed}
                  aria-controls={panelId}
                  title={group.section}
                  onClick={() => toggleGroup(group.section)}
                >
                  <NavIcon name={group.icon} />
                  <span className={styles.navLabel}>{group.section}</span>
                  {!open && childBadges > 0 && <span className={styles.navBadge}>{childBadges}</span>}
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className={`${styles.navChevron}${open ? ` ${styles.navChevronOpen}` : ""}`}
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>
                {open ? (
                  <div id={panelId} className={styles.navSub}>
                    {group.items.map((item) => renderNavLink(item, false))}
                  </div>
                ) : null}
              </div>
            );
          })}
          {NAV_BOTTOM.map((item) => renderNavLink(item, true))}
        </nav>

        <div className={styles.foot}>
          <div className={styles.footText}>
            Engineered by <b>Surya</b>
          </div>
        </div>
      </aside>

      {mobileNavOpen ? (
        <button
          type="button"
          className={styles.navScrim}
          onClick={() => setMobileNavOpen(false)}
          aria-label="Tutup menu"
        />
      ) : null}

      <main className={`${styles.main}${pathname.startsWith("/panel-admin/assistant") ? ` ${styles.mainFill}` : ""}`}>
        <div className={styles.top}>
          <button
            type="button"
            className={styles.mobileMenuBtn}
            onClick={() => setMobileNavOpen((open) => !open)}
            aria-label={mobileNavOpen ? "Tutup menu" : "Buka menu"}
            aria-expanded={mobileNavOpen}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {mobileNavOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
          <button
            type="button"
            className={styles.collapseBtn}
            onClick={toggleSidebar}
            title={collapsed ? "Buka menu" : "Tutup menu"}
            aria-label={collapsed ? "Buka menu" : "Tutup menu"}
            aria-pressed={collapsed}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`${styles.collapseIcon}${collapsed ? ` ${styles.collapseIconOn}` : ""}`}
              aria-hidden="true"
            >
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
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
            <img className={styles.av} src={AVATAR} alt={me?.name || "Lea"} width={40} height={40} />
            <div>
              <b>{me?.name || "Lea"}</b>
              <small>{me?.title || "SAMAQU"}</small>
            </div>
            {me?.status && checkInNeeded ? (
              <button
                type="button"
                onClick={() => void changeStatus("aktif")}
                disabled={statusBusy}
                title="Catat jam masuk Anda hari ini"
                style={{ marginLeft: 8, border: 0, background: "#16a34a", color: "#fff", borderRadius: 999, padding: "7px 14px", fontSize: 12.5, fontWeight: 800, cursor: statusBusy ? "wait" : "pointer" }}
              >
                {statusBusy ? "Mencatat…" : "Absen Masuk"}
              </button>
            ) : me?.status ? (
              <div style={{ position: "relative", marginLeft: 8 }}>
                {(() => {
                  const shown = STATUS_STYLE[shownStatus(me.status, onlineIds.has(me.userId))];
                  return (
                    <button
                      type="button"
                      onClick={() => setStatusOpen((v) => !v)}
                      title="Ubah status kerja"
                      aria-haspopup="listbox"
                      aria-expanded={statusOpen}
                      style={{ border: 0, background: shown.bg, color: shown.fg, borderRadius: 999, padding: "5px 11px", fontSize: 12, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                      <i style={{ width: 8, height: 8, borderRadius: "50%", background: shown.dot, display: "inline-block" }} />
                      {shown.label}
                    </button>
                  );
                })()}
                {statusOpen ? (
                  <>
                    <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setStatusOpen(false)} />
                    <div role="listbox" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 41, minWidth: 220, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 6, boxShadow: "0 12px 32px rgba(15,23,42,0.14)" }}>
                      {optionsFor(me.status).map((o) => {
                        const st = STATUS_STYLE[o.value];
                        return (
                          <button
                            key={o.value}
                            type="button"
                            role="option"
                            aria-selected={false}
                            disabled={statusBusy}
                            onClick={() => void changeStatus(o.value)}
                            style={{ width: "100%", textAlign: "left", border: 0, background: "transparent", borderRadius: 10, padding: "8px 10px", cursor: "pointer", display: "flex", gap: 10, alignItems: "center" }}
                          >
                            <i style={{ width: 10, height: 10, borderRadius: "50%", background: st.dot, display: "inline-block", flex: "none" }} />
                            <span style={{ display: "grid" }}>
                              <b style={{ fontSize: 13, color: "#1f2937" }}>{o.label}</b>
                              <small style={{ fontSize: 11.5, color: "#6b7280" }}>{o.hint}</small>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {checkInNeeded ? (
          <div
            role="status"
            style={{ margin: "0 0 14px", background: "#fef3c7", border: "1px solid #fde68a", color: "#92400e", borderRadius: 14, padding: "10px 14px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: 13.5, fontWeight: 600 }}
          >
            <span>Anda belum absen masuk hari ini. Jam kerja baru tercatat setelah Absen Masuk.</span>
            <button
              type="button"
              onClick={() => void changeStatus("aktif")}
              disabled={statusBusy}
              style={{ marginLeft: "auto", border: 0, background: "#16a34a", color: "#fff", borderRadius: 999, padding: "6px 14px", fontSize: 12.5, fontWeight: 800, cursor: statusBusy ? "wait" : "pointer" }}
            >
              Absen Masuk
            </button>
          </div>
        ) : null}

        <ConfirmDialog
          open={pulangAsk}
          title="Absen pulang sekarang?"
          message="Jam kerja hari ini akan berhenti dihitung. Kalau Anda masih bekerja, Anda bisa Absen Masuk lagi kapan saja."
          confirmLabel="Ya, Absen Pulang"
          busy={statusBusy}
          onCancel={() => setPulangAsk(false)}
          onConfirm={() => {
            setPulangAsk(false);
            void changeStatus("pulang", true);
          }}
        />

        <OpsPageMapProvider pages={PANEL_PAGES}>{children}</OpsPageMapProvider>
      </main>
      <Toaster />
      </div>
    </QueryClientProvider>
  );
}
