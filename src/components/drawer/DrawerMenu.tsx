"use client";

import { useCallback, useEffect, useState } from "react";
import { getWhatsAppLink } from "@/lib/store-settings";
import { readPromoFchSettings, type PromoFchSettings } from "@/lib/promo/free-cover-hanger-settings";
import s from "./drawer-menu.module.css";
import CypCard from "./CypCard";
import FchCard from "./FchCard";
import { NavList, HelpGrid } from "./NavList";
import MenuFooter from "./MenuFooter";
import { FCH_PATH } from "./drawer-nav";
import type { Locale } from "@/i18n/config";

/**
 * Isi drawer mobile — dirakit dari komponen kecil:
 *   CypCard · FchCard · NavList · HelpGrid · MenuFooter
 *
 * Data kuota promo dibaca dari sumber yang SAMA dengan halaman
 * `/promo/free-cover-hanger` (`readPromoFchSettings()` → kolom `promo_fch_*` di
 * `store_settings`). Tidak ada sumber data baru.
 *
 * Kartu Free Cover Hanger hanya tampil bila promo aktif, dalam periode, dan kuotanya
 * masih ada (`bonusAvailable`); selebihnya disembunyikan.
 */
export default function DrawerMenu({
  locale,
  homeHref,
  currentPath,
  open,
  locales,
  switchLocale,
  onNavigate,
  t,
}: {
  locale: Locale;
  homeHref: string;
  currentPath: string;
  /** true saat drawer terbuka — dipakai mematikan/menyalakan animasi kartu promo. */
  open: boolean;
  locales: readonly Locale[];
  switchLocale: (locale: Locale) => void;
  onNavigate: () => void;
  t: (key: string) => string;
}) {
  const [promo, setPromo] = useState<PromoFchSettings | null>(null);

  const loadPromo = useCallback(() => {
    let active = true;
    readPromoFchSettings()
      .then((settings) => {
        if (active) setPromo(settings);
      })
      .catch(() => {
        /* gagal baca → kartu promo tetap disembunyikan */
      });
    return () => {
      active = false;
    };
  }, []);

  // Dibaca sekali saat komponen dipasang; drawer hanya dirender di klien.
  useEffect(() => loadPromo(), [loadPromo]);

  const cypHref = `/${locale}/create-your-price`;
  const fchHref = `/${locale}${FCH_PATH}`;

  const showFch = Boolean(promo?.bonusAvailable);
  // Kuota dianggap tersedia bila angka total & sisa masuk akal.
  const quotaKnown = Boolean(promo && promo.quotaTotal > 0);
  const quotaPct = quotaKnown
    ? Math.max(0, Math.min(100, Math.round((promo!.quotaLeft / promo!.quotaTotal) * 100)))
    : 0;
  // Teks kuota memakai template terjemahan `nav.fch_quota_left` ("Tinggal %s/%s bonus").
  // Placeholder sengaja `%s` (bukan `{...}`) supaya next-intl tidak menganggapnya variabel ICU
  // dan mengembalikan nama key mentah.
  const quotaTemplate = t("nav.fch_quota_left");
  const quotaText =
    quotaKnown && showFch && quotaTemplate.includes("%s")
      ? quotaTemplate
          .replace("%s", String(promo!.quotaLeft))
          .replace("%s", String(promo!.quotaTotal))
      : null;

  return (
    <div className={s.wrap}>
      {/* 1. Grup PROGRAM */}
      <section className={s.programSection}>
        <span className={s.sectionLabel}>{t("nav.program")}</span>

        <CypCard
          href={cypHref}
          eyebrow={t("nav.cyp_eyebrow")}
          lead={t("nav.cyp_lead")}
          accent={t("nav.cyp_accent")}
          onNavigate={onNavigate}
          active={currentPath === cypHref}
        />

        {showFch ? (
          <FchCard
            href={fchHref}
            eyebrow={t("nav.fch_eyebrow")}
            titlePre={t("nav.fch_title_pre")}
            titleAccent={t("nav.fch_title_accent")}
            note={t("nav.fch_note")}
            priceBefore={t("nav.fch_price_before")}
            priceFree={t("nav.fch_price_free")}
            quotaText={quotaKnown ? quotaText : null}
            cta={t("nav.fch_cta")}
            quotaPct={quotaPct}
            showQuota={quotaKnown}
            animating={open}
            onNavigate={onNavigate}
          />
        ) : null}
      </section>

      {/* 2. Menu utama */}
      <NavList
        locale={locale}
        homeHref={homeHref}
        currentPath={currentPath}
        onNavigate={onNavigate}
        t={t}
      />

      {/* 3. Grid Bantuan */}
      <HelpGrid locale={locale} onNavigate={onNavigate} t={t} />

      {/* 4. Baris bawah: bahasa · Akun · Chat Admin */}
      <MenuFooter
        locale={locale}
        locales={locales}
        accountLabel={t("nav.account")}
        chatLabel={t("nav.chat_admin_cta")}
        chatHref={getWhatsAppLink(
          "Halo Admin SAMAQU, saya tertarik dengan koleksi Anda dan ingin bertanya soal pemesanan.",
        )}
        switchLocale={switchLocale}
        onNavigate={onNavigate}
      />
    </div>
  );
}
