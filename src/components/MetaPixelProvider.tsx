"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { supabase } from "@/lib/supabase";
import {
  flushMetaPixelQueue,
  setMetaPixelConfig,
  trackPageView,
  type MetaPixelConfig,
} from "@/lib/meta-pixel";

// ── Context ──

interface MetaPixelContextValue {
  config: MetaPixelConfig | null;
  isReady: boolean;
}

const MetaPixelContext = createContext<MetaPixelContextValue>({ config: null, isReady: false });

export function useMetaPixel() {
  return useContext(MetaPixelContext);
}

/* ── Pixel ID dari environment ──
   `NEXT_PUBLIC_META_PIXEL_ID` dipakai kalau dashboard admin belum menyimpan Pixel ID.
   Nilai dari store_settings tetap MENANG supaya admin bisa mengganti / mematikan pixel
   tanpa redeploy. ID wajib numerik — jangan pernah menyisipkan nilai bebas ke base code. */
const ENV_PIXEL_ID = (process.env.NEXT_PUBLIC_META_PIXEL_ID || "").trim();
const PIXEL_ID_PATTERN = /^\d{8,20}$/;

function validPixelId(value: string | null | undefined): string {
  const id = (value || "").trim();
  return PIXEL_ID_PATTERN.test(id) ? id : "";
}

// Test event code hanya boleh alfanumerik — nilainya masuk ke inline script.
function validTestEventCode(value: string | null | undefined): string {
  const code = (value || "").trim();
  return /^[A-Za-z0-9]{1,32}$/.test(code) ? code : "";
}

// ── Config cache (module-level, 5 min TTL) ──

let cachedConfig: MetaPixelConfig | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchConfig(): Promise<MetaPixelConfig | null> {
  const now = Date.now();
  if (cachedConfig && now - cacheTimestamp < CACHE_TTL) return cachedConfig;

  try {
    const { data } = await supabase
      .from("store_settings")
      .select("meta_pixel_id, meta_pixel_enabled, meta_test_event_code")
      .eq("id", 1)
      .maybeSingle();

    const dbPixelId = validPixelId(data?.meta_pixel_id);
    const envPixelId = validPixelId(ENV_PIXEL_ID);

    if (dbPixelId) {
      // Ada Pixel ID di dashboard → status aktif/nonaktif admin yang menentukan.
      cachedConfig = {
        pixelId: dbPixelId,
        enabled: Boolean(data?.meta_pixel_enabled),
        testEventCode: validTestEventCode(data?.meta_test_event_code) || undefined,
      };
    } else if (envPixelId) {
      // Belum diatur di dashboard → pakai environment variable.
      cachedConfig = { pixelId: envPixelId, enabled: true };
    } else {
      cachedConfig = null;
    }
    cacheTimestamp = now;
  } catch {
    // Gagal baca settings: tetap pakai env kalau ada, kalau tidak biarkan cache lama.
    const envPixelId = validPixelId(ENV_PIXEL_ID);
    if (!cachedConfig && envPixelId) {
      cachedConfig = { pixelId: envPixelId, enabled: true };
    }
  }

  return cachedConfig;
}

// ── Provider ──

export default function MetaPixelProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<MetaPixelConfig | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const pathname = usePathname();
  const lastTrackedPath = useRef<string | null>(null);

  // Fetch config on mount + on window focus (for pixel ID changes)
  const loadConfig = useCallback(async () => {
    const cfg = await fetchConfig();
    setConfig(cfg);
    setMetaPixelConfig(cfg);
    // Event yang terjadi sebelum config siap ikut dikirim begitu pixel siap.
    flushMetaPixelQueue();
  }, []);

  useEffect(() => {
    loadConfig();

    const handleFocus = () => loadConfig();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [loadConfig]);

  const handleScriptReady = useCallback(() => {
    setScriptReady(true);
    flushMetaPixelQueue();
  }, []);

  /* PageView sekali per pathname — termasuk halaman pertama dan setiap perpindahan route SPA.
     `lastTrackedPath` memastikan tidak ada PageView dobel saat config/script baru siap
     (dulu efek "initial" + efek "route change" bisa menembak dua kali untuk halaman yang sama). */
  useEffect(() => {
    if (!scriptReady || !config?.enabled) return;
    if (lastTrackedPath.current === pathname) return;
    lastTrackedPath.current = pathname;
    trackPageView();
  }, [pathname, scriptReady, config]);

  return (
    <MetaPixelContext.Provider value={{ config, isReady: scriptReady && !!config?.enabled }}>
      {/* Meta Pixel base code — satu kali di layout global */}
      {config?.enabled && config.pixelId && (
        <Script
          id="meta-pixel"
          strategy="afterInteractive"
          onReady={handleScriptReady}
          onLoad={handleScriptReady}
          dangerouslySetInnerHTML={{
            __html: `
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${config.pixelId}');
              ${config.testEventCode ? `fbq('set', 'agent', '${config.testEventCode}');` : ""}
            `,
          }}
        />
      )}
      {children}
    </MetaPixelContext.Provider>
  );
}
