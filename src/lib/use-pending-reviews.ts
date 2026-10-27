"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Jumlah ulasan pelanggan yang menunggu persetujuan (`testimonials.status = 'pending'`,
 * `source = 'customer'`).
 *
 * Dipakai badge menu "Ulasan Pelanggan" di /admin dan /panel-admin supaya angkanya berasal
 * dari satu sumber yang sama dan tidak pernah berbeda antar dashboard. Sumbernya route
 * moderasi `/api/admin/testimonials`, yang sudah mengembalikan `counts.pending`.
 */
export function usePendingReviewCount(enabled: boolean) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      // `limit=1` cukup: yang dipakai hanya `counts.pending`, bukan daftar ulasannya.
      const res = await fetch("/api/admin/testimonials?status=pending&limit=1", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;

      const json = await res.json().catch(() => null);
      const pending = json?.counts?.pending;
      if (typeof pending === "number") setCount(pending);
    } catch {
      /* Badge hanya penanda; gagal ambil tidak perlu mengganggu dashboard. */
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    refresh();
    // Ulasan baru bisa masuk kapan saja (pengingat otomatis / pelanggan), jadi disegarkan berkala.
    const timer = window.setInterval(refresh, 120000);
    return () => window.clearInterval(timer);
  }, [enabled, refresh]);

  return count;
}
