import { createHash } from "crypto";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { SITE_URL } from "@/lib/site-config";

/**
 * Meta Conversions API (CAPI) — implementasi server-side.
 *
 * Aturan yang dipegang:
 * - Token akses TIDAK PERNAH dikirim ke browser (hanya dibaca di sini).
 * - Data pribadi di-hash SHA-256 setelah normalisasi; fbp/fbc/IP/UA dikirim apa adanya.
 * - Pengiriman selalu best-effort: gagal CAPI tidak boleh menggagalkan order.
 * - event_id harus sama dengan eventID di browser supaya Meta men-dedupe (window 48 jam).
 */

// v19.0 sudah expired 21 Mei 2026. v26.0 rilis 29 Juli 2026 (versi terbaru saat ini).
export const META_GRAPH_VERSION = "v26.0";
const GRAPH_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const CONFIG_TTL = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5000;

export interface MetaCapiConfig {
  pixelId: string;
  accessToken: string;
  testEventCode?: string;
}

export interface MetaContentsItem {
  id: string;
  quantity: number;
  item_price?: number;
}

export interface MetaUserInput {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  city?: string | null;
  externalId?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  clientIp?: string | null;
  clientUserAgent?: string | null;
}

export interface MetaCapiEventInput {
  eventName: string;
  eventId: string;
  eventSourceUrl?: string | null;
  customData: Record<string, any>;
  userData: MetaUserInput;
  actionSource?: "website" | "system_generated";
}

// ── Config cache (server-side) ──

let cachedConfig: MetaCapiConfig | null = null;
let cacheTimestamp = 0;

export function clearMetaCapiConfigCache(): void {
  cachedConfig = null;
  cacheTimestamp = 0;
}

function validPixelId(value: string | null | undefined): string {
  const id = (value || "").trim();
  return /^\d{8,20}$/.test(id) ? id : "";
}

function validTestEventCode(value: string | null | undefined): string {
  const code = (value || "").trim();
  return /^[A-Za-z0-9]{1,32}$/.test(code) ? code : "";
}

/**
 * Pixel ID + status aktif dibaca dari store_settings (bisa diatur admin), token akses dari
 * `meta_settings` (tabel tanpa policy RLS = service-role only). Fallback ke kolom lama
 * `store_settings.meta_access_token` selama migration belum dijalankan.
 */
export async function getMetaCapiConfig(): Promise<MetaCapiConfig | null> {
  const now = Date.now();
  if (cachedConfig && now - cacheTimestamp < CONFIG_TTL) return cachedConfig;

  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("store_settings")
      .select("meta_pixel_id, meta_pixel_enabled, meta_test_event_code")
      .eq("id", 1)
      .maybeSingle();

    const dbPixelId = validPixelId(data?.meta_pixel_id);
    const envPixelId = validPixelId(process.env.META_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID);
    const pixelId = dbPixelId || envPixelId;
    const enabled = dbPixelId ? Boolean(data?.meta_pixel_enabled) : Boolean(envPixelId);
    if (!pixelId || !enabled) return null;

    let accessToken: string | null = null;

    // Tabel rahasia (service role only). Kalau belum dibuat, fallback ke kolom lama.
    const { data: secret, error: secretError } = await supabase
      .from("meta_settings")
      .select("access_token")
      .eq("id", 1)
      .maybeSingle();
    if (!secretError) accessToken = (secret?.access_token || "").trim() || null;

    if (!accessToken) {
      const { data: legacy } = await supabase
        .from("store_settings")
        .select("meta_access_token")
        .eq("id", 1)
        .maybeSingle();
      accessToken = (legacy?.meta_access_token || "").trim() || null;
    }

    if (!accessToken) return null;

    cachedConfig = {
      pixelId,
      accessToken,
      testEventCode: validTestEventCode(data?.meta_test_event_code) || undefined,
    };
    cacheTimestamp = now;
    return cachedConfig;
  } catch {
    return cachedConfig;
  }
}

// ── Hashing & normalisasi (sesuai customer information parameters Meta) ──

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normEmail(value: string | null | undefined): string | undefined {
  const email = String(value || "").trim().toLowerCase();
  return email || undefined;
}

/**
 * Nomor → digit saja + kode negara, tanpa "+" / spasi / strip / leading zero.
 * Contoh: "+62 812-3456-7890" / "0812 3456 7890" / "62812..." → "6281234567890".
 */
export function normalizePhone(value: string | null | undefined): string | undefined {
  let digits = String(value || "").replace(/\D/g, "");
  if (!digits) return undefined;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith("8")) digits = `62${digits}`;
  return digits.length >= 8 ? digits : undefined;
}

