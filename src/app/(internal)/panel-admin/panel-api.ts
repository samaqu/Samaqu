"use client";

/**
 * Helper data panel admin — semua API `/api/ops/*` butuh sesi admin Supabase
 * (`Authorization: Bearer <access_token>`), jadi token diambil dari sesi yang sedang aktif.
 */
import { supabase } from "@/lib/supabase";

export async function authToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Email admin yang sedang masuk — dipakai untuk memisahkan data per akun (mis. riwayat asisten). */
export async function sessionEmail(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.email ?? null;
}

export async function opsGet<T>(path: string): Promise<T> {
  const token = await authToken();
  const res = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error(`Gagal memuat data (${res.status})`);
  return (await res.json()) as T;
}
