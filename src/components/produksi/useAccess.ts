"use client";

import { useEffect, useState } from "react";
import { produksiFetch } from "@/lib/produksi-api";

export type ProduksiAccess = {
  loading: boolean;
  allowed: boolean;
  role: "owner" | "leader" | "other";
  canWrite: boolean;
  error: string;
};

/**
 * Akses menu Produksi dari server (bukan dari localStorage).
 * Admin / Admin Operasional akan mendapat allowed=false.
 */
export function useProduksiAccess(): ProduksiAccess {
  const [state, setState] = useState<ProduksiAccess>({
    loading: true,
    allowed: false,
    role: "other",
    canWrite: false,
    error: "",
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const json = await produksiFetch<{
          allowed: boolean;
          role: "owner" | "leader" | "other";
          can_write: boolean;
        }>("/api/ops/production/me");
        if (!cancelled) {
          setState({
            loading: false,
            allowed: json.allowed,
            role: json.role,
            canWrite: json.can_write,
            error: "",
          });
        }
      } catch (e) {
        if (!cancelled) {
          setState({
            loading: false,
            allowed: false,
            role: "other",
            canWrite: false,
            error: e instanceof Error ? e.message : "Gagal memeriksa akses.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