function cleanText(value: string | null | undefined, opts: { stripSpaces?: boolean } = {}): string | undefined {
  let text = String(value || "").trim().toLowerCase();
  if (!text) return undefined;
  text = text.replace(/[^\p{L}\p{N}\s'-]/gu, "");
  if (opts.stripSpaces) text = text.replace(/\s+/g, "");
  return text || undefined;
}

function splitName(fullName: string | null | undefined): { firstName?: string; lastName?: string } {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  return {
    firstName: cleanText(parts[0]),
    lastName: cleanText(parts.slice(1).join(" ")),
  };
}

/** user_data CAPI: PII di-hash, identifier browser/koneksi dikirim mentah. */
export function buildUserData(input: MetaUserInput): Record<string, any> {
  const userData: Record<string, any> = {};

  const email = normEmail(input.email);
  if (email) userData.em = [sha256(email)];

  const phone = normalizePhone(input.phone);
  if (phone) userData.ph = [sha256(phone)];

  const { firstName, lastName } = splitName(input.name);
  if (firstName) userData.fn = [sha256(firstName)];
  if (lastName) userData.ln = [sha256(lastName)];

  const city = cleanText(input.city, { stripSpaces: true });
  if (city) userData.ct = [sha256(city)];

  userData.country = [sha256("id")];

  const externalId = String(input.externalId || "").trim();
  if (externalId) userData.external_id = [sha256(externalId)];

  // Tidak di-hash — string apa adanya.
  if (input.fbp) userData.fbp = String(input.fbp).trim();
  if (input.fbc) userData.fbc = String(input.fbc).trim();
  if (input.clientIp) userData.client_ip_address = String(input.clientIp).trim();
  if (input.clientUserAgent) userData.client_user_agent = String(input.clientUserAgent).trim();

  return userData;
}

// ── Request metadata ──

/** IP customer asli (Vercel menaruh IP klien paling depan di x-forwarded-for). */
export function getClientIp(req: NextRequest): string | undefined {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") || undefined;
}

export function getMetaCookies(req: NextRequest): { fbp?: string; fbc?: string } {
  return {
    fbp: req.cookies.get("_fbp")?.value || undefined,
    fbc: req.cookies.get("_fbc")?.value || undefined,
  };
}

/** Format resmi Meta: fb.<subdomain_index>.<creation_time_ms>.<fbclid>. */
export function buildFbc(fbclid: string | null | undefined, createdAt = Date.now()): string | undefined {
  const id = String(fbclid || "").trim();
  if (!id) return undefined;
  return `fb.1.${createdAt}.${id}`;
}

// ── Custom data ──

const MAX_CONTENTS = 100;
const MAX_STRING = 500;

function safeString(value: any): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text ? text.slice(0, MAX_STRING) : undefined;
}

function safeNumber(value: any): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** Hanya field custom_data yang dikenal yang diteruskan; field lain dibuang. */
export function sanitizeCustomData(input: any): Record<string, any> {
  const source = input && typeof input === "object" ? input : {};
  const out: Record<string, any> = {};

  const value = safeNumber(source.value);
  if (value !== undefined && value >= 0) out.value = value;

  const currency = safeString(source.currency);
  if (currency) out.currency = currency.toUpperCase().slice(0, 3);

  const contentIds = Array.isArray(source.content_ids)
    ? source.content_ids.map(safeString).filter((id: string | undefined): id is string => !!id).slice(0, MAX_CONTENTS)
    : [];
  if (contentIds.length) out.content_ids = contentIds;

  const contentType = safeString(source.content_type);
  if (contentType) out.content_type = contentType;

  const contentName = safeString(source.content_name);
  if (contentName) out.content_name = contentName;

  const contentCategory = safeString(source.content_category);
  if (contentCategory) out.content_category = contentCategory;

  if (Array.isArray(source.contents)) {
    const contents = source.contents
      .map((item: any) => {
        const id = safeString(item?.id);
        const quantity = safeNumber(item?.quantity);
        if (!id || quantity === undefined || quantity <= 0) return null;
        const row: Record<string, any> = { id, quantity: Math.floor(quantity) };
        const itemPrice = safeNumber(item?.item_price);
        if (itemPrice !== undefined && itemPrice >= 0) row.item_price = itemPrice;
        return row;
      })
      .filter(Boolean)
      .slice(0, MAX_CONTENTS);
    if (contents.length) out.contents = contents;
  }

  const numItems = safeNumber(source.num_items);
  if (numItems !== undefined && numItems >= 0) out.num_items = Math.floor(numItems);

  const orderId = safeString(source.order_id);
  if (orderId) out.order_id = orderId;

  const searchString = safeString(source.search_string);
  if (searchString) out.search_string = searchString;

  const status = safeString(source.status);
  if (status) out.status = status;

  const registrationMethod = safeString(source.registration_method);
  if (registrationMethod) out.registration_method = registrationMethod;

  return out;
}

function validEventSourceUrl(value: string | null | undefined): string | undefined {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

// ── Event allowlist & rate limit dasar ──

/** Purchase sengaja TIDAK ada di sini: Purchase hanya dikirim server-side saat order dibuat. */
export const CLIENT_CAPI_EVENTS = new Set([
  "PageView",
  "ViewContent",
  "AddToCart",
  "InitiateCheckout",
  "Search",
  "Lead",
  "CompleteRegistration",
]);

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function checkCapiRateLimit(ip: string | undefined): boolean {
  const key = ip || "unknown";
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    if (rateBuckets.size > 500) {
      for (const [k, v] of rateBuckets) if (now >= v.resetAt) rateBuckets.delete(k);
    }
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_LIMIT_MAX) return false;
  bucket.count += 1;
  return true;
}

// ── Sender ──

export interface MetaCapiResult {
  ok: boolean;
  skipped?: boolean;
  eventsReceived?: number;
}

async function postToMeta(config: MetaCapiConfig, payload: Record<string, any>): Promise<MetaCapiResult> {
  try {
    const response = await fetch(`${GRAPH_URL}/${config.pixelId}/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Token di header — jangan di query string supaya tidak pernah muncul di URL/log.
        Authorization: `Bearer ${config.accessToken}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      let code: unknown;
      let message = "request failed";
      let fbtrace: unknown;
      try {
        const body = await response.json();
        // Log ringkas saja: jangan pernah log payload (berisi identifier + data order).
        code = body?.error?.code;
        message = String(body?.error?.message || "").slice(0, 200);
        fbtrace = body?.error?.fbtrace_id;
      } catch {
        // respons bukan JSON — abaikan isinya
      }
      console.warn("[Meta CAPI] gagal:", { status: response.status, code, message, fbtrace });
      return { ok: false };
    }

    const result = await response.json().catch(() => ({}));
    return { ok: true, eventsReceived: Number(result?.events_received) || 0 };
  } catch (error) {
    // Error jaringan/timeout — jangan log objek request apa pun.
    console.warn("[Meta CAPI] kirim gagal:", error instanceof Error ? error.message : "unknown error");
    return { ok: false };
  }
}

export async function sendMetaCapiEvent(input: MetaCapiEventInput): Promise<MetaCapiResult> {
  const config = await getMetaCapiConfig();
  if (!config) return { ok: false, skipped: true };

  // Website event wajib punya event_source_url — fallback ke halaman utama kalau kosong.
  const eventSourceUrl = validEventSourceUrl(input.eventSourceUrl) || `${SITE_URL}/`;
  const event: Record<string, any> = {
    event_name: input.eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: String(input.eventId),
    action_source: input.actionSource || "website",
    user_data: buildUserData(input.userData),
    custom_data: sanitizeCustomData(input.customData),
  };
  if (eventSourceUrl) event.event_source_url = eventSourceUrl;

  const payload: Record<string, any> = { data: [event] };
  if (config.testEventCode) payload.test_event_code = config.testEventCode;

  return postToMeta(config, payload);
}

export interface MetaPurchaseInput {
  orderNumber: string;
  /** Subtotal produk saja — TANPA ongkir. */
  value: number;
  contents: MetaContentsItem[];
  eventSourceUrl?: string | null;
  user: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    city?: string | null;
    externalId?: string | null;
  };
  fbp?: string | null;
  fbc?: string | null;
  clientIp?: string | null;
  clientUserAgent?: string | null;
}

