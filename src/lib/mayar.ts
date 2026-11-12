import { getSupabaseAdmin } from "./supabase-admin";

/**
 * Klien Mayar Headless API v2 (https://docs.mayar.id/api-reference-v2/introduction).
 *
 * - Kredensial dibaca dari tabel `mayar_settings` (service-role only), dengan fallback env
 *   (`MAYAR_API_KEY` / `MAYAR_WEBHOOK_TOKEN` / `MAYAR_ENV`) — pola yang sama dengan Fonnte/J&T.
 * - Environment menentukan base URL: sandbox `api.mayar.io`, produksi `api.mayar.id`.
 * - Semua respons memakai envelope `{ statusCode, messages, data }`; `statusCode` di body
 *   dianggap OTORITATIF (beberapa endpoint menulis HTTP 200 dengan statusCode != 200).
 */

export type MayarEnv = "sandbox" | "production";

const BASE_URLS: Record<MayarEnv, string> = {
  sandbox: "https://api.mayar.io/hl/v2",
  production: "https://api.mayar.id/hl/v2",
};

export interface MayarConfig {
  apiKey: string;
  webhookToken: string;
  env: MayarEnv;
  /** Admin bisa mematikan gateway tanpa menghapus kredensialnya. */
  enabled: boolean;
}

export function normalizeMayarEnv(value: string | null | undefined): MayarEnv {
  return value === "production" ? "production" : "sandbox";
}

export function mayarBaseUrl(env: MayarEnv): string {
  return BASE_URLS[env];
}

function envConfig(): MayarConfig {
  return {
    apiKey: process.env.MAYAR_API_KEY || "",
    webhookToken: process.env.MAYAR_WEBHOOK_TOKEN || "",
    env: normalizeMayarEnv(process.env.MAYAR_ENV),
    enabled: process.env.MAYAR_ENABLED === "1",
  };
}

async function dbConfig(): Promise<Partial<MayarConfig> | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("mayar_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as Record<string, unknown>;
    return {
      apiKey: typeof row.api_key === "string" ? row.api_key : "",
      webhookToken: typeof row.webhook_token === "string" ? row.webhook_token : "",
      env: row.env ? normalizeMayarEnv(String(row.env)) : undefined,
      enabled: row.enabled === true,
    };
  } catch (e) {
    console.error("[MAYAR] Gagal membaca mayar_settings, pakai env:", e);
    return null;
  }
}

let cached: { config: MayarConfig; ts: number } | null = null;
const CACHE_TTL_MS = 60_000;

/** Dipanggil setelah admin menyimpan kredensial supaya nilai baru langsung dipakai. */
export function clearMayarConfigCache() {
  cached = null;
}

export async function getMayarConfig(): Promise<MayarConfig> {
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.config;

  const fromEnv = envConfig();
  const fromDb = await dbConfig();
  const config: MayarConfig = fromDb
    ? {
        apiKey: fromDb.apiKey || fromEnv.apiKey,
        webhookToken: fromDb.webhookToken || fromEnv.webhookToken,
        env: fromDb.env || fromEnv.env,
        enabled: fromDb.enabled ?? fromEnv.enabled,
      }
    : fromEnv;

  cached = { config, ts: Date.now() };
  return config;
}

/** Siap dipakai kalau diaktifkan admin DAN ada API key. */
export function mayarReady(config: MayarConfig): boolean {
  return config.enabled && !!config.apiKey;
}

interface MayarEnvelope<T> {
  statusCode?: number;
  messages?: string;
  message?: string;
  data?: T;
}

interface MayarResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

