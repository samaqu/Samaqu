"use client";

import { useEffect, useRef } from "react";
import { PROMO_PIXEL, promoEventId } from "@/lib/promo/free-cover-hanger";
import { trackViewContent, trackWhatsAppClick } from "@/lib/meta-pixel";

/**
 * Pelacakan Meta Pixel landing promo.
 *
 * Prinsip:
 * 1. **`event_id` deterministik** (`promoEventId`), bukan acak. Refresh halaman / re-render /
 *    klik ganda menghasilkan ID yang sama, sehingga Meta men-dedupe dalam window 48 jam.
 * 2. **Delegasi klik di dokumen**, bukan `onClick` per tombol — markup & style tombol tidak berubah.
 * 3. **Purchase TIDAK ditembak di sini.** Pembelian tetap dicatat flow checkout normal dengan
 *    `event_id` = nomor pesanan (identik dengan CAPI server-side). Menembak Purchase dari landing
 *    membuat revenue terhitung dua kali.
 * 4. Tidak ada data pribadi — hanya nama promo, kategori, dan posisi tombol.
 */
export function PromoPixel() {
  const viewSent = useRef(false);

  useEffect(() => {
    // ── ViewContent: sekali per kunjungan halaman, dengan ID stabil ──
    // Kalau pixel belum siap, `trackViewContent` mengantrekan event di modul meta-pixel
    // dan mengirimkannya begitu config pixel selesai dimuat.
    if (!viewSent.current) {
      viewSent.current = true;
      trackViewContent({
        id: PROMO_PIXEL.eventSource,
        name: PROMO_PIXEL.contentName,
        price: 0,
        category: PROMO_PIXEL.contentCategory,
        content_type: "product",
        eventId: promoEventId("view_content"),
      });
    }

    /** Event klik promo — dipetakan ke `trackCustom` agar tidak mengacaukan atribusi. */
    function fireKatalog(placement: string) {
      const fbq = (window as unknown as { fbq?: (...args: unknown[]) => void }).fbq;
      if (typeof fbq !== "function") return;
      fbq(
        "trackCustom",
        "PromoKatalogClick",
        {
          content_name: PROMO_PIXEL.contentName,
          content_category: PROMO_PIXEL.contentCategory,
          event_source: PROMO_PIXEL.eventSource,
          placement,
        },
        { eventID: promoEventId("cta_katalog", placement) },
      );
    }

    function placementOf(el: Element): string {
      return el.closest("[data-fch-placement]")?.getAttribute("data-fch-placement") || "unknown";
    }

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest) return;

      const katalog = target.closest("a[data-katalog-link]");
      if (katalog) {
        fireKatalog(placementOf(katalog));
        return;
      }

      const wa = target.closest("a[data-wa-number]");
      if (wa) {
        const placement = placementOf(wa);
        trackWhatsAppClick(
          `${PROMO_PIXEL.eventSource}_${placement}`,
          undefined,
          promoEventId("wa_click", placement),
        );
      }
    };

    // `capture` dipakai supaya tetap terpanggil walau ada handler lain yang
    // memanggil stopPropagation di fase bubbling.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
