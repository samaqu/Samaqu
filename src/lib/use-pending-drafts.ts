"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Jumlah draft transaksi yang menunggu review (`order_drafts.status = 'pending'`).
 *
 * Badge menu "Perlu Review" di panel admin. Sumbernya
 * `GET /api/ops/perlu-review?counts_only=1` (hanya angka, tanpa daftar/transkrip).
 * Event `PERLU_REVIEW_EVENT` dipancarkan halaman review setelah approve/tolak/hapus
 * supaya badge langsung turun tanpa menunggu polling.
 */

export const PERLU_REVIEW_EVENT = "perlu-review-changed";

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
    // Tanpa polling: angka diambil sekali saat panel dibuka, lalu diperbarui
    // lewat event setelah approve/tolak/hapus di halaman review.
    void refresh();
    const onChanged = () => { void refresh(true); };
    // Saat tab kembali aktif, ambil sekali (tanpa timer) supaya draft baru dari WA
    // ikut terlihat tanpa harus reload.
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh(true);
    };
    window.addEventListener(PERLU_REVIEW_EVENT, onChanged);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(PERLU_REVIEW_EVENT, onChanged);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, refresh]);

  return count;
}
