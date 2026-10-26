"use client";

import { supabase } from "@/lib/supabase";

/**
 * Minta revalidate halaman publik dari dashboard admin.
 *
 * Secret tidak pernah dikirim ke browser: route /api/revalidate menerima sesi admin
 * (Authorization Bearer) dan memverifikasinya lewat tabel `admins`.
 */
export async function requestRevalidate(productId?: string): Promise<boolean> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const res = await fetch("/api/revalidate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token || ""}`,
      },
      body: JSON.stringify(productId ? { productId } : {}),
    });
    return res.ok;
  } catch {
    return false;
  }
}
