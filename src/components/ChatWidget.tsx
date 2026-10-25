"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { X } from "lucide-react";
import { useSafeTranslations } from "@/lib/safe-i18n";
import { RobotIcon } from "./chat/shared";

/**
 * Tombol chat storefront.
 *
 * Panel chat (streaming, upload, riwayat) dimuat terpisah lewat `next/dynamic`.
 * Bubble dan tombol bulat tetap dirender langsung supaya tampilan tidak berubah.
 * Panel diunduh saat bubble muncul, saat hover/fokus, atau saat tombol diklik.
 */

const ChatPanel = dynamic(() => import("./chat/ChatPanel"), { ssr: false });

const FAB_DISMISS_KEY = "samaqu_chat_fab_dismissed_v2";
const FAB_REAPPEAR_DELAY_MS = 45_000;

export default function ChatWidget() {
  const t = useSafeTranslations("chat");
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [fabDismissed, setFabDismissed] = useState(false);
  const [fabBubbleVisible, setFabBubbleVisible] = useState(false);
  const [greeting, setGreeting] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const fabShowTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fabReappearTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fabReappearUsedRef = useRef(false);
  const fabSnoozeRef = useRef(false);
  const panelPromiseRef = useRef<Promise<unknown> | null>(null);

  /** Unduh chunk panel sekali; pemanggilan berikutnya memakai promise yang sama. */
  function loadPanel() {
    if (!panelPromiseRef.current) {
      panelPromiseRef.current = import("./chat/ChatPanel").catch((error) => {
        panelPromiseRef.current = null;
        throw error;
      });
    }
    return panelPromiseRef.current;
  }

  function openChat() {
    loadPanel()
      .then(() => setOpen(true))
      .catch((error) => console.error("[CHAT] Gagal memuat panel:", error));
  }

  function dismissFab() {
    setFabBubbleVisible(false);
    clearTimeout(fabShowTimerRef.current);
    fabSnoozeRef.current = true;

    if (!fabReappearUsedRef.current) {
      fabReappearUsedRef.current = true;
      clearTimeout(fabReappearTimerRef.current);
      fabReappearTimerRef.current = setTimeout(() => {
        fabSnoozeRef.current = false;
        setFabBubbleVisible(true);
      }, FAB_REAPPEAR_DELAY_MS);
      return;
    }

    clearTimeout(fabReappearTimerRef.current);
    setFabDismissed(true);
    try {
      sessionStorage.setItem(FAB_DISMISS_KEY, "1");
    } catch {
      // storage tidak tersedia (mode privat / penuh) → cukup state di memori
    }
  }

  useEffect(() => {
    try {
      if (sessionStorage.getItem(FAB_DISMISS_KEY) === "1") setFabDismissed(true);
    } catch {
      // storage tidak tersedia → biarkan bubble tampil apa adanya
    }
  }, []);

  // Bubble teks FAB: muncul setelah 5 detik ATAU 30% scroll, sama seperti versi lama.
  useEffect(() => {
    fabShowTimerRef.current = setTimeout(() => {
      if (!fabSnoozeRef.current) setFabBubbleVisible(true);
    }, 5000);

    function onScroll() {
      if (fabSnoozeRef.current) return;
      const scrollable = document.body.scrollHeight - window.innerHeight;
      if (scrollable <= 0) return;
      if (window.scrollY / scrollable >= 0.3) setFabBubbleVisible(true);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      clearTimeout(fabShowTimerRef.current);
      clearTimeout(fabReappearTimerRef.current);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/chat")
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !json.enabled) return;
        setReady(true);
        setGreeting(json.greeting || t("greeting"));
        setWhatsapp(json.whatsapp || "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bubble muncul → hangatkan panel di belakang layar supaya klik pertama instan.
  useEffect(() => {
    if (ready && fabBubbleVisible) loadPanel().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fabBubbleVisible]);

  if (!ready) return null;

  if (open) {
    return (
      <ChatPanel
        greeting={greeting}
        whatsapp={whatsapp}
        onClose={() => setOpen(false)}
      />
    );
  }

  return (
    <div
      className="fixed right-4 sm:right-6 z-[95]"
      style={{ bottom: "var(--fab-bottom, calc(var(--mobile-nav-h) + 5.75rem))" }}
    >
      {!fabDismissed && fabBubbleVisible && (
        <div className="absolute right-[calc(100%+12px)] top-1/2 -translate-y-1/2">
          <button
            type="button"
            onMouseEnter={() => loadPanel().catch(() => {})}
            onFocus={() => loadPanel().catch(() => {})}
            onTouchStart={() => loadPanel().catch(() => {})}
            onClick={openChat}
            className="block w-max max-w-[calc(100vw_-_5.25rem)] sm:max-w-[17rem] rounded-2xl px-3.5 py-2.5 text-left"
            style={{ background: "#fff", boxShadow: "0 8px 28px -8px rgba(0,0,0,.35)" }}
          >
            <span
              className="block text-[11px] leading-snug tracking-[0.14em] uppercase font-ui font-medium"
              style={{ color: "var(--fg, #18181b)" }}
            >
              {t("fabLabel")}
            </span>
          </button>

          <span
            aria-hidden
            className="absolute -right-1 top-1/2 -translate-y-1/2 w-3 h-3 rotate-45"
            style={{ background: "#fff" }}
          />

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              dismissFab();
            }}
            aria-label={t("fabDismiss")}
            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-white"
            style={{ background: "rgba(0,0,0,.7)" }}
          >
            <X size={12} />
          </button>
        </div>
      )}

      <button
        type="button"
        onMouseEnter={() => loadPanel().catch(() => {})}
        onFocus={() => loadPanel().catch(() => {})}
        onTouchStart={() => loadPanel().catch(() => {})}
        onClick={openChat}
        aria-label={t("open")}
        className="h-14 w-14 rounded-full inline-flex items-center justify-center text-white shadow-lg transition-transform hover:scale-105"
        style={{ background: "#000" }}
      >
        <RobotIcon size={24} />
      </button>
    </div>
  );
}