/**
 * Purchase server-side, dipanggil SEKALI saat order berhasil dibuat.
 * event_id = nomor pesanan → identik dengan eventID Purchase di browser Pixel.
 */
export async function sendMetaPurchaseEvent(input: MetaPurchaseInput): Promise<MetaCapiResult> {
  const contents = input.contents
    .map((item) => ({
      id: String(item.id || "").trim(),
      quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
      ...(Number.isFinite(Number(item.item_price)) ? { item_price: Number(item.item_price) } : {}),
    }))
    .filter((item) => item.id);

  const contentIds = Array.from(new Set(contents.map((item) => item.id)));
  const numItems = contents.reduce((sum, item) => sum + item.quantity, 0);

  return sendMetaCapiEvent({
    eventName: "Purchase",
    eventId: input.orderNumber,
    eventSourceUrl: input.eventSourceUrl,
    userData: {
      ...input.user,
      fbp: input.fbp,
      fbc: input.fbc,
      clientIp: input.clientIp,
      clientUserAgent: input.clientUserAgent,
    },
    customData: {
      value: Math.max(0, Number(input.value) || 0),
      currency: "IDR",
      content_ids: contentIds,
      contents,
      content_type: "product",
      num_items: numItems,
      order_id: input.orderNumber,
    },
  });
}
