"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { startVisiblePolling } from "@/lib/visible-poll";

/**
 * Jumlah ulasan pelanggan yang menunggu persetujuan (`testimonials.status = 'pending'`,
 * `source = 'customer'`).
 *
 * Dipakai badge menu "Ulasan Pelanggan" di /admin dan /panel-admin supaya angkanya berasal
 * dari satu sumber yang sama dan tidak pernah berbeda antar dashboard. Sumbernya route
 * moderasi `/api/admin/testimonials`, yang mengembalikan `counts.pending`.
 *
 * Badge tidak kritis: polling berhenti saat tab tersembunyi, interval 5 menit, dan request
 * memakai `counts_only=1` supaya server tidak perlu mengambil daftar ulasan + produk.
 */

const POLL_MS = 5 * 60 * 1000;
const REQUEST_CACHE_MS = 60 * 1000;

let cached: { value: number; at: number } | null = null;
let inflight: Promise<number | null> | null = null;

async function fetchPendingCount(): Promise<number | null> {
  if (cached && Date.now() - cached.at < REQUEST_CACHE_MS) return cached.value;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return null;

      // `counts_only=1` cukup: yang dipakai hanya `counts.pending`, bukan daftar ulasannya.
      const res = await fetch("/api/admin/testimonials?status=pending&counts_only=1", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return null;

      const json = await res.json().catch(() => null);
      const pending = json?.counts?.pending;
      return typeof pending === "number" ? pending : null;
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

export function usePendingReviewCount(enabled: boolean) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    const value = await fetchPendingCount();
    if (value !== null) setCount(value);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    return startVisiblePolling(() => { void refresh(); }, POLL_MS);
  }, [enabled, refresh]);

  return count;
}
