/**
 * Notifikasi WhatsApp SAMAQU lewat Fonnte (https://fonnte.com).
 *
 * Fonnte menerima POST ke /send dengan header `Authorization` berisi token mentah
 * (tanpa "Bearer") dan body form-urlencoded. Modul ini server-only karena memakai
 * token rahasia, jadi jangan diimpor dari komponen client.
 *
 * DUA JALUR TERPISAH (diatur admin lewat Pengaturan, disimpan di tabel `fonnte_settings`):
 * - **customer** — token device sendiri, untuk SEMUA pesan ke pembeli;
 * - **admin** — token device sendiri + nomor tujuan, untuk pesan internal.
 * Kalau kolom barunya masih kosong, masing-masing jatuh ke kolom lama `token` lalu ke
 * environment `FONNTE_TOKEN`, supaya notifikasi tidak mendadak berhenti saat transisi.
 * Token dan pengirimannya terpisah: kegagalan satu jalur tidak memengaruhi jalur lain.
 *
 * Prinsip penting: notifikasi adalah efek samping. Kegagalan mengirim pesan tidak boleh
 * menggagalkan checkout, pembayaran, pembatalan, atau pembaruan tracking — semua fungsi di
 * sini menelan error-nya sendiri dan mengembalikan `false` kalau benar-benar tidak terkirim.
 *
 * Semua template pesan ke customer memakai sapaan "Ka <nama depan>" (atau gelar pelanggan
 * kalau namanya diawali gelar, mis. "Ust. Irsan" — lihat `greeting.ts`) dan TANPA emoji.
 */

import { getSupabaseAdmin } from "./supabase-admin";
import { SITE_URL } from "./site-config";
import { formatWhatsAppProductLine } from "./item-label";
import { buildNotifikasi } from "./notifikasi-template";
import { greetingName } from "./greeting";

const FONNTE_ENDPOINT = "https://api.fonnte.com/send";
const REQUEST_TIMEOUT_MS = 8000;

/** Satu device pengirim Fonnte. `enabled` mengikuti saklar global di pengaturan. */
export interface FonnteChannel {
  enabled: boolean;
  token: string;
}

export interface FonnteConfigs {
  /** Semua pesan ke pembeli. */
  customer: FonnteChannel & { senderNumber: string };
  /** Semua pesan internal. */
  admin: FonnteChannel & { adminNumber: string };
}

/** Bentuk lama (satu token untuk dua-duanya) — masih dipakai modul chat internal. */
export interface FonnteConfig {
  enabled: boolean;
  token: string;
  adminNumber: string;
}

/** "0812…", "+62 812…", "812…" → "62812…" (format nomor yang diterima Fonnte). */
export function normalizeWhatsappTarget(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("8")) return `62${digits}`;
  return digits;
}

interface SettingsRow {
  enabled: boolean;
  legacyToken: string;
  customerToken: string;
  customerNumber: string;
  adminToken: string;
  adminNumber: string;
}

function envDefaults(): SettingsRow {
  const legacy = process.env.FONNTE_TOKEN || "";
  return {
    enabled: true,
    legacyToken: legacy,
    customerToken: "",
    customerNumber: "",
    adminToken: "",
    adminNumber: process.env.ADMIN_WHATSAPP_NUMBER || "",
  };
}

/**
 * Baris `fonnte_settings` (satu baris, id = 1). Tabel ini tanpa policy RLS, jadi hanya service
 * role yang bisa membacanya. Mengembalikan null kalau tabelnya belum dibuat
 * (jalankan supabase/fonnte-settings.sql).
 */
async function dbSettings(): Promise<SettingsRow | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("fonnte_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (error || !data) return null;

    const row = data as Record<string, unknown>;
    return {
      enabled: row.enabled !== false,
      legacyToken: (row.token as string) || "",
      customerToken: (row.customer_token as string) || "",
      customerNumber: (row.customer_number as string) || "",
      adminToken: (row.admin_token as string) || "",
      adminNumber: (row.admin_number as string) || "",
    };
  } catch (e) {
    console.error("[FONNTE] Gagal membaca fonnte_settings, pakai environment variable:", e);
    return null;
  }
}

let cached: { configs: FonnteConfigs; ts: number } | null = null;
const CACHE_TTL_MS = 60_000;

/** Dipanggil setelah admin menyimpan pengaturan supaya nilai baru langsung dipakai. */
export function clearFonnteConfigCache() {
  cached = null;
}

/**
 * Konfigurasi aktif kedua jalur. Urutan prioritas token: kolom khusus (customer/admin) →
 * kolom lama `token` → environment `FONNTE_TOKEN`.
 */
export async function getFonnteConfigs(): Promise<FonnteConfigs> {
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.configs;

  const fromEnv = envDefaults();
  const row = (await dbSettings()) ?? fromEnv;
  const fallbackToken = row.legacyToken || fromEnv.legacyToken;

  const configs: FonnteConfigs = {
    customer: {
      enabled: row.enabled !== false,
      token: row.customerToken || fallbackToken,
      senderNumber: row.customerNumber || fromEnv.customerNumber,
    },
    admin: {
      enabled: row.enabled !== false,
      token: row.adminToken || fallbackToken,
      adminNumber: row.adminNumber || fromEnv.adminNumber,
    },
  };

  cached = { configs, ts: Date.now() };
  return configs;
}

/** Bentuk lama — dipakai modul chat internal. Setara dengan jalur admin. */
export async function getFonnteConfig(): Promise<FonnteConfig> {
  const configs = await getFonnteConfigs();
  return {
    enabled: configs.admin.enabled,
    token: configs.admin.token || configs.customer.token,
    adminNumber: configs.admin.adminNumber,
  };
}

/**
 * Nomor admin penerima notifikasi: nomor dari pengaturan admin (boleh beberapa, dipisah
 * koma) → kalau kosong, jatuh ke nomor toko di `store_settings.whatsapp`.
 */