async function mayarFetch<T>(
  path: string,
  init?: { method?: string; body?: string }
): Promise<MayarResult<T>> {
  const config = await getMayarConfig();
  if (!config.apiKey) return { ok: false, error: "API key Mayar belum diisi." };

  try {
    const res = await fetch(`${mayarBaseUrl(config.env)}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      ...(init?.body ? { body: init.body } : {}),
      cache: "no-store",
      // Tanpa timeout, Mayar yang menggantung menahan respons checkout (client menyerah di 30s
      // dan customer mengira pesanannya gagal) — dan menahan cron sampai melewati batas durasi.
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => null)) as MayarEnvelope<T> | null;
    const message = body?.messages ?? body?.message ?? "";
    const code = Number(body?.statusCode ?? res.status);
    if (!res.ok || (Number.isFinite(code) && code >= 400)) {
      console.error("[MAYAR] Request gagal:", path, res.status, code, message);
      return { ok: false, error: message || `Mayar menolak permintaan (${code}).` };
    }
    return { ok: true, data: body?.data as T };
  } catch (e) {
    console.error("[MAYAR] Error:", path, e);
    return { ok: false, error: "Tidak bisa menghubungi Mayar." };
  }
}

export interface MayarInvoiceData {
  id: string;
  transactionId?: string;
  /** Halaman bayar Mayar yang dibuka customer. */
  link: string;
  /** Epoch millis. */
  expiredAt?: number;
}

/**
 * Nomor HP untuk field `mobile` Mayar.
 *
 * Mayar menolak 400 kalau `mobile` lebih dari 15 karakter, dan nomor pesanan tersimpan
 * apa adanya dari checkout (mis. "+62 896-5265-4335" = 17 karakter). Tanpa pembersihan,
 * invoice tidak pernah terbit dan customer hanya melihat "Link pembayaran belum tersedia".
 */
export function mayarMobile(raw?: string | null): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "08000000000";
  const local = digits.startsWith("62") ? `0${digits.slice(2)}` : digits;
  const value = local.slice(0, 15);
  return value || "08000000000";
}

/** Buat invoice (link pembayaran hosted). `extraData.orderNumber` dikembalikan Mayar untuk jejak. */
export async function createMayarInvoice(input: {
  name: string;
  email: string;
  mobile: string;
  amount: number;
  description: string;
  orderNumber: string;
  expiresAt?: string;
  /** Deskripsi baris item di invoice/email Mayar (mis. "SMQ-… — Thobe Jiharkah Series Soft Grey Kain A-02 size L x1"). */
  itemLabel?: string;
}): Promise<MayarResult<MayarInvoiceData>> {
  const amount = Math.round(Number(input.amount) || 0);
  if (amount <= 0) return { ok: false, error: "Nominal invoice harus lebih dari 0." };

  const payload = {
    name: input.name,
    email: input.email,
    mobile: input.mobile,
    description: input.description,
    ...(input.expiresAt ? { expiredAt: input.expiresAt } : {}),
    // Satu baris item dengan `rate` = total pesanan (nominal invoice tidak boleh meleset):
    // nama produk ditempel di deskripsi barisnya supaya ikut tampil di email invoice Mayar.
    items: [{ quantity: 1, rate: amount, description: input.itemLabel || input.description }],
    extraData: { orderNumber: input.orderNumber, source: "samaqu" },
  };

  return mayarFetch<MayarInvoiceData>("/invoices/create", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Detail invoice — dipakai untuk MEMVERIFIKASI status sebelum menandai pesanan lunas. */
export async function getMayarInvoice(
  id: string
): Promise<
  MayarResult<{
    id: string;
    status?: string;
    amount?: number;
    link?: string;
    expiredAt?: number;
    /** id transaksi yang dipakai untuk membaca channel pembayaran. */
    transactionId?: string;
    transactions?: { id?: string }[];
  }>
> {
  return mayarFetch<{
    id: string;
    status?: string;
    amount?: number;
    link?: string;
    expiredAt?: number;
    transactionId?: string;
    transactions?: { id?: string }[];
  }>(`/invoices/${encodeURIComponent(id)}`);
}

/**
 * Link bayar yang MASIH bisa dipakai untuk sebuah pesanan.
 *
 * Dipakai reminder pembayaran: link Mayar kedaluwarsa mengikuti masa berlaku invoice (± 24 jam),
 * jadi sebelum link dikirim kita tanya ulang ke Mayar — kalau invoice sudah lunas, ditutup, atau
 * lewat masa berlaku, fungsi ini mengembalikan null supaya pesan TIDAK memuat link mati.
 */
export async function validMayarPaymentUrl(
  paymentRef?: string | null,
  paymentUrl?: string | null
): Promise<string | null> {
  const link = String(paymentUrl ?? "").trim();
  const ref = String(paymentRef ?? "").trim();
  if (!link || !ref) return null;
  if (!/^https?:\/\/\S+$/i.test(link)) return null;

  const invoice = await getMayarInvoice(ref);
  if (!invoice.ok) return null;

  const status = String(invoice.data?.status ?? "").toLowerCase();
  if (status && status !== "unpaid" && status !== "pending") return null;

  const expiredAt = Number(invoice.data?.expiredAt ?? 0);
  if (expiredAt && expiredAt < Date.now()) return null;

  return link;
}

/** Detail transaksi — jalur verifikasi cadangan kalau webhook hanya membawa transactionId. */
export async function getMayarTransaction(
  id: string
): Promise<
  MayarResult<{
    id: string;
    status?: string;
    amount?: number;
    extraData?: { orderNumber?: string } | null;
    /** Channel yang dipilih customer, mis. "qris", "va/bni", "ewallet/gopay". */
    paymentMethod?: string | null;
  }>
> {
  return mayarFetch<{
    id: string;
    status?: string;
    amount?: number;
    extraData?: { orderNumber?: string } | null;
    paymentMethod?: string | null;
  }>(`/transactions/${encodeURIComponent(id)}`);
}

/**
 * Email pengganti untuk customer yang tidak punya email (mis. guest di Open Order). Mayar
 * mewajibkan `email`, dan format ini tetap valid serta bisa dilacak ke nomor pesanannya.
 */
export function mayarPlaceholderEmail(orderNumber: string): string {
  return `order+${String(orderNumber).toLowerCase().replace(/[^a-z0-9-]/g, "")}@samaqu.id`;
}

/** Link bayar kedaluwarsa mengikuti batas auto-cancel pesanan (24 jam). */
const INVOICE_TTL_MS = 24 * 60 * 60 * 1000;

/** Batas tunggu satu request ke Mayar — supaya checkout & cron tidak menggantung. */
const REQUEST_TIMEOUT_MS = 8000;

/**
 * Keterangan baris item invoice Mayar: nomor pesanan + daftar produk, mis.
 * `SMQ-20261015-144 — Thobe Jiharkah Series Soft Grey Kain A-02 size L x1, Extra Cover & Hanger x1`.
 *
 * Nominal invoice tetap memakai total pesanan (satu baris item), jadi nama produk hanya menempel
 * di keterangan — tidak ada risiko total invoice meleset.
 */
export function mayarItemLabel(
  orderNumber: string,
  items?: { label: string; quantity: number }[]
): string {
  const list = (items ?? [])
    .filter((item) => (item?.label || "").trim())
    .map((item) => `${item.label.trim()} x${item.quantity || 1}`);
  return list.length ? `${orderNumber} — ${list.join(", ")}` : orderNumber;
}

/**
 * Buat invoice Mayar untuk sebuah pesanan LALU simpan linknya ke kolom pembayaran pesanan.
 *
 * Dipanggil dari server saat checkout (website & Open Order) supaya pelanggan **tamu** (tanpa sesi)
 * tetap bisa diarahkan ke halaman bayar — endpoint publik `/api/payments/mayar/create` sengaja
 * tetap memerlukan login, karena itu jalur tombol "Bayar Sekarang" di detail pesanan.
 *
 * Best-effort: mengembalikan link, atau `null` kalau Mayar belum siap / gagal. Tidak pernah throw —
 * kegagalan pembayaran tidak boleh menggagalkan pesanan yang sudah tersimpan.
 */
export async function createOrderPaymentLink(input: {
  orderId: string;
  orderNumber: string;
  customerName?: string | null;
  customerEmail?: string | null;
  customerWhatsapp?: string | null;
  total: number;
  /** Produk yang dipesan — dipakai hanya untuk keterangan baris item di invoice Mayar. */
  items?: { label: string; quantity: number }[];
}): Promise<string | null> {
  try {
    const config = await getMayarConfig();
    if (!mayarReady(config)) return null;

    const amount = Math.round(Number(input.total) || 0);
    if (amount <= 0) return null;

    const invoice = await createMayarInvoice({
      name: input.customerName || "Pelanggan SAMAQU",
      email: input.customerEmail || mayarPlaceholderEmail(input.orderNumber),
      mobile: mayarMobile(input.customerWhatsapp),
      amount,
      description: `SAMAQU ${input.orderNumber}`,
      itemLabel: mayarItemLabel(input.orderNumber, input.items),
      orderNumber: input.orderNumber,
      expiresAt: new Date(Date.now() + INVOICE_TTL_MS).toISOString(),
    });

    if (!invoice.ok || !invoice.data?.link) {
      console.error("[MAYAR] Gagal membuat invoice:", input.orderNumber, invoice.error);
      return null;
    }

    const { error } = await getSupabaseAdmin()
      .from("orders")
      .update({
        payment_provider: "mayar",
        payment_ref: invoice.data.id,
        payment_url: invoice.data.link,
        payment_status: "unpaid",
      })
      .eq("id", input.orderId);
    if (error) {
      console.error("[MAYAR] Gagal menyimpan link pembayaran:", input.orderNumber, error.message);
    }

    return invoice.data.link;
  } catch (e) {
    console.error("[MAYAR] createOrderPaymentLink error:", input.orderNumber, e);
    return null;
  }
}
