"use client";

// Hanya nama ini yang benar-benar ter-export oleh lucide-react versi proyek ini (sudah
// dicek lewat `tsc`): Ruler, Package, Truck, ShieldCheck, MessageCircle, Search,
// ExternalLink, Users. Nama seperti `CircleHelp`/`BadgeCheck`/`Share2` hanya alias dan
// ditolak TypeScript di sini.
import {
  ExternalLink,
  MessageCircle,
  Package,
  Ruler,
  Search,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Konfigurasi menu drawer mobile — SATU sumber data.
 *
 * Untuk menambah item: tambahkan satu entri di sini + key terjemahannya di
 * `src/i18n/messages/{id,en}.json` (namespace `nav`). Komponen tidak perlu diubah.
 */

/** Satu link di menu utama. */
export interface DrawerNavItem {
  /** Path internal tanpa prefix bahasa. */
  path: string;
  /** Key terjemahan namespace `nav`. */
  labelKey: string;
}

/** Menu utama (urutan render). */
export const DRAWER_NAV: DrawerNavItem[] = [
  { path: "", labelKey: "nav.home" }, // "" = beranda (homeHref dihitung pemanggil)
  { path: "/katalog", labelKey: "nav.katalog" },
  { path: "/testimoni", labelKey: "nav.testimoni" },
  { path: "/sama-quran", labelKey: "nav.sama_quran" },
  { path: "/tentang-kami", labelKey: "nav.tentang" },
];

/** Satu tombol di grid Bantuan. */
export interface DrawerHelpItem {
  path: string;
  labelKey: string;
  /** Ikon di atas label — semuanya dari `lucide-react`, sama dengan footer drawer. */
  icon: LucideIcon;
  /** true = tautan luar, buka di tab baru. */
  external?: boolean;
}

/**
 * Grid Bantuan 3 kolom × 2 baris (6 item). "Affiliate" pindah ke sini dari
 * baris terpisah di versi sebelumnya.
 *
 * Tiap tombol membawa ikonnya sendiri supaya bisa dikenali tanpa membaca label
 * (sama seperti nav bawah: ikon di atas, label di bawah).
 */
export const DRAWER_HELP: DrawerHelpItem[] = [
  { path: "/panduan-ukuran", labelKey: "nav.panduan", icon: Ruler },
  { path: "/cara-pesan", labelKey: "nav.cara_pesan", icon: MessageCircle },
  { path: "/faq", labelKey: "nav.faq", icon: Search },
  { path: "/cek-resi", labelKey: "nav.cek_resi", icon: Package },
  { path: "/garansi-retur", labelKey: "nav.garansi_retur", icon: ShieldCheck },
  { path: "https://affiliate.samaqu.id/", labelKey: "nav.affiliate_short", icon: Users, external: true },
];

/** Path halaman promo Free Cover Hanger (relatif ke locale). */
export const FCH_PATH = "/promo/free-cover-hanger";
