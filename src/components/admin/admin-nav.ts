/**
 * SUMBER TUNGGAL daftar menu dashboard admin.
 *
 * Dipakai `AdminShell` (sidebar untuk subhalaman seperti Ulasan Pelanggan, Konten Website,
 * Voucher, dst) DAN sidebar di `src/app/(internal)/admin/page.tsx`.
 *
 * Sebelumnya keduanya punya daftar sendiri-sendiri, jadi menu terlihat "berubah" begitu
 * admin pindah dari /admin ke salah satu subhalaman (mis. Promo hilang).
 *
 * Aturan item:
 *  - `panel` → membuka panel di dalam `/admin` (`/admin?panel=...`), tanpa reload halaman.
 *  - `href`  → halaman terpisah (mis. /admin/promo).
 */

import {
  LayoutDashboard, ShoppingBag, Package, Users, FileText, Settings,
  Ticket, Ruler, Image, Shirt, MessageCircle, Star, Camera,
  Users2, TrendingUp, CreditCard, Percent, Tag,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type AdminPanel =
  | "dashboard"
  | "orders"
  | "products"
  | "customers"
  | "chats"
  | "content"
  | "notif-template"
  | "settings";

export type AdminNavItem =
  | { label: string; icon: LucideIcon; panel: AdminPanel; badge?: "orders" | "reviews" }
  | { label: string; icon: LucideIcon; href: string; badge?: "reviews" };

export const ADMIN_NAV_GROUPS: { title: string; items: AdminNavItem[] }[] = [
  {
    title: "Menu Utama",
    items: [
      { label: "Dashboard", icon: LayoutDashboard, panel: "dashboard" },
      { label: "Order Management", icon: ShoppingBag, panel: "orders", badge: "orders" },
      { label: "Open Order", icon: Shirt, href: "/admin/open-order" },
      { label: "Promo", icon: Tag, href: "/admin/promo" },
      { label: "Ulasan Pelanggan", icon: Star, href: "/admin/testimoni", badge: "reviews" },
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
      { label: "Template Notif", icon: Star, panel: "notif-template" },
      { label: "Pengaturan", icon: Settings, panel: "settings" },
    ],
  },
];

/** URL tujuan item — panel dibuka lewat query `?panel=` supaya sidebar tidak berganti. */
export function adminNavHref(item: AdminNavItem): string {
  return "panel" in item ? `/admin${item.panel === "dashboard" ? "" : `?panel=${item.panel}`}` : item.href;
}
