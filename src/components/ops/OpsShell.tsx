"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BarChart3,
  FileText,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Package,
  Receipt,
  RotateCcw,
  ShoppingBag,
  Target,
  Users,
  X,
} from "lucide-react";
// Catatan: beberapa ikon (mis. Wallet) ada di runtime tapi belum ada di tipe
// lucide-react versi ini — jadi diambil lewat namespace dengan fallback.
import * as LucideIcons from "lucide-react";
const WalletIcon: any = (LucideIcons as any).WalletMinimal ?? (LucideIcons as any).Wallet;
const IconPhoneCall: any = (LucideIcons as any).PhoneCall ?? (LucideIcons as any).Phone;
const IconBoxes: any = (LucideIcons as any).Boxes ?? Package;
const IconBookOpen: any = (LucideIcons as any).BookOpen ?? FileText;
const IconPackagePlus: any = (LucideIcons as any).PackagePlus ?? Package;
const IconClipboardCheck: any = (LucideIcons as any).ClipboardCheck ?? FileText;
const IconRecipe: any = (LucideIcons as any).NotebookPen ?? (LucideIcons as any).Notebook ?? FileText;
const IconCalendar: any = (LucideIcons as any).CalendarDays ?? (LucideIcons as any).Calendar ?? FileText;
import { supabase } from "@/lib/supabase";
import { Toaster } from "@/components/ops/ui/toaster";
import OpsFooter from "@/components/ops/OpsFooter";

type MenuItem = { title: string; href: string; icon: any; soon?: boolean };
type MenuGroup = { label: string; items: MenuItem[] };

const BASE_MENU_GROUPS: MenuGroup[] = [
  { label: "Utama", items: [{ title: "Dashboard", href: "/ops", icon: LayoutDashboard }] },
  {
    label: "Penjualan",
    items: [
      { title: "Transaksi", href: "/ops/transaksi", icon: FileText },
      { title: "Return", href: "/ops/retur", icon: RotateCcw },
      { title: "Leads", href: "/ops/leads", icon: Users },
      { title: "Follow-up", href: "/ops/follow-up", icon: IconPhoneCall },
      { title: "Laporan Leads", href: "/ops/leads/laporan", icon: BarChart3 },
      { title: "Pelanggan", href: "/ops/pelanggan", icon: Users },
      { title: "Database Kota", href: "/ops/database-kota", icon: MapPin },
    ],
  },
  {
    label: "Produk & Stok",
    items: [
      { title: "Produk", href: "/ops/master-produk", icon: Package },
      { title: "Pembelian", href: "/ops/rekap-pembelian", icon: ShoppingBag, soon: true },
    ],
  },
  {
    label: "Keuangan",
    items: [
      { title: "Pengeluaran", href: "/ops/pengeluaran", icon: WalletIcon, soon: true },
      { title: "Target Profit", href: "/ops/target-penjualan", icon: Target, soon: true },
      { title: "Laporan", href: "/ops/laporan", icon: BarChart3 },
      { title: "Ongkir J&T", href: "/ops/ongkir-jnt", icon: Receipt },
    ],
  },
];

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      // Data dianggap masih segar 60 detik → pindah-pindah menu terasa instan
      // (pakai cache, tidak fetch ulang), sedangkan simpan/edit tetap invalidate.
      staleTime: 60 * 1000,
      gcTime: 10 * 60 * 1000,
      // PENTING: halaman-halaman /ops memakai `initialData: []`. Tanpa baris ini,
      // array kosong itu dianggap data segar 60 detik sehingga query tidak jalan
      // dan tabel tampil kosong. Dengan updatedAt = 0, data awal dianggap basi →
      // query tetap jalan, sementara cache asli tetap dipakai saat pindah menu.
      initialDataUpdatedAt: 0,
    },
  },
});

