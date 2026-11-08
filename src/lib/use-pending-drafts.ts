"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { startVisiblePolling } from "@/lib/visible-poll";

/**
 * Jumlah draft transaksi yang menunggu review (`order_drafts.status = 'pending'`).
 *
 * Badge menu "Perlu Review" di panel admin. Sumbernya
 * `GET /api/ops/perlu-review?counts_only=1` (hanya angka, tanpa daftar/transkrip).
 * Event `PERLU_REVIEW_EVENT` dipancarkan halaman review setelah approve/tolak/hapus
 * supaya badge langsung turun tanpa menunggu polling.
 */

export const PERLU_REVIEW_EVENT = "perlu-review-changed";

const POLL_MS = 60 * 1000;
const CACHE_MS = 20 * 1000;

let cached: { value: number; at: number } | null = null;
let inflight: Promise<number | null> | null = null;

async function fetchPendingDrafts(): Promise<number | null> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return null;

      const res = await fetch("/api/ops/perlu-review?counts_only=1", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return null;

      const json = await res.json().catch(() => null);
      const drafts = json?.counts?.drafts;
      return typeof drafts === "number" ? drafts : null;
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

export function usePendingDraftCount(enabled: boolean) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async (force = false) => {
    if (force) cached = null;
    const value = await fetchPendingDrafts();
    if (value !== null) setCount(value);
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    void refresh();
    const onChanged = () => { void refresh(true); };
    window.addEventListener(PERLU_REVIEW_EVENT, onChanged);
    const stop = startVisiblePolling(() => { void refresh(true); }, POLL_MS);
    return () => {
      window.removeEventListener(PERLU_REVIEW_EVENT, onChanged);
      stop();
    };
  }, [enabled, refresh]);

  return count;
}
