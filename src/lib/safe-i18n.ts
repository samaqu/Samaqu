"use client";

import { useLocale as useNextIntlLocale, useTranslations as useNextIntlTranslations } from "next-intl";

/**
 * Safe wrapper for useLocale that returns "id" as fallback
 * when NextIntlClientProvider context is not available (e.g. during prerendering)
 */
export function useSafeLocale(): string {
  try {
    return useNextIntlLocale();
  } catch {
    return "id";
  }
}

/**
 * Default Indonesian translations fallback when next-intl context is not ready.
 * Prevents raw key names (e.g. "nav.home") from appearing on screen.
 */
const DEFAULT_MESSAGES: Record<string, Record<string, string>> = {
  nav: {
    home: "Home", katalog: "Katalog", testimoni: "Testimoni", tentang: "Tentang Kami",
    bantuan: "Bantuan", panduan: "Panduan Ukuran", cara_pesan: "Cara Pesan", faq: "FAQ",
    garansi_retur: "Garansi & Retur", cyp: "Create Your Price", sama_quran: "Sama Quran",
    free_cover_hanger: "Gratis Cover Hanger",
    account: "Account", chat_admin: "Chat Admin", bantuan_title: "Butuh bantuan? Hubungi kami.",
  },
  // Panel admin berada DI LUAR provider next-intl, jadi tanpa cadangan ini label pelacakan
  // tampil sebagai nama key mentah ("statusNow:", "fetchedAt:", …). Isinya = id.json.
  tracking: {
    history: "Riwayat Pengiriman",
    refresh: "Perbarui",
    loading: "Memuat…",
    note: "Catatan",
    currentStatusTitle: "Status pengiriman saat ini",
    noteLabel: "Keterangan",
    rawData: "Lihat data mentah",
    close: "Tutup",
    driver: "Kurir",
    receivedBy: "Diterima oleh",
    noUpdate: "Belum ada update dari J&T. Riwayat muncul setelah kurir memindai paket.",
    noResi: "Nomor resi belum tersedia. Kami kabari begitu paket diserahkan ke J&T.",
    stale: "Menampilkan data J&T terakhir yang tersimpan.",
    error: "Tidak bisa menghubungi layanan J&T. Coba lagi sebentar lagi.",
    empty: "Data pelacakan J&T belum bisa diambil.",
  },
};

/**
 * Safe wrapper for useTranslations that returns a fallback translation function
 * when NextIntlClientProvider context is not available
 */
export function useSafeTranslations(namespace?: string) {
  try {
    return useNextIntlTranslations(namespace);
  } catch {
    const ns = namespace || "nav";
    const fallback = DEFAULT_MESSAGES[ns] || {};
    const translate = (key: string) => {
      const fullKey = key.includes(".") ? key.split(".").pop()! : key;
      return fallback[fullKey] || key;
    };
    // Mirror the parts of the translator API the app uses so message lookups
    // keep working when NextIntlClientProvider isn't mounted.
    return Object.assign(translate, {
      rich: translate,
      markup: translate,
      raw: translate,
    });
  }
}
