/**
 * Profil AI per AUDIENS — satu engine, dua konteks yang terpisah.
 *
 *   customer → `getChatConfig()` (tabel `chat_settings`, sudah ada) — dipakai live chat publik
 *   admin    → tabel `ai_admin_settings` (opsional) → ENV → kredensial provider yang sama
 *
 * Aturan penting:
 *   - Model, batas token, dan jumlah putaran tool DIPISAH per audiens supaya menyetel
 *     asisten admin tidak pernah mengubah perilaku chat customer.
 *   - Flag `enabled` customer dan admin tidak saling memengaruhi: mematikan chat publik
 *     tidak mematikan asisten admin, dan sebaliknya.
 *   - API key hanya dibaca di server dan tidak pernah dikirim ke klien.
 *
 * Server-only.
 */

import { getChatConfig, isChatReady, type ChatConfig } from "@/lib/chat-config";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export type AiAudience = "customer" | "admin";

export interface AiProfile {
  audience: AiAudience;
  /** Siap dipakai (diaktifkan + ada API key). */
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  maxToolRounds: number;
  /** Batas riwayat percakapan yang dikirim ke model (pesan terakhir). */
  maxMessages: number;
  /** Batas panjang satu pesan. */
  maxChars: number;
  timeoutMs: number;
  /** Sapaan pembuka (dipakai UI admin & widget customer). */
  greeting: string;
  /** Instruksi tambahan dari admin (customer: `chat_settings.extra_instructions`). */
  extraInstructions: string;
  /** Sumber konfigurasi — untuk pesan diagnostik di UI, bukan untuk klien publik. */
  source: "db" | "env";
}

/** Nilai default customer — dipakai apa adanya oleh `/api/chat` (perilaku tidak berubah). */
const CUSTOMER_DEFAULTS = {
  temperature: 0.4,
  maxTokens: 450,
  maxToolRounds: 4,
  maxMessages: 12,
  maxChars: 2000,
  timeoutMs: 60_000,
} as const;

/** Nilai default asisten admin — boleh beda, tidak memengaruhi customer. */
const ADMIN_DEFAULTS = {
  temperature: 0.2,
  maxTokens: 900,
  maxToolRounds: 5,
  maxMessages: 16,
  maxChars: 2000,
  timeoutMs: 60_000,
} as const;

export function clearAiProfileCache() {
  adminProfileCache = null;
}

/* ─────────────────────────── CUSTOMER ─────────────────────────── */

/**
 * Profil customer = pembungkus `getChatConfig()` (sumber & cache yang sama seperti sebelumnya).
 * Tidak ada nilai baru yang dikarang di sini: semua berasal dari `chat_settings`/ENV.
 */
export async function getCustomerProfile(): Promise<AiProfile> {
  const config: ChatConfig = await getChatConfig();
  return {
    audience: "customer",
    enabled: isChatReady(config),
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
    ...CUSTOMER_DEFAULTS,
    greeting: config.greeting || "",
    extraInstructions: config.extraInstructions || "",
    source: "db",
  };
}

/* ──────────────────────────── ADMIN ───────────────────────────── */

interface AdminRow {
  enabled?: unknown;
  api_key?: unknown;
  base_url?: unknown;
  model?: unknown;
  greeting?: unknown;
  extra_instructions?: unknown;
  temperature?: unknown;
  max_tokens?: unknown;
  max_tool_rounds?: unknown;
}

interface AdminStored {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
  greeting: string;
  extraInstructions: string;
  temperature?: number;
  maxTokens?: number;
  maxToolRounds?: number;
}

let adminProfileCache: { value: AiProfile; ts: number } | null = null;
const ADMIN_CACHE_TTL_MS = 60_000;

/** Baris `ai_admin_settings` (kalau tabelnya sudah dibuat admin). Null bila tidak ada. */
async function dbAdminConfig(): Promise<AdminStored | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("ai_admin_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (error || !data) return null;
    const row = data as AdminRow;
    const num = (v: unknown, fallback?: number) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : fallback;
    };

    return {
      enabled: row.enabled === true,
      apiKey: String(row.api_key || ""),
      baseUrl: String(row.base_url || ""),
      model: String(row.model || ""),
      greeting: String(row.greeting || ""),
      extraInstructions: String(row.extra_instructions || ""),
      temperature: num(row.temperature),
      maxTokens: num(row.max_tokens),
      maxToolRounds: num(row.max_tool_rounds),
    };
  } catch (e) {
    console.error("[AI-ADMIN] Gagal membaca ai_admin_settings, pakai ENV:", e);
    return null;
  }
}

/** Kredensial provider (key/base URL) — milik akun MiMo yang sama dengan chat customer. */
async function providerCredentials(): Promise<{ apiKey: string; baseUrl: string }> {
  const envKey = process.env.MIMO_API_KEY || "";
  const envBase = process.env.MIMO_BASE_URL || "";
  if (envKey) return { apiKey: envKey, baseUrl: envBase || "https://api.xiaomimimo.com/v1" };

  // Cadangan terakhir: kredensial yang sudah diisi admin di `chat_settings`
  // (hanya kredensialnya — flag enabled & prompt customer TIDAK diambil).
  const customer = await getChatConfig();
  return { apiKey: customer.apiKey, baseUrl: envBase || customer.baseUrl };
}

/**
 * Profil asisten admin. Urutan: tabel `ai_admin_settings` → ENV → default.
 * `MIMO_ADMIN_MODEL` menimpa model default kalau kolom DB kosong.
 */
export async function getAdminProfile(): Promise<AiProfile> {
  if (adminProfileCache && Date.now() - adminProfileCache.ts < ADMIN_CACHE_TTL_MS) {
    return adminProfileCache.value;
  }

  const [stored, credentials] = await Promise.all([dbAdminConfig(), providerCredentials()]);

  const apiKey = stored?.apiKey || credentials.apiKey;
  const baseUrl = stored?.baseUrl || credentials.baseUrl;
  const model = stored?.model || process.env.MIMO_ADMIN_MODEL || "mimo-v2.6-flash";

  const profile: AiProfile = {
    // Default dulu, baru nilai dari DB/ENV — supaya kolom DB benar-benar menimpa default.
    ...ADMIN_DEFAULTS,
    audience: "admin",
    // Asisten admin tidak bergantung pada flag `enabled` chat publik — cukup ada kredensial.
    enabled: (stored ? stored.enabled : true) && !!apiKey,
    apiKey,
    baseUrl,
    model,
    temperature: stored?.temperature ?? ADMIN_DEFAULTS.temperature,
    maxTokens: stored?.maxTokens ?? ADMIN_DEFAULTS.maxTokens,
    maxToolRounds: stored?.maxToolRounds ?? ADMIN_DEFAULTS.maxToolRounds,
    greeting: stored?.greeting || "",
    extraInstructions: stored?.extraInstructions || "",
    source: stored ? "db" : "env",
  };

  adminProfileCache = { value: profile, ts: Date.now() };
  return profile;
}
