"use client";

import { useState, useEffect, useRef } from "react";
import { m as motion, AnimatePresence } from "framer-motion";
import { getWhatsAppLink } from "@/lib/store-settings";
import { trackWhatsAppClick } from "@/lib/meta-pixel";
import { useSafeTranslations } from "@/lib/safe-i18n";

function WhatsAppIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="#ffffff">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

/**
 * Tombol WhatsApp mengambang (ikon bulat saja) yang muncul setelah 5 detik atau 30% scroll.
 *
 * Dipaku di kanan bawah dengan jarak dasar `bottom-6` **plus** `--mobile-nav-h`, karena nav
 * bawah mobile (MobileBottomNav, `lg:hidden`) tinggi 62 px di bawah breakpoint `lg` — tanpa
 * offset itu tombolnya menutupi menu "Akun". Variabelnya 0 px di desktop, jadi posisi lama
 * tidak berubah di sana.
 *
 * Catatan: label/tooltip teks sengaja dihapus dari tombol ini; teksnya kini ditampilkan
 * pada tombol chatbot AI (ChatWidget).
 */
export default function AutoCTA() {
  const t = useSafeTranslations("autoCTA");
  const [visible, setVisible] = useState(false);
  const showTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  /* ── Initial trigger: 5s timer OR 30% scroll ── */
  useEffect(() => {
    showTimerRef.current = setTimeout(() => setVisible(true), 5000);

    function onScroll() {
      if (visible) return;
      const scrollPercent = window.scrollY / (document.body.scrollHeight - window.innerHeight);
      if (scrollPercent >= 0.3) {
        setVisible(true);
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      clearTimeout(showTimerRef.current);
      window.removeEventListener("scroll", onScroll);
    };
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.9 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="fixed bottom-[calc(var(--mobile-nav-h)_+_1.5rem)] right-4 sm:right-6 z-[90]"
        >
          {/* FAB Button (ikon saja, tanpa label/tooltip teks) */}
          <a
            href={getWhatsAppLink(t("whatsappMsg"))}
            target="_blank"
            rel="noopener"
            onClick={() => trackWhatsAppClick("auto_cta")}
            className="relative flex items-center justify-center w-14 h-14 rounded-full transition-transform duration-300 hover:scale-105"
            style={{
              background: "#000",
              border: "1px solid #000",
              boxShadow: "0 8px 24px -6px rgba(0,0,0,.35)",
            }}
            aria-label={t("ariaLabel")}
          >
            <span
              className="absolute inset-0 rounded-full animate-ping"
              style={{ background: "#000", opacity: 0.2, animationDuration: "2.5s" }}
            />
            <WhatsAppIcon />
          </a>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