export async function resolveAdminTargets(configuredNumber?: string): Promise<string> {
  const fromConfig = (configuredNumber || "")
    .split(",")
    .map(normalizeWhatsappTarget)
    .filter(Boolean);
  if (fromConfig.length) return fromConfig.join(",");

  try {
    const { data } = await getSupabaseAdmin()
      .from("store_settings")
      .select("whatsapp")
      .eq("id", 1)
      .maybeSingle();
    return normalizeWhatsappTarget((data?.whatsapp as string) || "");
  } catch {
    return "";
  }
}

/**
 * Kirim satu pesan via Fonnte. `countryCode` "62" membuat Fonnte ikut menormalkan nomor
 * lokal Indonesia. Mengembalikan false kalau token/target kosong atau Fonnte menolak.
 */
export async function sendFonnteMessage(
  token: string,
  target: string,
  message: string
): Promise<boolean> {
  if (!token || !target) return false;

  try {
    const response = await fetch(FONNTE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ target, message, countryCode: "62" }).toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const result = (await response.json().catch(() => null)) as
      | { status?: boolean; reason?: string }
      | null;

    if (!response.ok || result?.status === false) {
      console.error("[FONNTE] Gagal mengirim pesan:", result?.reason || response.status);
      return false;
    }

    console.log("[FONNTE] Notifikasi terkirim ke", target);
    return true;
  } catch (error) {
    console.error("[FONNTE] Error saat mengirim pesan:", error);
    return false;
  }
}

function rupiah(value: number): string {
  return `Rp ${Math.round(Number(value) || 0).toLocaleString("id-ID")}`;
}

function safeName(name?: string | null): string {
  return String(name ?? "").trim() || "Pelanggan";
}

/** Baris produk WA tanpa harga — satu baris per item, diawali "- ". */
function whatsAppItemLines(items: NewOrderNotificationItem[]): string {
  return (items || [])
    .map((item) => formatWhatsAppProductLine(item))
    .filter(Boolean)
    .map((line) => `- ${line}`)
    .join("\n");
}

