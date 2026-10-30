"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Jumlah antrean reseller "perlu dicek" (top up + bayar kekurangan + penarikan
 * yang masih pending). Dipakai badge menu Reseller di /ops dan /panel-admin
 * supaya angkanya berasal dari satu sumber: `/api/ops/reseller/stats`.
 */
export function useResellerQueueCount(enabled: boolean) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch("/api/ops/reseller/stats", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;

      const json = await res.json().catch(() => null);
      if (typeof json?.perlu_dicek === "number") setCount(json.perlu_dicek);
    } catch {
      /* Badge hanya penanda; gagal ambil tidak perlu mengganggu dashboard. */
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    refresh();
    const timer = window.setInterval(refresh, 120000);
    return () => window.clearInterval(timer);
  }, [enabled, refresh]);

  return count;
}
