"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { startVisiblePolling } from "@/lib/visible-poll";

/**
 * Jumlah antrean reseller "perlu dicek" (top up + bayar kekurangan + penarikan
 * yang masih pending). Dipakai badge menu Reseller di /ops dan /panel-admin
 * supaya angkanya berasal dari satu sumber: `/api/ops/reseller/stats`.
 *
 * Badge tidak kritis: polling berhenti saat tab tersembunyi, interval 5 menit,
 * dan beberapa komponen yang memakai hook ini berbagi satu request (cache 60 detik).
 */

const POLL_MS = 5 * 60 * 1000;
const REQUEST_CACHE_MS = 60 * 1000;

let cached: { value: number; at: number } | null = null;
let inflight: Promise<number | null> | null = null;

async function fetchQueueCount(): Promise<number | null> {
  if (cached && Date.now() - cached.at < REQUEST_CACHE_MS) return cached.value;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return null;

      const res = await fetch("/api/ops/reseller/stats", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return null;

      const json = await res.json().catch(() => null);
      return typeof json?.perlu_dicek === "number" ? json.perlu_dicek : null;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();

  const value = await inflight;
  if (value !== null) cached = { value, at: Date.now() };
  return value;
}

export function useResellerQueueCount(enabled: boolean) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    const value = await fetchQueueCount();
    if (value !== null) setCount(value);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    return startVisiblePolling(() => { void refresh(); }, POLL_MS);
  }, [enabled, refresh]);

  return count;
}