function SidebarContent({
  pathname,
  onNavigate,
  stripOps,
  groups,
}: {
  pathname: string;
  onNavigate?: () => void;
  stripOps?: boolean;
  groups: MenuGroup[];
}) {
  const router = useRouter();
  // Prefetch halaman begitu kursor menyentuh menu → klik jadi instan.
  const prefetch = (href: string) => { try { router.prefetch(href); } catch { /* diabaikan */ } };
  return (
    <div className="flex-1 px-3 py-3 space-y-3 no-scrollbar overflow-y-auto">
      {groups.map((group, idx) => (
        <div key={idx}>
          <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 px-3">
            {group.label}
          </h4>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              // Di subdomain (ops.samaqu.id) URL-nya bersih: /leads, bukan /ops/leads
              const href = stripOps ? item.href.replace(/^\/ops/, "") || "/" : item.href;
              const active = pathname === item.href || pathname === href;
              const cls = `w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${
                active
                  ? "bg-[#18181b] text-white shadow-sm dark:bg-white dark:text-[#18181b]"
                  : item.soon
                  ? "text-slate-400 dark:text-slate-600 cursor-not-allowed"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`;
              return item.soon ? (
                <div key={item.href} className={cls} title="Belum dibuat">
                  <Icon size={17} />
                  <span className="flex-1 text-left">{item.title}</span>
                  <span className="text-[9px] font-black tracking-wider opacity-70">SOON</span>
                </div>
              ) : (
                <Link
                  key={item.href}
                  href={href}
                  onClick={onNavigate}
                  onMouseEnter={() => prefetch(href)}
                  onFocus={() => prefetch(href)}
                  prefetch
                  className={cls}
                >
                  <Icon size={17} />
                  <span className="flex-1 text-left">{item.title}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function OpsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [onOpsHost, setOnOpsHost] = useState(false);
  /** Akses menu Produksi (Owner/Leader) — ditentukan server, bukan disimpan di browser. */
  const [prodAccess, setProdAccess] = useState<{ allowed: boolean; role: "owner" | "leader" | "other" }>({
    allowed: false,
    role: "other",
  });

  useEffect(() => {
    setOnOpsHost(window.location.hostname === "office.samaqu.id");
  }, []);

  useEffect(() => {
    if (!authorized) {
      setProdAccess({ allowed: false, role: "other" });
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      try {
        const res = await fetch("/api/ops/production/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && json?.allowed) {
          setProdAccess({ allowed: true, role: json.role === "owner" ? "owner" : "leader" });
        } else {
          setProdAccess({ allowed: false, role: "other" });
        }
      } catch {
        if (!cancelled) setProdAccess({ allowed: false, role: "other" });
      }
    })();
    return () => { cancelled = true; };
  }, [authorized]);

  const menuGroups = useMemo<MenuGroup[]>(() => {
    if (!prodAccess.allowed) return BASE_MENU_GROUPS;

    const productionItems: MenuItem[] = [
      { title: "Komponen & Bahan", href: "/ops/produksi/komponen", icon: IconBoxes },
      { title: "Resep Produk", href: "/ops/produksi/resep", icon: IconRecipe },
      { title: "Jadwal Produksi", href: "/ops/produksi/jadwal", icon: IconCalendar },
      { title: "Pembelian Bahan", href: "/ops/produksi/pembelian", icon: ShoppingBag },
      { title: "Buku Stok", href: "/ops/produksi/buku-stok", icon: IconBookOpen },
      { title: "Stok Awal", href: "/ops/produksi/stok-awal", icon: IconPackagePlus },
      { title: "Stok Opname", href: "/ops/produksi/opname", icon: IconClipboardCheck },
    ];

    // Leader hanya melihat stok & status; semua menu berisi harga disembunyikan.
    const visible = prodAccess.role === "owner"
      ? productionItems
      : productionItems.filter((item) => ["/ops/produksi/komponen", "/ops/produksi/buku-stok"].includes(item.href));

    const groups = [...BASE_MENU_GROUPS];
    groups.splice(3, 0, { label: "Produksi", items: visible });
    return groups;
  }, [prodAccess]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        if (!cancelled) { setAuthorized(false); setReady(true); }
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
    return () => { cancelled = true; };
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err || !data.session) {
      setError(err?.message || "Login gagal");
      setBusy(false);
      return;
    }
    const res = await fetch("/api/ops/leads?limit=1", { headers: { Authorization: `Bearer ${data.session.access_token}` } });
    if (!res.ok) {
      setError("Akun ini bukan admin SAMAQU");
      await supabase.auth.signOut();
      setBusy(false);
      return;
    }
    setAuthorized(true);
    setBusy(false);
    router.refresh();
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setAuthorized(false);
  }

  if (!ready) {
    return (
      <div className="ops-root flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="ops-root flex items-center justify-center min-h-screen p-4">
        <form onSubmit={handleLogin} className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-[#18181b] rounded-xl flex items-center justify-center">
              <LayoutDashboard size={20} className="text-white" />
            </div>
            <div>
              <h1 className="font-extrabold text-slate-900">SAMAQU Internal</h1>
              <p className="text-xs text-slate-500">Masuk pakai akun admin</p>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm font-semibold text-slate-900"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm font-semibold text-slate-900"
            />
          </div>
          {error && <p className="text-sm text-red-600 font-semibold">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all"
          >
            {busy ? "Memproses..." : "Masuk"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="ops-root flex min-h-screen">
        {/* Sidebar desktop */}
        <aside className="hidden lg:flex flex-col w-[248px] shrink-0 bg-white dark:bg-[#141821] border-r border-slate-200 dark:border-slate-800 sticky top-0 h-screen">
          <div className="flex flex-col items-center justify-center gap-1 px-5 h-[68px] border-b border-slate-200 dark:border-slate-800 shrink-0">
            <img src="/logo.svg" alt="SAMAQU" className="h-8 w-auto object-contain" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 text-center">Internal</p>
          </div>
          <SidebarContent pathname={pathname} stripOps={onOpsHost} groups={menuGroups} />
          <div className="p-3 border-t border-slate-200 dark:border-slate-800 shrink-0">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            >
              <LogOut size={17} /> Keluar
            </button>
          </div>
        </aside>

        {/* Drawer mobile */}
        {drawer && (
          <div className="lg:hidden fixed inset-0 z-[200]">
            <div className="absolute inset-0 bg-black/50" onClick={() => setDrawer(false)} />
            <div className="absolute left-0 top-0 bottom-0 w-[270px] bg-white dark:bg-[#141821] flex flex-col">
              <div className="flex items-center justify-between px-5 h-[68px] border-b border-slate-200 dark:border-slate-800">
                <div className="flex flex-col items-center justify-center gap-1">
                  <img src="/logo.svg" alt="SAMAQU" className="h-8 w-auto object-contain" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Internal</span>
                </div>
                <button onClick={() => setDrawer(false)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                  <X size={18} className="text-slate-500" />
                </button>
              </div>
              <SidebarContent pathname={pathname} stripOps={onOpsHost} groups={menuGroups} onNavigate={() => setDrawer(false)} />
              <div className="p-3 border-t border-slate-200 dark:border-slate-800">
                <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100">
                  <LogOut size={17} /> Keluar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Konten */}
        <div className="flex-1 min-w-0">
          <header className="lg:hidden sticky top-0 z-40 flex items-center gap-3 px-4 h-[60px] bg-white dark:bg-[#141821] border-b border-slate-200 dark:border-slate-800">
            <button onClick={() => setDrawer(true)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Menu">
              <Menu size={20} className="text-slate-600 dark:text-slate-300" />
            </button>
            <span className="font-extrabold text-slate-900 dark:text-white">SAMAQU Internal</span>
          </header>
          <main className="p-4 md:p-6 lg:p-8">{children}</main>
          <OpsFooter />
        </div>

        <Toaster />
      </div>
    </QueryClientProvider>
  );
}
