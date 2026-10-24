import { supabase } from "@/lib/supabase";

/** Fetch JSON ke route /api/ops/production/* dengan Bearer token Supabase. */
export async function produksiFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers: Record<string, string> = {
    ...(init.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((init.headers as Record<string, string>) || {}),
  };

  const res = await fetch(path, { ...init, headers });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((json as any)?.error || `Permintaan gagal (${res.status})`);
  }
  return json as T;
}
