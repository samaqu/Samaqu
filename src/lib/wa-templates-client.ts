"use client";

/** Pemanggil API template (browser). Menyertakan token login admin; melempar Error berisi pesan dari server. */

import { supabase } from "@/lib/supabase";
import type { WaTemplate } from "@/lib/wa-template";

async function request<T>(method: "GET" | "POST" | "PATCH" | "DELETE", query = "", body?: Record<string, unknown>): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`/api/ops/wa-templates${query}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || `Gagal (HTTP ${res.status})`);
  return json as T;
}

export const loadTemplates = (all = false) => request<{ items: WaTemplate[]; canManage: boolean }>("GET", all ? "?all=1" : "");
export const createTemplate = (input: { title: string; category: string; content: string }) => request<{ ok: true; id: number }>("POST", "", input);
export const updateTemplate = (id: number, input: Partial<{ title: string; category: string; content: string; active: boolean }>) =>
  request<{ ok: true }>("PATCH", "", { id, ...input });
export const deleteTemplate = (id: number) => request<{ ok: true }>("DELETE", `?id=${id}`);
