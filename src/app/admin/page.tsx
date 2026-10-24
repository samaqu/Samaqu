"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { getThumbnailFromImages } from "@/lib/product-thumbnail";
import {
  LayoutDashboard, ShoppingBag, Package, Users, FileText, Settings,
  Search, Bell, Menu, X, ChevronDown, Plus, TrendingUp, Eye, Edit,
  DollarSign, ShoppingCart, UserPlus, Box, LogOut, Lock, Mail, Trash2, Ticket, Star, Ruler, Image, Shirt, MessageCircle, Camera,
  Users2, CreditCard, Percent,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import ConfirmModal from "@/components/ConfirmModal";
import { useToast } from "@/components/AdminToast";
import OrderDetailDrawer from "@/components/admin/OrderDetailDrawer";
import CustomersView from "@/components/admin/CustomersView";
import SettingsPanel from "@/components/admin/SettingsSections";
import NotifikasiKatalog from "@/components/admin/NotifikasiKatalog";
import OrdersView from "@/components/admin/OrdersView";
import DashboardView from "@/components/admin/DashboardView";
import { rankTopProducts } from "@/lib/top-products";
import { SALE_STATUSES, orderRevenue } from "@/lib/transaksi";
import { currentMonthWIB, monthLabelID, monthRangeWIB, monthShift } from "@/lib/month-period";
import ProductsCatalog from "@/components/admin/ProductsCatalog";
import ProductDetailDrawer from "@/components/admin/ProductDetailDrawer";
import LiveChatView from "@/components/admin/LiveChatView";
import { ADMIN_WF_VARS } from "@/components/admin/admin-theme";

type Panel = "dashboard" | "orders" | "products" | "customers" | "chats" | "content" | "notif-template" | "settings";

// Route /api/admin/* digerbangi isOpsAdmin (sesi admin terdaftar di tabel `admins`),
// jadi setiap request admin wajib membawa Bearer token.
async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` };
}

interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  customer_email: string;
  customer_whatsapp: string;
  shipping_address: string;
  shipping_city: string;
  shipping_postal_code: string;
  shipping_notes: string;
  shipping_method: string;
  payment_method: string;
  /** Channel gateway (mayar), mis. "qris" / "va/bni" — rincian metode pembayaran online. */
  payment_channel?: string | null;
  subtotal: number;
  shipping_cost: number;
  discount: number;
  total: number;
  status: string;
  awb_no: string | null;
  /** Status pengiriman terpisah dari status pesanan (menunggu_pickup | dikirim | selesai). */
  shipping_status?: string | null;
  tracking_status_text?: string | null;
  /** Kode pemindaian terakhir — dipakai mendeteksi status tertunda (badge "Tertunda"). */
  tracking_status_code?: number | null;
  tracking_city?: string | null;
  tracking_updated_at?: string | null;
  created_at: string;
  /** Jam pembatalan yang akurat (kolom `orders.cancelled_at`), dibaca `waktuBatal`. */
  cancelled_at?: string | null;
  /** `voided` = resi sudah dibatalkan di J&T (kolom `orders.jnt_void_status`). */
  jnt_void_status?: string | null;
  /** Jam perubahan terakhir; cadangan jam pembatalan kalau `cancelled_at` masih kosong. */
  updated_at?: string;
  order_items?: { product_id?: string | null; product_name: string; color: string; size: string; series?: string | null; kain?: string | null; quantity: number; price: number; customer_price: number | null; minimum_price: number | null; product_image?: string | null }[];
}

interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  image: string;
  minimum_price?: number | null;
  create_your_price_enabled?: boolean;
  series?: string | null;
  kain?: string | null;
  colors?: string[];
  jenis_kain?: { name: string } | null;
  /** Tampil di katalog website (kolom `products.is_published`, default true). */
  is_published?: boolean | null;
  /** "free_gift" = produk bonus (tidak dihitung di Produk Terlaris). */
  product_type?: string | null;
}

interface AdminCatalogProduct extends Product {
  availableSeries?: string[];
  memberIds?: string[];
  totalStock?: number;
  matchedSeries?: string;
  seriesStock?: { name: string; stock: number; isDerived: boolean; follows?: string }[];
  /** true kalau SEMUA baris (series) produk ini tampil di website. */
  isPublished?: boolean;
}

// Sidebar dikelompokkan: alur jualan (pesanan/produk/pelanggan) dipisah dari konten
// website dan pengaturan. Satu item bisa berupa panel dashboard (`panel`) atau
// halaman admin tersendiri (`href`). "Open Order" diletakkan tepat di bawah
// "Order Management" karena masih satu alur pesanan.
type NavItem =
  | { label: string; icon: LucideIcon; panel: Panel; badge?: boolean }
  | { label: string; icon: LucideIcon; href: string };

const navGroups: { title: string; items: NavItem[] }[] = [
  {
    title: "Menu Utama",
    items: [
      { label: "Dashboard", icon: LayoutDashboard, panel: "dashboard" },
      { label: "Order Management", icon: ShoppingBag, panel: "orders", badge: true },
      { label: "Open Order", icon: Shirt, href: "/admin/open-order" },
      { label: "Produk", icon: Package, panel: "products" },
      { label: "Pelanggan", icon: Users, panel: "customers" },
      { label: "Live Chat", icon: MessageCircle, panel: "chats" },
    ],
  },
  {
    title: "Konten",
    items: [
      { label: "Konten Website", icon: FileText, panel: "content" },
      { label: "Biolink", icon: FileText, href: "/admin/biolink" },
      { label: "Foto Carousel", icon: Image, href: "/admin/bio-carousel" },
      { label: "Kelola Foto Instagram", icon: Camera, href: "/admin/instagram" },
      { label: "Testimoni", icon: Star, href: "/admin/testimoni" },
      { label: "Panduan Ukuran", icon: Ruler, href: "/admin/ukuran-produk" },
      { label: "Halaman Garansi & Retur", icon: FileText, href: "/admin/garansi-retur-page" },
    ],
  },
  {
    title: "Affiliate",
    items: [
      { label: "Data Affiliate", icon: Users2, href: "/admin/affiliate/data" },
      { label: "Transaksi & Komisi", icon: TrendingUp, href: "/admin/affiliate/transaksi" },
      { label: "Pencairan Komisi", icon: CreditCard, href: "/admin/affiliate/pencairan" },
      { label: "Pengaturan Komisi", icon: Percent, href: "/admin/affiliate/pengaturan" },
    ],
  },
  {
    title: "Lainnya",
    items: [
      { label: "Voucher", icon: Ticket, href: "/admin/voucher" },
      { label: "Template Notif", icon: Bell, panel: "notif-template" },
      { label: "Pengaturan", icon: Settings, panel: "settings" },
    ],
  },
];

const panelTitles: Record<Panel, { title: string; sub: string }> = {
  dashboard: { title: "Dashboard", sub: "Selamat datang kembali, kelola toko SAMAQU Anda." },
  orders: { title: "Pesanan", sub: "Pantau dan proses seluruh pesanan pelanggan." },
  products: { title: "Produk", sub: "Kelola katalog dan stok koleksi." },
  customers: { title: "Pelanggan", sub: "Data dan riwayat belanja pelanggan." },
  chats: { title: "Live Chat", sub: "Percakapan asisten AI di website — cari pertanyaan yang belum terjawab." },
  content: { title: "Konten Website", sub: "Atur tampilan halaman publik SAMAQU." },
  "notif-template": { title: "Template Notif", sub: "Atur isi pesan WhatsApp otomatis untuk pelanggan dan admin." },
  settings: { title: "Pengaturan", sub: "Konfigurasi informasi toko." },
};

function effectivePrice(p: Product): number {
  return p.create_your_price_enabled && p.minimum_price ? p.minimum_price : p.price;
}

function groupByMainProduct(raw: Product[]): AdminCatalogProduct[] {
  const groups = new Map<string, Product[]>();
  for (const p of raw) {
    const key = `${p.category}::${p.name}`;
    const list = groups.get(key) || [];
    list.push(p);
    groups.set(key, list);
  }

  const items: AdminCatalogProduct[] = [];
  for (const group of groups.values()) {
    const rep: AdminCatalogProduct = { ...group[0], memberIds: group.map((m) => m.id), isPublished: group.every((m) => m.is_published !== false) };

    if (group.length > 1) {
      let cheapest = group[0];
      let cheapestValue = effectivePrice(group[0]);
      for (const member of group) {
        const value = effectivePrice(member);
        if (value < cheapestValue) {
          cheapestValue = value;
          cheapest = member;
        }
      }
      rep.price = cheapestValue;
      rep.minimum_price = cheapest.minimum_price;
      rep.create_your_price_enabled = cheapest.create_your_price_enabled;
      rep.availableSeries = [...new Set(group.map((m) => m.series).filter((s): s is string => !!s))].sort();
    }

    items.push(rep);
  }

  return items;
}

/* ── Periode bulan (WIB) dashboard — semuanya dari `src/lib/month-period.ts` supaya
   rentang query, label periode, dan label grafik memakai definisi bulan yang sama. ── */
const JENDELA_GRAFIK_BULAN = 6;

/**
 * Pembungkus panel dashboard yang tetap terpasang setelah pernah dibuka — pindah menu cuma
 * mengganti panel mana yang tampak, jadi panelnya tidak di-render ulang (tidak ada loading).
 * Animasi masuk yang lama tetap dipakai saat panelnya pertama kali muncul.
 */
function KeptPanel({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: active ? 1 : 0, y: active ? 0 : 8 }}
      transition={{ duration: 0.25 }}
      style={{ display: active ? undefined : "none" }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Role yang boleh membuka dashboard admin website.
 * `owner` ditambahkan karena akun pemilik memakai role itu untuk menu Produksi;
 * sebelumnya pengecekan hanya menerima `admin` sehingga pemilik ikut ditolak.
 */
function hasAdminPanelAccess(role: string | null): boolean {
  return role === "admin" || role === "owner";
}

function AdminPageInner() {
  // ALL hooks must be declared BEFORE any early returns
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [activePanel, setActivePanel] = useState<Panel>("dashboard");
  // Panel yang pernah dibuka tetap TERPASANG (cuma disembunyikan) supaya pindah menu tidak
  // me-render ulang panelnya: datanya tidak diambil lagi dan tidak ada layar loading.
  const [keepPanels, setKeepPanels] = useState<Panel[]>(["dashboard"]);
  /** Muat panelnya lebih awal — dipanggil saat menu diklik DAN saat kursor menyentuh menunya,
   *  supaya begitu menu dibuka isinya sudah siap (tidak ada layar loading). */
  const preloadPanel = useCallback((panel: Panel) => {
    setKeepPanels((prev) => (prev.includes(panel) ? prev : [...prev, panel]));
  }, []);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productThumbnails, setProductThumbnails] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [deleteConfirmOrder, setDeleteConfirmOrder] = useState<Order | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [productVariants, setProductVariants] = useState<{ product_id: string; stock: number; base_product_id: string | null }[]>([]);
  const [hoveredSeriesCard, setHoveredSeriesCard] = useState<string | null>(null);

  // Filter bulan dashboard (YYYY-MM, WIB) — sama pola dengan dashboard ops.
  // `dashOrders` diambil terpisah dari server per bulan, jadi kartu dashboard tidak
  // bergantung pada 50 pesanan terakhir yang dipakai panel Order Management.
  const [bulanValue, setBulanValue] = useState<string>(() => currentMonthWIB());
  const [dashOrders, setDashOrders] = useState<Order[]>([]);
  // Jendela 6 bulan (bulan terpilih + 5 bulan sebelumnya) — sumber garis grafik
  // "Pendapatan Bulanan" dan pembanding "vs bulan lalu" di kartu dashboard.
  const [trendOrders, setTrendOrders] = useState<Order[]>([]);
  const [dashLoading, setDashLoading] = useState(true);

  // All useMemo/useCallback hooks
  const periodLabel = useMemo(() => monthLabelID(bulanValue), [bulanValue]);

  /** Pendapatan periode terpilih — SATU aturan bersama `SALE_STATUSES` (src/lib/transaksi.ts):
   *  hanya pesanan yang sudah dibayar (`diproses`/`dikirim`/`selesai`). Dulu filternya
   *  "bukan pending", jadi pesanan `dibatalkan` ikut dihitung sebagai pendapatan. */
  const dashRevenue = useMemo(
    () => dashOrders.filter((o) => SALE_STATUSES.includes(String(o.status || "").toLowerCase())).reduce((sum, o) => sum + orderRevenue(o), 0),
    [dashOrders]
  );

  // Kartu "Produk Terlaris" memakai FUNGSI PUSAT yang sama dengan dashboard ops
  // (`rankTopProducts`, src/lib/top-products.ts) — aturan hitungnya identik, dan sekarang
  // periodenya juga sama: bulan yang sedang dipilih di bar periode dashboard.
  const topProducts = useMemo(
    () =>
      rankTopProducts({
        orders: dashOrders.map((o) => ({ id: o.id, status: o.status, created_at: o.created_at })),
        items: dashOrders.flatMap((o) => (o.order_items || []).map((it) => ({ ...it, order_id: o.id }))),
        products: products.map((p) => ({ id: p.id, product_type: p.product_type })),
        limit: 4,
      }),
    [dashOrders, products]
  );

  const catalogItems = useMemo(() => groupByMainProduct(products), [products]);

  const catalogItemsWithStock = useMemo(() => {
    // Build lookup maps
    const seriesByName: Record<string, string> = {}; // product_id → series name
    for (const p of products) {
      if (p.series) seriesByName[p.id] = p.series;
    }
    const stockByProduct: Record<string, number> = {};
    const baseLinkByProduct: Record<string, string> = {}; // product_id → base_product_id
    for (const v of productVariants) {
      if (v.base_product_id) {
        baseLinkByProduct[v.product_id] = v.base_product_id;
      } else {
        stockByProduct[v.product_id] = (stockByProduct[v.product_id] || 0) + v.stock;
      }
    }
    return catalogItems.map((p) => {
      let totalStock = 0;
      const seriesStock: { name: string; stock: number; isDerived: boolean; follows?: string }[] = [];
      for (const mid of p.memberIds || []) {
        const sName = seriesByName[mid] || mid;
        const baseId = baseLinkByProduct[mid];
        if (baseId) {
          // Derived product — stock comes from base
          const baseStock = stockByProduct[baseId] || 0;
          const baseSeries = seriesByName[baseId] || baseId;
          seriesStock.push({ name: sName, stock: baseStock, isDerived: true, follows: baseSeries });
          totalStock += baseStock;
        } else {
          // Base product — has its own stock
          const st = stockByProduct[mid] || 0;
          seriesStock.push({ name: sName, stock: st, isDerived: false });
          totalStock += st;
        }
      }
      seriesStock.sort((a, b) => a.name.localeCompare(b.name));
      return { ...p, totalStock, seriesStock };
    });
  }, [catalogItems, productVariants, products]);

  const filteredCatalogItems = useMemo(() => {
    if (!debouncedSearch.trim()) return catalogItemsWithStock;
    const q = debouncedSearch.toLowerCase();
    return catalogItemsWithStock.map((p) => {
      const nameMatch = p.name.toLowerCase().includes(q);
      const catMatch = p.category.toLowerCase().includes(q);
      if (nameMatch || catMatch) return { ...p, matchedSeries: undefined };
      const seriesHit = p.availableSeries?.find((s) => s.toLowerCase().includes(q));
      if (seriesHit) return { ...p, matchedSeries: seriesHit };
      return null;
    }).filter(Boolean) as AdminCatalogProduct[];
  }, [catalogItemsWithStock, debouncedSearch]);

  // All useEffect hooks
  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;
        const u = session?.user ?? null;
        setUser(u);
        if (u) {
          const { data } = await supabase.from("admins").select("role").eq("user_id", u.id).single();
          if (mounted) setRole(data?.role || null);
        }
      } catch (err) {
        console.error("Auth init error:", err);
      } finally {
        if (mounted) setAuthLoading(false);
      }
    }
    init();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!user || !hasAdminPanelAccess(role)) return;
    let mounted = true;
    async function fetchData() {
      try {
        const [ordersRes, productsRes, variantsRes] = await Promise.all([
          fetch("/api/ops/orders?limit=50", { headers: await authHeaders() })
            .then((r) => r.json())
            .then((json) => ({ data: json?.orders || [] }))
            .catch(() => ({ data: [] })),
          supabase.from("products").select("*").order("created_at", { ascending: true }),
          supabase.from("product_variants").select("product_id, stock, base_product_id"),
        ]);
        if (mounted) {
          if (ordersRes.data) setOrders(ordersRes.data as Order[]);
          if (productsRes.data) {
            setProducts(productsRes.data as Product[]);
            // Fetch thumbnails: first non-video image from product_images, fallback to product.image
            const thumbs: Record<string, string> = {};
            const productIds = (productsRes.data as Product[]).map((p) => p.id);
            if (productIds.length > 0) {
              const { data: allImgs } = await supabase
                .from("product_images")
                .select("product_id, url, is_video")
                .in("product_id", productIds)
                .order("display_order");
              if (allImgs) {
                for (const p of productsRes.data as Product[]) {
                  thumbs[p.id] = getThumbnailFromImages(p.id, p.image, allImgs);
                }
              }
            }
            setProductThumbnails(thumbs);
          }
          if (variantsRes.data) setProductVariants(variantsRes.data as { product_id: string; stock: number; base_product_id: string | null }[]);
        }
      } catch (err) {
        console.error("Error fetching data:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    fetchData();
    return () => { mounted = false; };
  }, [user, role]);

  // Pesanan bulan terpilih untuk dashboard — diambil langsung dari server (bukan disaring
  // dari 50 pesanan terakhir), supaya bulan lama tetap punya data walau pesanan baru menumpuk.
  // Sekalian jendela 6 bulan terakhir diambil, karena grafik "Pendapatan Bulanan" + tren
  // "vs bulan lalu" butuh omzet per bulan: dulu grafiknya memakai 50 pesanan terbaru, jadi
  // bulan-bulan lama tampak Rp 0 walaupun penjualannya ada.
  useEffect(() => {
    if (!user || !hasAdminPanelAccess(role)) return;
    let mounted = true;
    async function fetchDashMonth() {
      setDashLoading(true);
      try {
        const { startISO, endISO } = monthRangeWIB(bulanValue);
        const { startISO: trendFromISO } = monthRangeWIB(monthShift(bulanValue, -(JENDELA_GRAFIK_BULAN - 1)));
        const headers = await authHeaders();
        const [monthRes, trendRes] = await Promise.all([
          fetch(`/api/ops/orders?from=${encodeURIComponent(startISO)}&to=${encodeURIComponent(endISO)}&limit=1000`, { headers }),
          fetch(`/api/ops/orders?from=${encodeURIComponent(trendFromISO)}&to=${encodeURIComponent(endISO)}&limit=1000`, { headers }),
        ]);
        const monthJson = await monthRes.json().catch(() => ({}));
        const trendJson = await trendRes.json().catch(() => ({}));
        if (mounted) {
          setDashOrders((monthJson?.orders as Order[]) || []);
          setTrendOrders((trendJson?.orders as Order[]) || []);
        }
      } catch (err) {
        console.error("Error fetching dashboard month:", err);
        if (mounted) {
          setDashOrders([]);
          setTrendOrders([]);
        }
      } finally {
        if (mounted) setDashLoading(false);
      }
    }
    fetchDashMonth();
    return () => { mounted = false; };
  }, [user, role, bulanValue]);

  // Debounce product search (200ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(productSearch), 200);
    return () => clearTimeout(timer);
  }, [productSearch]);

  // Panel awal dari URL (`/admin?panel=orders`): sidebar subhalaman admin
  // (`AdminShell`) mengarahkan item panel ke `/admin?panel=…` supaya klik
  // "Order Management" dari halaman lain langsung mendarat di panelnya — dulu
  // semuanya menuju `/admin` dan nyangkut di Dashboard lebih dulu.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("panel");
    if (requested && (Object.keys(panelTitles) as Panel[]).includes(requested as Panel)) {
      // Panel dari URL ikut "dipasang" — tanpa ini panelnya tidak dirender sama sekali
      // (daftar panel yang terpasang cuma berisi Dashboard di awal).
      preloadPanel(requested as Panel);
      setActivePanel(requested as Panel);
    }
  }, [preloadPanel]);

  // Handler functions (not hooks)
  function shiftDashMonth(delta: number) {
    setBulanValue((prev) => monthShift(prev, delta));
  }
  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    // Sign out any existing session first (customer might be logged in)
    await supabase.auth.signOut();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setAuthError(error.message);
      return;
    }
    const u = data.user;
    const { data: adminData } = await supabase.from("admins").select("role").eq("user_id", u.id).single();
    if (!adminData) {
      await supabase.auth.signOut();
      setAuthError("Akun ini bukan akun admin. Silakan gunakan akun admin yang benar.");
      return;
    }
    setUser(u);
    setRole(adminData.role);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
    setRole(null);
    setOrders([]);
    setDashOrders([]);
    setTrendOrders([]);
    setProducts([]);
    setActivePanel("dashboard");
  }

  const toast = useToast();
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; title: string; message: string; confirmText?: string; danger?: boolean; onConfirm: () => void }>({ open: false, title: "", message: "", onConfirm: () => {} });

  // `options` dipakai kalau aksinya bukan tindakan merusak (mis. "Atur Pesanan"), supaya tombol
  // konfirmasinya tidak berlabel "Hapus".
  function showConfirm(
    title: string,
    message: string,
    onConfirm: () => void,
    options?: { confirmText?: string; danger?: boolean }
  ) {
    setConfirmModal({ open: true, title, message, onConfirm, ...options });
  }

  async function handleDeleteProduct(id: string, name: string, memberIds?: string[]) {
    const ids = memberIds && memberIds.length > 0 ? memberIds : [id];
    const label = ids.length > 1 ? `"${name}" (${ids.length} produk)` : `"${name}"`;
    showConfirm("Hapus Produk?", `Yakin ingin menghapus ${label}? Tindakan ini tidak bisa dibatalkan.`, async () => {
      try {
        await supabase.from("product_images").delete().in("product_id", ids);
        await supabase.from("product_variants").delete().in("product_id", ids);
        await supabase.from("products").delete().in("id", ids);
        setProducts((prev) => prev.filter((p) => !ids.includes(p.id)));
        toast.showToast("success", "Produk berhasil dihapus");
      } catch (err) {
        console.error("Delete error:", err);
        toast.showToast("error", "Gagal menghapus produk, coba lagi");
      }
    });
  }

  /** Setelah status "tampil di website" disimpan dari drawer detail, samakan daftar produk
   *  di dashboard supaya badge "Dari Ops, belum tampil" langsung hilang tanpa refresh. */
  function handleProductPublished(published: boolean, target: { name: string; category: string }) {
    setProducts((prev) =>
      prev.map((p) =>
        p.name === target.name && p.category === target.category ? { ...p, is_published: published } : p
      )
    );
  }

  async function updateOrderStatus(orderNumber: string, newStatus: string) {
    // Pesanan yang sudah punya resi J&T: `dibatalkan` wajib lewat jalur void resi yang sama
    // seperti tombol "Batalkan di J&T" (termasuk konfirmasinya), supaya pengiriman di J&T
    // tidak tertinggal aktif saat pesanannya dianggap batal.
    if (newStatus === "dibatalkan") {
      const target = orders.find((o) => o.order_number === orderNumber);
      if (target?.awb_no) {
        cancelJntOrder(target);
        return;
      }
    }

    try {
      const res = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: await authHeaders(),
        body: JSON.stringify({ orderNumber, status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.showToast("error", data.error || "Gagal memperbarui status");
        return;
      }
      // Jam pembatalan ditimpa lokal supaya linimasa "Pesanan dibatalkan" di drawer langsung
      // memakai jam yang baru (server menulis nilai yang sama — lihat PATCH /api/admin/orders).
      const changedAt = new Date().toISOString();
      const patch = newStatus === "dibatalkan"
        ? { status: newStatus, cancelled_at: changedAt, updated_at: changedAt }
        : { status: newStatus, updated_at: changedAt };
      setOrders((prev) => prev.map((o) => o.order_number === orderNumber ? { ...o, ...patch } : o));
      setDashOrders((prev) => prev.map((o) => o.order_number === orderNumber ? { ...o, ...patch } : o));
      setSelectedOrder((prev) => prev && prev.order_number === orderNumber ? { ...prev, ...patch } : prev);
      toast.showToast("success", "Status pesanan berhasil diperbarui");
    } catch (err) {
      console.error("Update status error:", err);
      toast.showToast("error", "Gagal memperbarui status, coba lagi");
    }
  }

  /**
   * "Atur Pesanan" ala Shopee: resi J&T dibuat manual oleh admin setelah pembayaran
   * diverifikasi. Sukses → nomor resi tersimpan dan status pesanan jadi "diproses".
   */
  async function arrangeOrder(order: { order_number: string }) {
    showConfirm(
      "Atur Pesanan?",
      `Buat nomor resi J&T untuk pesanan ${order.order_number}? Pengiriman dibuat & paket menunggu pickup kurir (status pesanan tetap "diproses", tahapnya jadi "Menunggu Pickup").`,
      async () => {
        try {
          const res = await fetch("/api/admin/orders", {
            method: "PATCH",
            headers: await authHeaders(),
            body: JSON.stringify({ orderNumber: order.order_number, action: "createJnt" }),
          });
          const data = await res.json();
          if (!res.ok) {
            toast.showToast("error", data.error || "Gagal membuat resi J&T");
            return;
          }
          const awbNo = data.awbNo as string;
          // Resi terbit ≠ paket dikirim: status pesanan tetap "diproses", status pengiriman
          // jadi "menunggu_pickup". Baru naik ke "dikirim" setelah J&T melaporkan pemindaian.
          const patch = {
            awb_no: awbNo,
            status: "diproses",
            shipping_status: "menunggu_pickup",
            ...(data.serviceCode ? { shipping_method: `J&T ${data.serviceCode}` } : {}),
          };
          setOrders((prev) => prev.map((o) => o.order_number === order.order_number ? { ...o, ...patch } : o));
          setDashOrders((prev) => prev.map((o) => o.order_number === order.order_number ? { ...o, ...patch } : o));
          setSelectedOrder((prev) => prev && prev.order_number === order.order_number ? { ...prev, ...patch } : prev);
          toast.showToast("success", `Resi J&T terbit: ${awbNo} — pengiriman dibuat, menunggu pickup kurir`);
        } catch (err) {
          console.error("Arrange order error:", err);
          toast.showToast("error", "Gagal membuat resi J&T, coba lagi");
        }
      },
      { confirmText: "Atur Pesanan", danger: false }
    );
  }

  async function deleteOrder(orderNumber: string) {
    showConfirm("Hapus Pesanan?", "Yakin ingin menghapus pesanan ini? Tindakan ini tidak bisa dibatalkan.", async () => {
      try {
        const res = await fetch("/api/admin/orders", {
          method: "DELETE",
          headers: await authHeaders(),
          body: JSON.stringify({ orderNumber }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.showToast("error", data.error || "Gagal menghapus pesanan");
          return;
        }
        setOrders((prev) => prev.filter((o) => o.order_number !== orderNumber));
        setDashOrders((prev) => prev.filter((o) => o.order_number !== orderNumber));
        setSelectedOrder(null);
        setDeleteConfirmOrder(null);
        toast.showToast("success", "Pesanan berhasil dihapus");
      } catch (err) {
        console.error("Delete order error:", err);
        toast.showToast("error", "Gagal menghapus pesanan, coba lagi");
      }
    });
  }

  async function cancelJntOrder(order: Order) {
    showConfirm("Batalkan di J&T?", `Yakin ingin membatalkan pengiriman J&T untuk pesanan ${order.order_number}? AWB ${order.awb_no || "-"} akan di-void di J&T.`, async () => {
      try {
        const res = await fetch("/api/admin/orders", {
          method: "PATCH",
          headers: await authHeaders(),
          body: JSON.stringify({ orderNumber: order.order_number, action: "cancelJnt" }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.showToast("error", data.error || "Gagal membatalkan J&T");
          return;
        }
        // `jnt_void_status` ikut ditimpa supaya tombol Cetak Label langsung hilang di drawer
        // tanpa perlu memuat ulang (server menulis nilai yang sama — lihat cancel-order.ts).
        const cancelledAt = new Date().toISOString();
        const patch = { status: "dibatalkan", cancelled_at: cancelledAt, updated_at: cancelledAt, jnt_void_status: "voided" };
        setOrders((prev) => prev.map((o) => o.order_number === order.order_number ? { ...o, ...patch } : o));
        setDashOrders((prev) => prev.map((o) => o.order_number === order.order_number ? { ...o, ...patch } : o));
        setSelectedOrder((prev) => prev && prev.order_number === order.order_number ? { ...prev, ...patch } : prev);
        toast.showToast(
          "success",
          data.packagingWarning
            ? "Pesanan dibatalkan. Retur kemasan gagal dicatat; cek menu Produksi."
            : "Berhasil membatalkan pesanan di J&T"
        );
      } catch (err) {
        console.error("Cancel J&T error:", err);
        toast.showToast("error", "Gagal membatalkan J&T, coba lagi");
      }
    }, { confirmText: "Ya, Batalkan", danger: true });
  }

  function go(panel: Panel) {
    preloadPanel(panel);
    setActivePanel(panel);
    setSidebarOpen(false);
  }

  // NOW early returns are safe (all hooks already called)
  if (authLoading) {
    return (
      <section className="min-h-screen flex items-center justify-center" style={{ background: "#f8f9fb" }}>
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: "#e4e4e7", borderTopColor: "#18181b" }} />
      </section>
    );
  }

  if (user && !hasAdminPanelAccess(role)) {
    return (
      <section className="min-h-screen flex items-center justify-center" style={{ background: "#f8f9fb" }}>
        <div className="text-center px-6 max-w-sm">
          <div className="w-16 h-16 rounded-full mx-auto mb-5 flex items-center justify-center" style={{ background: "rgba(220,38,38,.1)", border: "2px solid rgba(220,38,38,.3)" }}>
            <Lock size={28} style={{ color: "#dc2626" }} />
          </div>
          <h1 className="text-2xl font-medium mb-2" style={{ color: "#18181b" }}>Akses Ditolak</h1>
          <p className="text-sm mb-6" style={{ color: "#71717a" }}>
            Akun Anda tidak memiliki akses ke dashboard admin. Hubungi pemilik toko untuk mendapatkan akses.
          </p>
          <p className="text-xs mb-6" style={{ color: "#a1a1aa" }}>Login sebagai: {user.email}</p>
          <button onClick={handleLogout} className="px-6 py-2.5 rounded-xl text-sm font-semibold" style={{ border: "1px solid #e4e4e7", color: "#18181b" }}>
            Keluar & Login Ulang
          </button>
        </div>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="min-h-screen flex" style={{ background: "#f8f9fb" }}>
        {/* Desktop: panel gelap kiri (zinc-900) */}
        <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden" style={{ background: "#18181b" }}>
          <div className="absolute inset-0" style={{
            clipPath: "polygon(0 0, 100% 0, 88% 100%, 0 100%)",
            background: "linear-gradient(135deg, rgba(63,63,70,.6) 0%, rgba(24,24,27,.98) 50%, rgba(9,9,11,1) 100%)",
          }} />
          <div className="relative z-10 flex flex-col justify-between p-12 lg:p-16 w-full">
            <div>
              <span className="text-3xl tracking-[0.2em] font-medium" style={{ color: "#fafafa" }}>SAMAQU</span>
              <p className="text-[11px] tracking-[0.28em] uppercase mt-2" style={{ color: "#a1a1aa" }}>Admin Panel</p>
            </div>
            <div className="max-w-md">
              <h1 className="text-4xl lg:text-5xl font-medium leading-tight mb-4" style={{ color: "#fafafa" }}>
                Kelola Toko<br /><em style={{ color: "#d4d4d8" }}>SAMAQU</em> Anda
              </h1>
              <p className="text-sm leading-relaxed" style={{ color: "#a1a1aa" }}>
                Dashboard admin untuk mengelola pesanan, produk, pelanggan, dan konten website SAMAQU.
              </p>
            </div>
            <p className="text-xs" style={{ color: "#71717a" }}>© 2026 SAMAQU. Semua hak cipta dilindungi.</p>
          </div>
        </div>

        {/* Right: form panel */}
        <div className="flex-1 flex items-center justify-center px-6 py-12 lg:px-16">
          <div className="w-full max-w-sm">
            {/* Mobile: brand header */}
            <div className="lg:hidden text-center mb-10">
              <span className="text-3xl tracking-[0.2em] font-medium" style={{ color: "#18181b" }}>SAMAQU</span>
              <p className="text-[11px] tracking-[0.28em] uppercase mt-2" style={{ color: "#a1a1aa" }}>Admin Panel</p>
            </div>

            <div className="hidden lg:block mb-8">
              <h2 className="text-2xl font-medium mb-2" style={{ color: "#18181b" }}>Selamat Datang</h2>
              <p className="text-sm" style={{ color: "#71717a" }}>Masuk ke dashboard admin SAMAQU</p>
            </div>

            <form onSubmit={handleAuth} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "#18181b" }}>Email</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "#a1a1aa" }} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@samaqu.id"
                    className="w-full rounded-xl pl-10 pr-4 py-3.5 text-sm outline-none transition-all focus:ring-2"
                    style={{ border: "1px solid #e4e4e7", background: "white", color: "#18181b", "--tw-ring-color": "#d4d4d8" } as React.CSSProperties}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "#18181b" }}>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password"
                  className="w-full rounded-xl px-4 py-3.5 text-sm outline-none transition-all focus:ring-2"
                  style={{ border: "1px solid #e4e4e7", background: "white", color: "#18181b", "--tw-ring-color": "#d4d4d8" } as React.CSSProperties}
                  required
                  minLength={6}
                />
              </div>
              {authError && (
                <p className="text-[13px]" style={{ color: "#dc2626" }}>{authError}</p>
              )}
              <button type="submit" className="w-full py-3.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]" style={{ background: "#18181b", boxShadow: "0 4px 14px -4px rgba(0,0,0,.4)" }}>
                Masuk
              </button>
            </form>

            <p className="mt-8 text-center text-xs" style={{ color: "#a1a1aa" }}>
              Butuh akses? Hubungi pemilik toko.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div id="admin-root" className="flex min-h-screen" style={{ background: "var(--bg)" }}>
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
                {group.items.map((item) => (
                  <li key={item.label}>
                    {"panel" in item ? (
                      <button
                        onClick={() => go(item.panel)}
                        onMouseEnter={() => preloadPanel(item.panel)}
                        onFocus={() => preloadPanel(item.panel)}
                        className={`sidebar-link ${activePanel === item.panel ? "active" : ""}`}
                      >
                        <item.icon size={16} strokeWidth={1.9} />
                        <span className="flex-1 text-left truncate">{item.label}</span>
                        {item.badge && orders.filter((o) => o.status === "pending").length > 0 && (
                          <span className="badge" style={{ background: "var(--sub)", color: "var(--fg)" }}>
                            {orders.filter((o) => o.status === "pending").length}
                          </span>
                        )}
                      </button>
                    ) : (
                      <Link href={item.href} className="sidebar-link" onClick={() => setSidebarOpen(false)}>
                        <item.icon size={16} strokeWidth={1.9} />
                        <span className="flex-1">{item.label}</span>
                      </Link>
                    )}
                  </li>
                ))}
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
          <button onClick={handleLogout} className="sidebar-link w-full" style={{ color: "#ef4444" }}>
            <LogOut size={16} strokeWidth={1.9} />
            <span className="flex-1 text-left">Keluar</span>
          </button>
        </div>
      </aside>

      {/* Overlay mobile */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="sticky top-0 z-20" style={{ background: "var(--card)", borderBottom: "1px solid var(--bd)" }}>
          <div className="flex items-center gap-4 px-5 lg:px-8 h-20">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 -ml-2 rounded-lg" style={{ color: "var(--fg)" }}>
              <Menu size={24} strokeWidth={1.8} />
            </button>
            <div className="min-w-0">
              <h1 className="text-xl lg:text-2xl font-extrabold leading-tight truncate" style={{ color: "var(--fg)" }}>{panelTitles[activePanel].title}</h1>
              <p className="text-xs mt-1 hidden sm:block truncate" style={{ color: "var(--fg3)" }}>{panelTitles[activePanel].sub}</p>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <div className="relative hidden md:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2" size={16} strokeWidth={1.9} style={{ color: "var(--fg3)" }} />
                <input type="text" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Cari produk..." className="pl-9 pr-8 py-2 w-56 rounded-lg text-sm outline-none" style={{ border: "1px solid var(--bd)", background: "var(--sub)", color: "var(--fg)" }} />
                {productSearch && (
                  <button onClick={() => setProductSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--fg3)" }}>
                    <X size={15} />
                  </button>
                )}
              </div>
              <button className="relative p-2.5 rounded-lg" style={{ border: "1px solid var(--bd)", background: "var(--card)" }}>
                <Bell size={19} strokeWidth={1.8} style={{ color: "var(--fg2)" }} />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full" style={{ background: "var(--fg)" }} />
              </button>
              <div className="relative">
                <button onClick={() => setProfileOpen(!profileOpen)} className="flex items-center gap-2.5 pl-2 cursor-pointer">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold text-sm" style={{ background: "#18181b" }}>
                    {user.email?.charAt(0).toUpperCase() || "A"}
                  </div>
                  <div className="hidden sm:block leading-tight text-left">
                    <p className="text-sm font-semibold" style={{ color: "var(--espresso)" }}>{user.email?.split("@")[0] || "Admin"}</p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>{role === "owner" ? "Owner" : role === "admin" ? "Admin" : "User"}</p>
                  </div>
                </button>
                {profileOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 w-64 rounded-xl z-50 overflow-hidden" style={{ background: "white", border: "1px solid #e4e4e7", boxShadow: "0 12px 40px -8px rgba(0,0,0,.12)" }}>
                      <div className="px-4 py-3" style={{ borderBottom: "1px solid #f1f1f3" }}>
                        <p className="text-sm font-semibold" style={{ color: "var(--espresso)" }}>{user.email?.split("@")[0] || "Admin"}</p>
                        <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{user.email}</p>
                      </div>
                      <button onClick={handleLogout} className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors hover:bg-[var(--bg-secondary)]" style={{ color: "var(--espresso)" }}>
                        <LogOut size={16} strokeWidth={1.6} />
                        Keluar
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        {/* Panel yang sudah pernah dibuka tetap TERPASANG dan cuma disembunyikan (`KeptPanel`),
            jadi pindah menu tidak me-render ulang panelnya: datanya tidak diambil lagi dan tidak
            ada layar loading. Menu yang kursor-nya sempat menyentuh juga sudah dimuat lebih dulu. */}
        <main className="flex-1 p-5 lg:p-8 overflow-x-hidden">
          {/* DASHBOARD */}
          {keepPanels.includes("dashboard") && (
            <KeptPanel active={activePanel === "dashboard"}>
              <DashboardView
                revenue={dashRevenue}
                orders={dashOrders}
                chartOrders={trendOrders}
                topProducts={topProducts}
                loading={loading || dashLoading}
                periodValue={bulanValue}
                periodLabel={periodLabel}
                onPrevMonth={() => shiftDashMonth(-1)}
                onNextMonth={() => shiftDashMonth(1)}
                onThisMonth={() => setBulanValue(currentMonthWIB())}
              />
            </KeptPanel>
          )}

          {/* ORDER MANAGEMENT — ala Shopee Seller Centre: tab tahap + daftar.
              Seluruh alurnya (tab sumber, pencarian, tab tahap, daftar, tabel) hidup di
              `OrdersView` supaya file ini tidak lagi menampung panel pesanan sepanjang itu.
              Aksi pesanan (Atur Pesanan / Cetak Label / Hubungi Pembeli) sengaja hanya ada di
              drawer detail, jadi halaman ini tidak mengoper `arrangeOrder` ke daftarnya. */}
          {keepPanels.includes("orders") && (
            <KeptPanel active={activePanel === "orders"}>
              <OrdersView
                orders={dashOrders}
                loading={dashLoading}
                periodLabel={periodLabel}
                onPrevMonth={() => shiftDashMonth(-1)}
                onNextMonth={() => shiftDashMonth(1)}
                onSelect={(row) => setSelectedOrder(dashOrders.find((o) => o.id === row.id) || null)}
              />
            </KeptPanel>
          )}

          {/* PRODUCTS */}
          {keepPanels.includes("products") && (
            <KeptPanel active={activePanel === "products"}>
              <ProductsCatalog
                items={filteredCatalogItems}
                total={catalogItemsWithStock.length}
                thumbnails={productThumbnails}
                search={productSearch}
                setSearch={setProductSearch}
                onDelete={handleDeleteProduct}
                onDetail={setSelectedProductId}
                loading={loading}
              />
            </KeptPanel>
          )}

          {/* CUSTOMERS */}
          {keepPanels.includes("customers") && (
            <KeptPanel active={activePanel === "customers"}>
              <CustomersView />
            </KeptPanel>
          )}

          {/* LIVE CHAT — tab Percakapan + Pengaturan asisten AI */}
          {keepPanels.includes("chats") && (
            <KeptPanel active={activePanel === "chats"}>
              <LiveChatView />
            </KeptPanel>
          )}

          {/* CONTENT */}
          {keepPanels.includes("content") && (
            <KeptPanel active={activePanel === "content"}>
              <div>
                <h2 className="text-2xl italic mb-1" style={{ fontFamily: "var(--font-cormorant), Georgia, serif" }}>Konten Website</h2>
                <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>Kelola bagian yang tampil di samaqu.vercel.app</p>
                <Link href="/admin/konten-website" className="card p-5 flex items-center justify-between hover:shadow-md transition-shadow" style={{ cursor: "pointer" }}>
                  <div>
                    <h3 className="font-semibold mb-1" style={{ color: "var(--espresso)" }}>Kelola Konten Halaman</h3>
                    <p className="text-sm" style={{ color: "var(--text-muted)" }}>Edit Hero, Koleksi Pilihan, Cara Pemesanan, Testimoni</p>
                  </div>
                  <span className="text-sm font-semibold" style={{ color: "var(--gold)" }}>Buka →</span>
                </Link>
              </div>
            </KeptPanel>
          )}

          {/* TEMPLATE NOTIF — dipisah dari Pengaturan; logic simpan tetap sama. */}
          {keepPanels.includes("notif-template") && (
            <KeptPanel active={activePanel === "notif-template"}>
              <NotifikasiKatalog />
            </KeptPanel>
          )}

          {/* SETTINGS */}
          {keepPanels.includes("settings") && (
            <KeptPanel active={activePanel === "settings"}>
              <SettingsPanel />
            </KeptPanel>
          )}
        </main>
      </div>

      {/* Drawer detail produk — dibuka dari kartu katalog (tombol mata) */}
      <ProductDetailDrawer productId={selectedProductId} onClose={() => setSelectedProductId(null)} onPublishedChange={handleProductPublished} />

      {/* Drawer detail pesanan — meluncur dari kanan, sama seperti drawer detail produk */}
      <OrderDetailDrawer
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onStatusChange={(status) => { if (selectedOrder) updateOrderStatus(selectedOrder.order_number, status); }}
        onCancelJnt={() => { if (selectedOrder) cancelJntOrder(selectedOrder); }}
        onArrangeOrder={() => { if (selectedOrder) arrangeOrder(selectedOrder); }}
        onDelete={() => { if (selectedOrder) deleteOrder(selectedOrder.order_number); }}
        onSynced={(patch) => {
          // Tracking J&T (server) menaikkan status → segarkan baris daftar & drawer.
          if (!selectedOrder) return;
          setOrders((prev) => prev.map((o) => o.order_number === selectedOrder.order_number ? { ...o, ...patch } : o));
          setDashOrders((prev) => prev.map((o) => o.order_number === selectedOrder.order_number ? { ...o, ...patch } : o));
          setSelectedOrder((prev) => (prev ? { ...prev, ...patch } : prev));
        }}
      />

      <ConfirmModal
        open={confirmModal.open}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        danger={confirmModal.danger}
        onConfirm={() => { confirmModal.onConfirm(); setConfirmModal((prev) => ({ ...prev, open: false })); }}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, open: false }))}
      />

      {/* Token tema admin (wireframe-accurate "Sales Analytics View") — satu sumber
          yang sama dengan AdminShell & dashboard /id/admin, supaya tidak drift. */}
      <style jsx global>{ADMIN_WF_VARS}</style>
    </div>
  );
}


export default function AdminPage() {
  return <AdminPageInner />;
}