/** Baris produk WA dengan total per baris (admin & invoice). */
function whatsAppItemLinesWithPrice(items: NewOrderNotificationItem[]): string {
  return (items || [])
    .map((item) => {
      const line = formatWhatsAppProductLine(item);
      if (!line) return "";
      return `- ${line} — ${rupiah((Number(item.price) || 0) * (Number(item.quantity) || 1))}`;
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * Blok "Produk:" untuk pesan customer. Satu item tetap satu baris ("Produk: … x1");
 * beberapa item jadi daftar "- …" di bawah label.
 */
function productSection(items: NewOrderNotificationItem[]): string[] {
  const lines = (items || []).map((item) => formatWhatsAppProductLine(item)).filter(Boolean);
  if (lines.length === 0) return ["Produk: -"];
  if (lines.length === 1) return [`Produk: ${lines[0]}`];
  return ["Produk:", ...lines.map((line) => `- ${line}`)];
}

/* ══════════════════════════════════════════
   Notifikasi ke ADMIN (token device admin)
   ══════════════════════════════════════════ */

export interface NewOrderNotificationItem {
  name: string;
  /** Series dari `order_items.series` (mis. "Jiharkah"). */
  series?: string | null;
  /** Kode kain dari `order_items.kain` (mis. "A-02"). */
  kain?: string | null;
  color?: string | null;
  size?: string | null;
  quantity: number;
  price: number;
  category?: string | null;
}

export interface NewOrderNotification {
  orderNumber: string;
  customerName: string;
  customerWhatsapp: string;
  total: number;
  paymentType: string;
  items: NewOrderNotificationItem[];
  shippingCity?: string | null;
  notes?: string | null;
  /** Asal pesanan (mis. "Open Order (Create Your Price)") — hanya ditampilkan kalau diisi. */
  source?: string | null;
}

/** Ringkasan pesanan untuk admin — nomor pesanan, pemesan, item, dan tautan kelola. */
export function buildNewOrderMessage(order: NewOrderNotification): string {
  const itemLines = whatsAppItemLinesWithPrice(order.items);

  const lines = [
    "\u{1F514} *PESANAN BARU \u2014 SAMAQU*",
    "",
    `No. Pesanan: ${order.orderNumber}`,
    `Nama: ${order.customerName}`,
    `WhatsApp: ${order.customerWhatsapp}`,
    `Pembayaran: ${order.paymentType}`,
    `Total: ${rupiah(order.total)}`,
    "",
    "Item:",
    itemLines,
  ];

  if (order.shippingCity) lines.push("", `Tujuan: ${order.shippingCity}`);
  if (order.source) lines.push(`Sumber: ${order.source}`);
  if (order.notes) lines.push(`Catatan: ${order.notes}`);

  lines.push("", `Kelola pesanan: ${SITE_URL}/admin?panel=orders`);
  return lines.join("\n");
}

export interface AdminOrderCancelledNotification {
  orderNumber: string;
  customerName?: string | null;
  reason: string;
}

/** Pemberitahuan pembatalan untuk admin. */
export function buildAdminOrderCancelledMessage(order: AdminOrderCancelledNotification): string {
  return [
    "PEMBATALAN PESANAN SAMAQU",
    "",
    `Nomor Pesanan: ${order.orderNumber}`,
    `Customer: ${safeName(order.customerName)}`,
    `Alasan Pembatalan: ${order.reason}`,
    "",
    "Status: Pesanan berhasil dibatalkan.",
  ].join("\n");
}

/**
 * Kirim notifikasi pesanan baru ke admin. Dilewati diam-diam kalau token/nomor belum ada atau
 * notifikasi dimatikan. Semua error ditelan di sini supaya alur checkout tetap aman.
 */
export async function notifyAdminNewOrder(order: NewOrderNotification): Promise<boolean> {
  const { admin } = await getFonnteConfigs();
  if (!admin.enabled || !admin.token) return false;

  const target = await resolveAdminTargets(admin.adminNumber);
  if (!target) {
    console.warn(
      "[FONNTE] Tidak ada nomor admin. Isi lewat Pengaturan admin atau environment variable."
    );
    return false;
  }

  return sendFonnteMessage(
    admin.token,
    target,
    await buildNotifikasi("pesanan-baru-admin", buildNewOrderMessage(order), {
      nama: order.customerName,
      nomor: order.orderNumber,
      wa: order.customerWhatsapp,
      pembayaran: order.paymentType,
      total: rupiah(order.total),
      daftar_produk: whatsAppItemLinesWithPrice(order.items),
      info_tambahan: [
        order.shippingCity ? `Tujuan: ${order.shippingCity}` : "",
        order.source ? `Sumber: ${order.source}` : "",
        order.notes ? `Catatan: ${order.notes}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      tautan_admin: `${SITE_URL}/admin?panel=orders`,
    }),
  );
}

/** Kabari admin bahwa sebuah pesanan dibatalkan. */
export async function notifyAdminOrderCancelled(
  order: AdminOrderCancelledNotification
): Promise<boolean> {
  const { admin } = await getFonnteConfigs();
  if (!admin.enabled || !admin.token) return false;

  const target = await resolveAdminTargets(admin.adminNumber);
  if (!target) return false;

  return sendFonnteMessage(
    admin.token,
    target,
    await buildNotifikasi("pesanan-dibatalkan-admin", buildAdminOrderCancelledMessage(order), {
      nomor: order.orderNumber,
      nama: String(order.customerName || ""),
      alasan: order.reason,
    }),
  );
}

/* ══════════════════════════════════════════
   Notifikasi ke CUSTOMER (token device customer)
   ══════════════════════════════════════════ */

/**
 * Ringkasan metode pembayaran untuk pesan customer — bentuk struktural dari baris
 * `payment_methods` (dikelola dari dashboard admin), sengaja tidak mengimpor tipe client-nya.
 */
export interface PaymentInstruction {
  label: string;
  /** `bank` | `qris` | `ewallet` | `cod` | `mayar` | `other` */
  type: string;
  bankName?: string | null;
  accountName?: string | null;
  accountNumber?: string | null;
  accountInfo?: string | null;
  instructions?: string | null;
}

export interface CustomerOrderNotification {
  orderNumber: string;
  customerName: string;
  customerWhatsapp: string;
  items: NewOrderNotificationItem[];
  total: number;
  paymentMethod?: PaymentInstruction | null;
  isOpenOrder?: boolean;
  /** Link pembayaran online — HANYA diisi kalau invoice benar-benar berhasil dibuat. */
  paymentUrl?: string | null;
}

export interface OrderPaidNotification {
  orderNumber: string;
  customerName: string;
  customerWhatsapp: string;
  total: number;
}

export interface ShippedNotification {
  orderNumber: string;
  customerName: string;
  customerWhatsapp: string;
  /** Nomor resi J&T yang tersimpan di pesanan (kolom `orders.awb_no`). */
  awbNo: string;
}

export interface DeliveredNotification {
  orderNumber: string;
  customerName: string;
  customerWhatsapp: string;
}

export interface PaymentReminderNotification {
  orderNumber: string;
  customerName: string;
  customerWhatsapp: string;
  total: number;
  paymentMethod?: PaymentInstruction | null;
  /** Link pembayaran online yang SUDAH diverifikasi masih berlaku. */
  paymentUrl?: string | null;
}

export interface OrderCancelledNotification {
  orderNumber: string;
  customerName: string;
  customerWhatsapp: string;
  reason: string;
  /** Baris refund — hanya diisi kalau informasinya benar-benar tersedia. */
  refundInfo?: string | null;
}

/** Jenis metode pembayaran yang dikenali pesan (selain ini dianggap transfer bank). */
const KNOWN_METHOD_TYPES = ["qris", "ewallet", "cod", "other", "mayar"];

/**
 * Baris tabel `payment_methods` → struktur instruksi pembayaran untuk pesan customer.
 * Satu sumber untuk checkout website maupun Open Order supaya instruksinya tidak beda.
 */
export function paymentInstructionFrom(row: {
  label?: string | null;
  method_type?: string | null;
  bank_name?: string | null;
  account_name?: string | null;
  account_number?: string | null;
  account_info?: string | null;
  instructions?: string | null;
}): PaymentInstruction {
  const rawType = row.method_type ?? "";
  const type = KNOWN_METHOD_TYPES.includes(rawType) ? rawType : "bank";
  const label =
    row.label?.trim() || (row.bank_name ? `Transfer Bank (${row.bank_name})` : "Transfer Bank");

  return {
    label,
    type,
    bankName: row.bank_name ?? null,
    accountName: row.account_name ?? null,
    accountNumber: row.account_number ?? null,
    accountInfo: row.account_info ?? null,
    instructions: row.instructions ?? null,
  };
}

/** Link http(s) yang benar-benar bisa dipakai (bukan string kosong/palsu). */
function usablePaymentUrl(url?: string | null): string | null {
  const value = String(url ?? "").trim();
  if (!value) return null;
  return /^https?:\/\/\S+$/i.test(value) ? value : null;
}

/**
 * Blok instruksi pembayaran sesuai metode: transfer bank, pembayaran online (Mayar),
 * QRIS/e-wallet, atau COD (tanpa permintaan transfer).
 */
function paymentInstructionBlock(
  payment?: PaymentInstruction | null,
  paymentUrl?: string | null
): string[] {
  const type = payment?.type || "bank";

  if (type === "cod") {
    return [
      "Pesanan Ka akan diproses sesuai prosedur Bayar di Tempat (COD). Pembayaran dilakukan saat paket diterima, jadi tidak perlu transfer sekarang.",
    ];
  }

  if (type === "mayar") {
    const link = usablePaymentUrl(paymentUrl);
    if (!link) {
      // Invoice gagal dibuat: jangan pernah menampilkan link kosong atau link pesanan lain.
      return [
        "Link pembayaran belum tersedia. Silakan hubungi admin untuk mendapatkan link pembayaran.",
      ];
    }
    return ["Link Pembayaran:", link, "", "Silakan selesaikan pembayaran melalui link di atas."];
  }

  if (type === "qris") {
    return ["Silakan scan QRIS pembayaran (admin kirim QR-nya di chat ini)."];
  }

  const bankName = (payment?.bankName || payment?.label || "").trim();
  const accountNumber = (payment?.accountNumber || "").trim();
  const accountName = (payment?.accountName || "").trim();

  if (type === "ewallet") {
    const lines = [`Silakan kirim ke${payment?.label ? ` ${payment.label}` : " e-wallet"}:`];
    if (payment?.accountInfo) lines.push(payment.accountInfo);
    else if (accountNumber) lines.push(accountNumber);
    lines.push("", "Setelah transfer, silakan kirim bukti pembayaran kepada admin.");
    return lines;
  }

  // Transfer bank (default)
  if (!accountNumber) {
    const lines = ["Silakan hubungi admin untuk informasi rekening pembayaran."];
    if (payment?.instructions) lines.push(payment.instructions);
    return lines;
  }

  const lines = ["Silakan transfer ke rekening berikut:"];
  if (bankName) lines.push(bankName);
  lines.push(`Nomor Rekening: ${accountNumber}`);
  if (accountName) lines.push(`Atas Nama: ${accountName}`);
  if (payment?.accountInfo) lines.push(payment.accountInfo);
  lines.push("", "Setelah transfer, silakan kirim bukti pembayaran kepada admin.");
  return lines;
}

/** Pesan "pesanan sudah kami terima" + ringkasan produk + instruksi pembayaran. */
export function buildCustomerOrderMessage(order: CustomerOrderNotification): string {
  const type = order.paymentMethod?.type || "bank";
  const isCod = type === "cod";
  const ka = greetingName(order.customerName);

  const lines: string[] = [
    `Halo ${ka},`,
    "",
    "Terima kasih telah berbelanja di SAMAQU.",
    "",
    `Pesanan ${ka} sudah berhasil kami terima.`,
    "",
    `Nomor Pesanan: ${order.orderNumber}`,
    ...productSection(order.items),
    `Total Pembayaran: ${rupiah(order.total)}`,
    "",
    ...paymentInstructionBlock(order.paymentMethod, order.paymentUrl),
  ];

  // COD tidak butuh transfer, jadi tidak ada ajakan menyelesaikan pembayaran.
  if (!isCod) {
    lines.push(
      "",
      `Silakan selesaikan pembayaran sesuai instruksi di atas agar pesanan ${ka} dapat segera kami proses.`,
    );
  }

  lines.push("", "Terima kasih telah memilih SAMAQU.");
  return lines.join("\n");
}

/** Pesan "pembayaran sudah kami terima dan diverifikasi". */
export function buildOrderPaidMessage(order: OrderPaidNotification): string {
  const ka = greetingName(order.customerName);
  return [
    `Halo ${ka},`,
    "",
    `Pembayaran untuk pesanan ${ka} telah kami terima dan berhasil diverifikasi.`,
    "",
    `Nomor Pesanan: ${order.orderNumber}`,
    `Total Pembayaran: ${rupiah(order.total)}`,
    "",
    `Pesanan ${ka} akan segera kami proses. Kami akan mengirimkan informasi nomor resi setelah pesanan dikirim.`,
    "",
    "Terima kasih telah berbelanja di SAMAQU.",
  ].join("\n");
}

/**
 * Link publik Cek Resi untuk pesan WA. Fonnte tidak menyediakan tombol interaktif yang
 * reliable (fitur button-nya deprecated), jadi link ini yang bisa langsung diketuk pembeli.
 * Placeholder `{resi}` dibiarkan utuh supaya editor template di panel admin tetap valid.
 */
function trackingUrl(awb: string): string {
  const safe = encodeURIComponent(String(awb ?? "")).replace(/%7B/gi, "{").replace(/%7D/gi, "}");
  return `${SITE_URL}/cek-resi?awb=${safe}`;
}

/** Pesan "pesanan sudah dikirim lewat J&T Express" + nomor resi. */
export function buildOrderShippedMessage(order: ShippedNotification): string {
  const ka = greetingName(order.customerName);
  return [
    `Halo ${ka},`,
    "",
    `Pesanan ${ka} telah dikirim melalui J&T Express.`,
    "",
    `Nomor Pesanan: ${order.orderNumber}`,
    `Nomor Resi: ${order.awbNo}`,
    "",
    `Silakan gunakan nomor resi tersebut untuk memantau perjalanan paket ${ka}.`,
    "",
    `Lacak resi: ${trackingUrl(order.awbNo)}`,
    "",
    `Terima kasih telah mempercayakan kebutuhan ${ka} kepada SAMAQU.`,
  ].join("\n");
}

/** Pesan "paket sudah diterima" (dari status delivered J&T yang valid). */
export function buildOrderDeliveredMessage(order: DeliveredNotification): string {
  // Sapaan + sebutan pelanggan di badan pesan selalu "Ka <nama>" (mis. "Halo Ka Lea," lalu
  // "paket pesanan Ka Lea telah diterima").
  const ka = greetingName(order.customerName);
  return [
    `Halo ${ka},`,
    "",
    `Berdasarkan informasi pengiriman J&T Express, paket pesanan ${ka} telah diterima.`,
    "",
    `Nomor Pesanan: ${order.orderNumber}`,
    "",
    `Semoga produk yang ${ka} terima sesuai dengan harapan dan bermanfaat.`,
    "",
    "Terima kasih telah berbelanja di SAMAQU. Kami menghargai kepercayaan Ka kepada kami.",
  ].join("\n");
}

/** Pesan pengingat pembayaran (maksimal sekali per pesanan). */
export function buildPaymentReminderMessage(order: PaymentReminderNotification): string {
  const ka = greetingName(order.customerName);
  return [
    `Halo ${ka},`,
    "",
    `Kami ingin mengingatkan bahwa pesanan ${ka} masih menunggu pembayaran.`,
    "",
    `Nomor Pesanan: ${order.orderNumber}`,
    `Total Pembayaran: ${rupiah(order.total)}`,
    "",
    ...paymentInstructionBlock(order.paymentMethod, order.paymentUrl),
    "",
    `Silakan selesaikan pembayaran apabila ${ka} masih ingin melanjutkan pesanan tersebut.`,
    "",
    "Jika pembayaran telah dilakukan, pesan ini dapat diabaikan.",
    "",
    "Terima kasih,",
    "SAMAQU",
  ].join("\n");
}

/** Pesan pemberitahuan pembatalan untuk customer. */
export function buildOrderCancelledMessage(order: OrderCancelledNotification): string {
  const ka = greetingName(order.customerName);
  const lines = [
    `Halo ${ka},`,
    "",
    `Kami informasikan bahwa pesanan ${ka} telah dibatalkan.`,
    "",
    `Nomor Pesanan: ${order.orderNumber}`,
    `Alasan Pembatalan: ${order.reason}`,
  ];

  // Refund hanya disebut kalau informasinya memang tersedia (tidak menjanjikan apa pun).
  const refund = String(order.refundInfo ?? "").trim();
  if (refund) lines.push("", refund);

  lines.push(
    "",
    "Mohon maaf atas ketidaknyamanan yang terjadi. Terima kasih atas pengertian Ka.",
    "",
    "SAMAQU"
  );
  return lines.join("\n");
}

/** Kirim satu pesan ke customer memakai token jalur customer. Tidak pernah melempar error. */
async function sendToCustomer(
  customerWhatsapp: string | null | undefined,
  message: string
): Promise<boolean> {
  const { customer } = await getFonnteConfigs();
  if (!customer.enabled || !customer.token) return false;

  const target = normalizeWhatsappTarget(String(customerWhatsapp ?? ""));
  if (!target) return false;

  return sendFonnteMessage(customer.token, target, message);
}

/**
 * Kode OTP reset password ke WhatsApp customer.
 *
 * Sengaja TIDAK lewat `buildNotifikasi`: teks OTP tidak boleh bisa diubah dari panel admin,
 * karena salah edit bisa menghilangkan kodenya. Memakai jalur customer (device Lite) supaya
 * tidak ber-watermark.
 */
export async function notifyCustomerPasswordResetOtp(
  customerWhatsapp: string | null | undefined,
  code: string
): Promise<boolean> {
  const { customer } = await getFonnteConfigs();
  if (!customer.enabled || !customer.token) return false;

  const target = normalizeWhatsappTarget(String(customerWhatsapp ?? ""));
  if (!target) return false;

  const message = [
    "SAMAQU",
    "",
    `Kode verifikasi kamu: ${code}`,
    "Berlaku 5 menit.",
    "",
    "Jangan bagikan kode ini ke siapa pun, termasuk admin SAMAQU.",
    "",
    "Bukan kamu? Abaikan pesan ini.",
  ].join("\n");

  return sendFonnteMessage(customer.token, target, message);
}

export async function notifyCustomerOrderCreated(
  order: CustomerOrderNotification
): Promise<boolean> {
  return sendToCustomer(
    order.customerWhatsapp,
    await buildNotifikasi("pesanan-diterima", buildCustomerOrderMessage(order), {
      nama: greetingName(order.customerName),
      nomor: order.orderNumber,
      wa: order.customerWhatsapp,
      total: rupiah(order.total),
      daftar_produk: whatsAppItemLines(order.items),
      instruksi_pembayaran: paymentInstructionBlock(order.paymentMethod, order.paymentUrl).join("\n"),
    }),
  );
}

export async function notifyCustomerOrderPaid(order: OrderPaidNotification): Promise<boolean> {
  return sendToCustomer(
    order.customerWhatsapp,
    await buildNotifikasi("pembayaran-diterima", buildOrderPaidMessage(order), {
      nama: greetingName(order.customerName),
      nomor: order.orderNumber,
      total: rupiah(order.total),
    }),
  );
}

export async function notifyCustomerOrderShipped(order: ShippedNotification): Promise<boolean> {
  const link = trackingUrl(order.awbNo);
  const message = await buildNotifikasi("pesanan-dikirim", buildOrderShippedMessage(order), {
    nama: greetingName(order.customerName),
    nomor: order.orderNumber,
    resi: order.awbNo,
  });
  // Template custom dari admin mungkin belum memuat link. Pastikan pembeli selalu punya
  // jalan untuk membuka Cek Resi, tanpa menggandakan link kalau template sudah memuatnya.
  const finalMessage = message.includes(link) ? message : `${message}\n\nLacak resi: ${link}`;
  return sendToCustomer(order.customerWhatsapp, finalMessage);
}

export async function notifyCustomerOrderDelivered(order: DeliveredNotification): Promise<boolean> {
  return sendToCustomer(
    order.customerWhatsapp,
    await buildNotifikasi("pesanan-sampai", buildOrderDeliveredMessage(order), {
      nama: greetingName(order.customerName),
      nomor: order.orderNumber,
    }),
  );
}

export async function notifyCustomerPaymentReminder(
  order: PaymentReminderNotification
): Promise<boolean> {
  return sendToCustomer(
    order.customerWhatsapp,
    await buildNotifikasi("pengingat-bayar", buildPaymentReminderMessage(order), {
      nama: greetingName(order.customerName),
      nomor: order.orderNumber,
      total: rupiah(order.total),
      instruksi_pembayaran: paymentInstructionBlock(order.paymentMethod, order.paymentUrl).join("\n"),
    }),
  );
}

export async function notifyCustomerOrderCancelled(
  order: OrderCancelledNotification
): Promise<boolean> {
  return sendToCustomer(
    order.customerWhatsapp,
    await buildNotifikasi("pesanan-dibatalkan-pembeli", buildOrderCancelledMessage(order), {
      nama: greetingName(order.customerName),
      nomor: order.orderNumber,
      alasan: order.reason,
      info_refund: String(order.refundInfo || ""),
    }),
  );
}

/* ── Invoice transaksi manual ("Belum Lunas") ── */

/** Batas waktu pembayaran yang disebut di invoice. */
export const INVOICE_DUE_HOURS = 3;

/** Item invoice = item notifikasi order (`series`/`kain` sudah ada di tipe dasar). */
export type InvoiceItem = NewOrderNotificationItem;

export interface InvoiceNotification {
  orderNumber: string;
  customerName?: string | null;
  customerWhatsapp?: string | null;
  items: InvoiceItem[];
  subtotal: number;
  discount?: number | null;
  shippingCost?: number | null;
  total: number;
  /** false = belum lunas → invoice memuat nomor rekening + batas waktu pembayaran. */
  paid: boolean;
  hours?: number | null;
}

/** Rupiah rapat tanpa spasi, mengikuti contoh invoice: "Rp389.000". */
function rupiahRapat(value: number): string {
  return `Rp${Math.round(Number(value) || 0).toLocaleString("id-ID")}`;
}

/** Satu baris item invoice: "Thobe … size L x1 — Rp389.000". */
function invoiceItemLine(item: InvoiceItem): string {
  const lineTotal = (Number(item.price) || 0) * (Number(item.quantity) || 1);
  return `- ${formatWhatsAppProductLine(item)} — ${rupiahRapat(lineTotal)}`;
}

/**
 * Invoice satu pesanan untuk pembeli. Belum lunas → memuat daftar rekening aktif dari
 * Pengaturan (tabel `payment_methods`) + batas waktu transfer; lunas → cukup nota.
 */
export function buildInvoiceMessage(invoice: InvoiceNotification, banks: PaymentInstruction[] = []): string {
  const ka = greetingName(invoice.customerName);
  const lines: string[] = [
    "🧾 *INVOICE SAMAQU*",
    `No. ${invoice.orderNumber}`,
    "",
    `Halo ${ka},`,
    "",
    "Berikut rincian pesanan Ka di SAMAQU:",
    "",
    ...invoice.items.map((item) => invoiceItemLine(item)),
    "",
    `Subtotal: ${rupiahRapat(invoice.subtotal)}`,
  ];
  if ((invoice.shippingCost ?? 0) > 0) lines.push(`Ongkir: ${rupiahRapat(Number(invoice.shippingCost))}`);
  if ((invoice.discount ?? 0) > 0) lines.push(`Diskon: -${rupiahRapat(Number(invoice.discount))}`);
  lines.push(`*TOTAL: ${rupiahRapat(invoice.total)}*`, "", `Status: *${invoice.paid ? "LUNAS" : "Belum Lunas"}*`);

  if (!invoice.paid) {
    for (const bank of banks) {
      const namaBank = (bank.bankName || bank.label || "Transfer Bank").toUpperCase();
      lines.push("", `*Pembayaran ${namaBank}*`);
      if (bank.accountNumber) lines.push(bank.accountNumber);
      if (bank.accountName) lines.push(`a.n. ${bank.accountName}`);
      if (bank.accountInfo) lines.push(bank.accountInfo);
    }
    const jam = Number(invoice.hours) > 0 ? Number(invoice.hours) : INVOICE_DUE_HOURS;
    lines.push(
      "",
      `Mohon lakukan pembayaran maksimal ${jam} jam setelah invoice diterima ya, Ka. Jika sudah transfer, kirim bukti pembayarannya ke chat ini untuk kami verifikasi.`,
    );
  }

  lines.push("", "Terima kasih sudah berbelanja di SAMAQU.");
  return lines.join("\n");
}

/** Rekening bank aktif dari Pengaturan → Payment Methods (satu baris = satu rekening). */
async function activeBankInstructions(): Promise<PaymentInstruction[]> {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("payment_methods")
      .select("label, method_type, bank_name, account_name, account_number, account_info, instructions, is_active, display_order")
      .eq("is_active", true)
      .order("display_order");
    if (error) {
      console.error("[FONNTE] Gagal membaca payment_methods:", error.message);
      return [];
    }
    return (data || []).map((row) => paymentInstructionFrom(row)).filter((item) => item.type === "bank");
  } catch (error) {
    console.error("[FONNTE] Gagal menyiapkan rekening invoice:", error);
    return [];
  }
}

/** Kirim invoice ke WA pembeli. Tidak pernah melempar error (kontrak modul ini). */
export async function notifyCustomerInvoice(invoice: InvoiceNotification): Promise<boolean> {
  const banks = invoice.paid ? [] : await activeBankInstructions();
  const bawaan = buildInvoiceMessage(invoice, banks);
  return sendToCustomer(
    invoice.customerWhatsapp,
    await buildNotifikasi("invoice-belum-lunas", bawaan, {
      nama: greetingName(invoice.customerName),
      nomor: invoice.orderNumber,
      daftar_produk: invoice.items.map(invoiceItemLine).join("\n"),
      subtotal: rupiahRapat(invoice.subtotal),
      ongkir: rupiahRapat(Number(invoice.shippingCost) || 0),
      diskon: rupiahRapat(Number(invoice.discount) || 0),
      total: rupiahRapat(invoice.total),
      status: invoice.paid ? "LUNAS" : "Belum Lunas",
      blok_rekening: banks
        .map((bank) =>
          [
            `*Pembayaran ${(bank.bankName || bank.label || "Transfer Bank").toUpperCase()}*`,
            bank.accountNumber || "",
            bank.accountName ? `a.n. ${bank.accountName}` : "",
            bank.accountInfo || "",
          ]
            .filter(Boolean)
            .join("\n"),
        )
        .join("\n\n"),
    }),
  );
}

/* ── Template mentah (placeholder) untuk editor di panel Pengaturan ── */

/** Nilai placeholder yang dipakai sebagai "data" saat menyusun template mentah. */
function tpl(nama: string): string {
  return `{${nama}}`;
}

/** Ganti nilai contoh dengan penandanya (nilai terpanjang lebih dulu supaya tidak saling menimpa). */
function gantiDenganPenanda(teks: string, peta: Record<string, string>): string {
  let hasil = teks;
  for (const [nilai, penanda] of Object.entries(peta).sort((a, b) => b[0].length - a[0].length)) {
    if (!nilai) continue;
    hasil = hasil.split(nilai).join(penanda);
  }
  return hasil;
}

const blokRekening = (bank: PaymentInstruction): string =>
  [
    `*Pembayaran ${(bank.bankName || bank.label || "Transfer Bank").toUpperCase()}*`,
    bank.accountNumber || "",
    bank.accountName ? `a.n. ${bank.accountName}` : "",
    bank.accountInfo || "",
  ]
    .filter(Boolean)
    .join("\n");

/**
 * Template MENTAH (placeholder, bukan data contoh) untuk tiap notifikasi — dipakai panel
 * Pengaturan sebagai isi awal editor. Disusun dari penyusun pesan yang SAMA dengan yang
 * mengirim, jadi teks dan penandanya tidak mungkin beda dengan yang benar-benar dikirim.
 */
export function templateBawaanNotifikasi(): Record<string, string> {
  const p = tpl;
  const hasil: Record<string, string> = {};

  const pesananAdmin = buildNewOrderMessage({
    orderNumber: p("nomor"),
    customerName: p("nama"),
    customerWhatsapp: p("wa"),
    total: 567000,
    paymentType: p("pembayaran"),
    items: SAMPEL_ITEM,
    shippingCity: "MANGGALA, KOTA MAKASSAR",
    source: "Website",
  });
  hasil["pesanan-baru-admin"] = gantiDenganPenanda(pesananAdmin, {
    [whatsAppItemLinesWithPrice(SAMPEL_ITEM)]: p("daftar_produk"),
    ["Tujuan: MANGGALA, KOTA MAKASSAR\nSumber: Website"]: p("info_tambahan"),
    [`${SITE_URL}/admin?panel=orders`]: p("tautan_admin"),
    [rupiah(567000)]: p("total"),
  });

  const diterima = buildCustomerOrderMessage({
    orderNumber: p("nomor"),
    customerName: p("nama"),
    customerWhatsapp: p("wa"),
    items: SAMPEL_ITEM,
    total: 567000,
    paymentMethod: SAMPEL_BANK,
  });
  hasil["pesanan-diterima"] = gantiDenganPenanda(diterima, {
    [whatsAppItemLines(SAMPEL_ITEM)]: p("daftar_produk"),
    [paymentInstructionBlock(SAMPEL_BANK, null).join("\n")]: p("instruksi_pembayaran"),
    [rupiah(567000)]: p("total"),
  });

  const invoice = buildInvoiceMessage(
    {
      orderNumber: p("nomor"),
      customerName: p("nama"),
      customerWhatsapp: p("wa"),
      items: SAMPEL_ITEM,
      subtotal: 567000,
      discount: 0,
      shippingCost: 22000,
      total: 589000,
      paid: false,
    },
    [SAMPEL_BANK],
  );
  hasil["invoice-belum-lunas"] = gantiDenganPenanda(invoice, {
    [SAMPEL_ITEM.map(invoiceItemLine).join("\n")]: p("daftar_produk"),
    [blokRekening(SAMPEL_BANK)]: p("blok_rekening"),
    [rupiahRapat(567000)]: p("subtotal"),
    [rupiahRapat(22000)]: p("ongkir"),
    [rupiahRapat(589000)]: p("total"),
    ["Belum Lunas"]: p("status"),
  });

  const dibayar = buildOrderPaidMessage({
    orderNumber: p("nomor"),
    customerName: p("nama"),
    customerWhatsapp: p("wa"),
    total: 589000,
  });
  hasil["pembayaran-diterima"] = gantiDenganPenanda(dibayar, {
    [rupiah(589000)]: p("total"),
  });

  const reminder = buildPaymentReminderMessage({
    orderNumber: p("nomor"),
    customerName: p("nama"),
    customerWhatsapp: p("wa"),
    total: 338000,
    paymentMethod: SAMPEL_BANK,
  });
  hasil["pengingat-bayar"] = gantiDenganPenanda(reminder, {
    [paymentInstructionBlock(SAMPEL_BANK, null).join("\n")]: p("instruksi_pembayaran"),
    [rupiah(338000)]: p("total"),
  });

  const dikirim = buildOrderShippedMessage({
    orderNumber: p("nomor"),
    customerName: p("nama"),
    customerWhatsapp: p("wa"),
    awbNo: p("resi"),
  });
  hasil["pesanan-dikirim"] = dikirim;

  hasil["pesanan-sampai"] = buildOrderDeliveredMessage({
    orderNumber: p("nomor"),
    customerName: p("nama"),
    customerWhatsapp: p("wa"),
  });

  hasil["pesanan-dibatalkan-pembeli"] = buildOrderCancelledMessage({
    orderNumber: p("nomor"),
    customerName: p("nama"),
    customerWhatsapp: p("wa"),
    reason: p("alasan"),
  });

  hasil["pesanan-dibatalkan-admin"] = buildAdminOrderCancelledMessage({
    orderNumber: p("nomor"),
    customerName: p("nama"),
    reason: p("alasan"),
  });

  // Notifikasi yang belum dikirim sistem: format usulannya sudah berbentuk penanda.
  hasil["nota-transaksi-lunas"] = [
    "USULAN FORMAT (belum jalan):",
    "",
    "Halo {nama},",
    "",
    "Pesanan {nomor} sudah kami catat dan berstatus LUNAS.",
    "",
    "{daftar_produk}",
    "",
    "*TOTAL: {total}*",
    "",
    "Terima kasih sudah berbelanja di SAMAQU.",
  ].join("\n");

  // Jaring pengaman: nilai contoh yang belum tergantikan (mis. karena format teks berbeda)
  // diganti penandanya juga, supaya editor TIDAK PERNAH menampilkan data contoh.
  const jaringPengaman: Record<string, string> = {
    "Contoh Pembeli": "{nama}",
    "Contoh Nama Pemilik Rekening": "{nama_rekening}",
    "Contoh": "{nama}",
    "SMQ-20261017-000": "{nomor}",
    "08123456789": "{wa}",
    "JP0000000000": "{resi}",
    "Rp 567.000": "{total}",
    "Rp 589.000": "{total}",
    "Rp 338.000": "{total}",
    "Rp567.000": "{subtotal}",
    "Rp589.000": "{total}",
    "Rp22.000": "{ongkir}",
    "MANGGALA, KOTA MAKASSAR": "{tujuan}",
    "Transfer Bank (BSI)": "{pembayaran}",
    "0000000000": "{nomor_rekening}",
    "Belum dibayar 24 jam": "{alasan}",
    "Belum Lunas": "{status}",
  };
  for (const key of Object.keys(hasil)) {
    hasil[key] = gantiDenganPenanda(hasil[key], jaringPengaman);
  }

  return hasil;
}

/* ── Katalog notifikasi (dibaca panel Pengaturan admin supaya semua pesan kelihatan) ── */

export type NotifikasiInfo = {
  key: string;
  label: string;
  /** Siapa penerimanya: pembeli atau admin toko. */
  ke: "Pembeli" | "Admin";
  /** Kapan pesan ini benar-benar dikirim (termasuk pintu masuknya: website, Open Order, atau transaksi manual). */
  kapan: string;
  /** Contoh isi pesan (data karangan) untuk pratinjau di panel. */
  isi: string;
  /** `false` = belum dikirim oleh sistem (masih rencana) — supaya jelas mana yang sudah jalan. */
  aktif: boolean;
};

/** Data karangan untuk pratinjau — TIDAK pernah dipakai untuk mengirim pesan sungguhan. */
const SAMPEL_BANK: PaymentInstruction = {
  label: "Transfer Bank (BSI)",
  type: "bank",
  bankName: "BSI",
  accountName: "Contoh Nama Pemilik Rekening",
  accountNumber: "0000000000",
  accountInfo: null,
  instructions: null,
};

const SAMPEL_ITEM: NewOrderNotificationItem[] = [
  { name: "Thobe Soft Grey", series: "Jiharkah", kain: "A-02", color: "default", size: "L", quantity: 1, price: 389000 },
  { name: "Cover Hanger", color: "Hanger saja", size: "ALL SIZE", quantity: 2, price: 89000 },
];

/**
 * Daftar SEMUA notifikasi WhatsApp yang dikirim aplikasi, lengkap dengan pratinjau isinya.
 * Satu sumber: kalau template di atas berubah, pratinjau di panel Pengaturan ikut berubah —
 * jadi tidak ada notifikasi "hantu" yang jalan tanpa kelihatan di UI.
 */
export function katalogNotifikasi(): NotifikasiInfo[] {
  const pembeli = { orderNumber: "SMQ-20261017-000", customerName: "Contoh Pembeli", customerWhatsapp: "08123456789" };
  return [
    {
      key: "pesanan-baru-admin",
      label: "Pesanan baru",
      ke: "Admin",
      aktif: true,
      kapan: "Pesanan masuk dari checkout website atau Open Order",
      isi: buildNewOrderMessage({
        ...pembeli,
        total: 567000,
        paymentType: "Transfer Bank (BSI)",
        items: SAMPEL_ITEM,
        shippingCity: "MANGGALA, KOTA MAKASSAR",
        source: "Website",
      }),
    },
    {
      key: "pesanan-diterima",
      label: "Pesanan diterima + instruksi bayar",
      ke: "Pembeli",
      aktif: true,
      kapan: "Begitu pembeli selesai checkout (website atau Open Order)",
      isi: buildCustomerOrderMessage({ ...pembeli, items: SAMPEL_ITEM, total: 567000, paymentMethod: SAMPEL_BANK }),
    },
    {
      key: "invoice-belum-lunas",
      label: "Invoice pesanan belum lunas",
      ke: "Pembeli",
      aktif: true,
      kapan: 'Transaksi manual yang diinput admin/ops disimpan dengan status "Belum Lunas"',
      isi: buildInvoiceMessage(
        {
          ...pembeli,
          items: SAMPEL_ITEM,
          subtotal: 567000,
          discount: 0,
          shippingCost: 22000,
          total: 589000,
          paid: false,
        },
        [SAMPEL_BANK],
      ),
    },
    {
      key: "nota-transaksi-lunas",
      label: "Nota transaksi manual (Lunas)",
      ke: "Pembeli",
      aktif: false,
      kapan:
        "BELUM AKTIF. Sekarang transaksi manual yang Lunas tidak mengirim pesan apa pun ke pembeli — hanya transaksi Belum Lunas yang dapat invoice.",
      isi: [
        "USULAN FORMAT (belum jalan):",
        "",
        "Halo Ka {nama depan},",
        "",
        "Pesanan {nomor pesanan} sudah kami catat dan berstatus LUNAS.",
        "",
        "{nama produk} {series} {warna} {kain} size {ukuran} x{qty} — Rp{total baris}",
        "Subtotal: Rp{subtotal}",
        "Ongkir: Rp{ongkir}",
        "*TOTAL: Rp{total}*",
        "",
        "Terima kasih sudah berbelanja di SAMAQU.",
      ].join("\n"),
    },
    {
      key: "pembayaran-diterima",
      label: "Pembayaran diterima",
      ke: "Pembeli",
      aktif: true,
      kapan: "Setelah pembayaran terverifikasi (webhook Mayar atau verifikasi admin)",
      isi: buildOrderPaidMessage({ ...pembeli, total: 589000 }),
    },
    {
      key: "pengingat-bayar",
      label: "Pengingat pembayaran",
      ke: "Pembeli",
      aktif: true,
      kapan: "20–23 jam setelah pesanan website/Open Order dibuat, maksimal sekali (cron auto-cancel)",
      isi: buildPaymentReminderMessage({ ...pembeli, total: 338000, paymentMethod: SAMPEL_BANK }),
    },
    {
      key: "pesanan-dikirim",
      label: "Pesanan dikirim + nomor resi",
      ke: "Pembeli",
      aktif: true,
      kapan: "Saat resi J&T terbit atau status pesanan naik ke dikirim",
      isi: buildOrderShippedMessage({ ...pembeli, awbNo: "JP0000000000" }),
    },
    {
      key: "pesanan-sampai",
      label: "Pesanan sampai",
      ke: "Pembeli",
      aktif: true,
      kapan: "Saat tracking J&T menandai paket terkirim",
      isi: buildOrderDeliveredMessage({ ...pembeli }),
    },
    {
      key: "pesanan-dibatalkan-pembeli",
      label: "Pesanan dibatalkan",
      ke: "Pembeli",
      aktif: true,
      kapan: "Saat pesanan dibatalkan (pembeli, admin, atau cron)",
      isi: buildOrderCancelledMessage({ ...pembeli, reason: "Belum dibayar 24 jam" }),
    },
    {
      key: "pesanan-dibatalkan-admin",
      label: "Pesanan dibatalkan (pemberitahuan internal)",
      ke: "Admin",
      aktif: true,
      kapan: "Saat pesanan dibatalkan",
      isi: buildAdminOrderCancelledMessage({ orderNumber: pembeli.orderNumber, customerName: pembeli.customerName, reason: "Belum dibayar 24 jam" }),
    },
  ];
}
