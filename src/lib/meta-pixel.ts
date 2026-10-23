"use client";

// ── Types ──

export interface MetaPixelConfig {
  pixelId: string;
  enabled: boolean;
  accessToken?: string;
  testEventCode?: string;
}

interface TrackResult {
  eventId: string;
}

/** Satu baris `contents` standar Meta: id produk + jumlah (opsional harga satuan). */
export interface MetaContentsItem {
  id: string;
  quantity: number;
  item_price?: number;
}

interface PurchaseOptions {
  /** Isi `contents` (id + quantity). Kalau kosong, diturunkan dari content_ids. */
  contents?: MetaContentsItem[];
  /** Default: nomor pesanan (unik per pesanan) — siap dipasangkan dengan CAPI. */
  eventId?: string;
}

// ── Globals ──

let _config: MetaPixelConfig | null = null;

export function setMetaPixelConfig(config: MetaPixelConfig | null) {
  _config = config;
  if (!config?.enabled) {
    // Pixel dimatikan / belum dikonfigurasi → jangan biarkan event menumpuk.
    _queue = [];
    return;
  }
  flushMetaPixelQueue();
}

export function getMetaPixelConfig(): MetaPixelConfig | null {
  return _config;
}

// ── Event ID Generator ──

export function generateEventId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// ── Internal helpers ──

function isReady(): boolean {
  if (!_config || !_config.enabled || !_config.pixelId) return false;
  if (typeof window === "undefined") return false;
  return typeof (window as any).fbq === "function";
}

export function isMetaPixelReady(): boolean {
  return isReady();
}

function fbq(...args: any[]) {
  if (typeof window !== "undefined" && typeof (window as any).fbq === "function") {
    (window as any).fbq(...args);
  }
}

/* ── Antrean event ──
   Konfigurasi pixel diambil async (store_settings / env). Kalau sebuah event terjadi sebelum
   `fbq` siap (mis. ViewContent selesai sebelum base code termuat), event disimpan dulu lalu
   dikirim setelah pixel siap — jadi tidak ada event yang hilang tanpa mengubah alur UI. */
type QueuedEvent = { name: string; params: Record<string, any>; options: Record<string, any> };
let _queue: QueuedEvent[] = [];
const MAX_QUEUE = 25;

function dispatch(name: string, params: Record<string, any>, options: Record<string, any>) {
  if (typeof window === "undefined") return;
  if (isReady()) {
    fbq("track", name, params, options);
    return;
  }
  // Belum ada config sama sekali (masih loading) atau pixel enabled tapi fbq belum ada.
  if (_config === null || _config.enabled) {
    if (_queue.length >= MAX_QUEUE) _queue.shift();
    _queue.push({ name, params, options });
  }
}

export function flushMetaPixelQueue() {
  if (!isReady() || _queue.length === 0) return;
  const pending = _queue;
  _queue = [];
  for (const event of pending) {
    fbq("track", event.name, event.params, event.options);
  }
}

// ── Browser identifiers (fbp / fbc) ──

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/**
 * `_fbp`/`_fbc` dibaca di browser lalu ikut dikirim ke server. Kalau `_fbc` belum ada tapi URL
 * membawa `fbclid`, bentuk sesuai format resmi Meta (`fb.<subdomain>.<ms>.<fbclid>`) dan simpan
 * sebagai cookie supaya request order berikutnya juga membawanya.
 */
export function getMetaBrowserIds(): { fbp?: string; fbc?: string } {
  if (typeof document === "undefined") return {};

  const fbp = readCookie("_fbp");
  let fbc = readCookie("_fbc");

  if (!fbc && typeof window !== "undefined") {
    const fbclid = new URLSearchParams(window.location.search).get("fbclid");
    if (fbclid) {
      fbc = `fb.1.${Date.now()}.${fbclid}`;
      try {
        const secure = window.location.protocol === "https:" ? "; Secure" : "";
        document.cookie = `_fbc=${encodeURIComponent(fbc)}; path=/; max-age=7776000; SameSite=Lax${secure}`;
      } catch {
        // cookie diblokir → nilai tetap dikirim lewat body
      }
    }
  }

  return { fbp, fbc };
}

// ── CAPI Sender ──

export async function sendCAPIEvent(
  eventName: string,
  eventId: string,
  customData: Record<string, any>,
  userData?: { email?: string; phone?: string; name?: string; city?: string; externalId?: string }
): Promise<void> {
  // Access token CAPI hanya ada di server (/api/meta-events) — jangan pernah butuh di browser.
  if (!_config || !_config.enabled) return;

  const ids = getMetaBrowserIds();

  try {
    await fetch("/api/meta-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventName,
        eventId,
        customData,
        userData,
        fbp: ids.fbp,
        fbc: ids.fbc,
        eventSourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
      }),
      keepalive: true,
    });
  } catch {
    // Fire-and-forget — errors must not affect UX
  }
}

// ── Standard Events ──

export function trackPageView(): TrackResult {
  const eventId = generateEventId();
  dispatch("PageView", {}, { eventID: eventId });
  return { eventId };
}

export function trackViewContent(product: {
  id: string;
  name: string;
  price: number;
  category: string;
  content_type?: string;
  /** Ganti `content_ids` kalau butuh SKU, tapi harus konsisten dengan AddToCart/Purchase. */
  contentIds?: string[];
  contents?: MetaContentsItem[];
}): TrackResult {
  const eventId = generateEventId();
  const contentIds = product.contentIds?.length ? product.contentIds : [product.id];
  dispatch(
    "ViewContent",
    {
      content_ids: contentIds,
      content_name: product.name,
      content_type: product.content_type || "product",
      content_category: product.category,
      value: product.price,
      currency: "IDR",
      ...(product.contents?.length ? { contents: product.contents } : {}),
    },
    { eventID: eventId }
  );
  return { eventId };
}

export function trackSearch(searchString: string): TrackResult {
  const eventId = generateEventId();
  dispatch("Search", { search_string: searchString }, { eventID: eventId });
  return { eventId };
}

export function trackAddToCart(product: {
  id: string;
  name: string;
  price: number;
  quantity: number;
  currency?: string;
  contentIds?: string[];
  contents?: MetaContentsItem[];
}): TrackResult {
  const eventId = generateEventId();
  const contentIds = product.contentIds?.length ? product.contentIds : [product.id];
  const contents =
    product.contents?.length
      ? product.contents
      : [{ id: contentIds[0], quantity: product.quantity, item_price: product.price }];
  dispatch(
    "AddToCart",
    {
      content_ids: contentIds,
      content_name: product.name,
      content_type: "product",
      value: product.price * product.quantity,
      currency: product.currency || "IDR",
      contents,
      num_items: product.quantity,
    },
    { eventID: eventId }
  );
  return { eventId };
}

export function trackInitiateCheckout(value: number, numItems: number, contentIds: string[]): TrackResult {
  const eventId = generateEventId();
  dispatch(
    "InitiateCheckout",
    {
      content_ids: contentIds,
      content_type: "product",
      value,
      currency: "IDR",
      num_items: numItems,
    },
    { eventID: eventId }
  );
  return { eventId };
}

export function trackPurchase(
  value: number,
  orderId: string,
  contentIds: string[],
  numItems: number,
  options?: PurchaseOptions
): TrackResult {
  // Purchase memakai ID pesanan sebagai eventID supaya bisa dipasangkan persis dengan CAPI.
  const eventId = options?.eventId || orderId || generateEventId();
  const contents =
    options?.contents?.length
      ? options.contents
      : contentIds.map((id) => ({ id, quantity: 1 }));
  dispatch(
    "Purchase",
    {
      content_ids: contentIds,
      content_type: "product",
      value,
      currency: "IDR",
      num_items: numItems,
      contents,
      order_id: orderId,
    },
    { eventID: eventId }
  );
  return { eventId };
}

/* ── Purchase sekali per pesanan ──
   Halaman sukses bisa di-refresh / dibuka ulang. Penanda disimpan per ID pesanan di
   sessionStorage (fallback ke memori kalau storage diblokir) sehingga Browser Pixel dan CAPI
   tidak menembak Purchase dua kali untuk pesanan yang sama. */
const _purchaseSeen = new Set<string>();

function purchaseKey(orderId: string): string {
  return `samaqu:meta-purchase:${orderId}`;
}

export function wasPurchaseTracked(orderId: string): boolean {
  if (!orderId) return false;
  if (_purchaseSeen.has(orderId)) return true;
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(purchaseKey(orderId)) === "1";
  } catch {
    return false;
  }
}

export function markPurchaseTracked(orderId: string): void {
  if (!orderId) return;
  _purchaseSeen.add(orderId);
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(purchaseKey(orderId), "1");
  } catch {
    // storage diblokir → penanda memori tetap dipakai
  }
}

/**
 * Kirim Purchase hanya sekali untuk satu pesanan.
 * `isNew` = false berarti pesanan ini sudah pernah ditembak (refresh / buka ulang) → jangan
 * kirim CAPI lagi.
 */
export function trackPurchaseOnce(params: {
  orderId: string;
  value: number;
  contentIds: string[];
  contents?: MetaContentsItem[];
  numItems: number;
}): { eventId: string; isNew: boolean } {
  const eventId = params.orderId || generateEventId();
  if (!params.orderId || wasPurchaseTracked(params.orderId)) {
    return { eventId, isNew: false };
  }
  // Tandai lebih dulu: mencegah dobel kalau komponen ter-mount dua kali (React Strict Mode).
  markPurchaseTracked(params.orderId);
  trackPurchase(params.value, params.orderId, params.contentIds, params.numItems, {
    contents: params.contents,
    eventId,
  });
  return { eventId, isNew: true };
}

export function trackLead(contentName: string): TrackResult {
  const eventId = generateEventId();
  dispatch("Lead", { content_name: contentName, currency: "IDR" }, { eventID: eventId });
  return { eventId };
}

export function trackCompleteRegistration(method: string): TrackResult {
  const eventId = generateEventId();
  dispatch(
    "CompleteRegistration",
    { content_name: "Customer Account", status: "registered", registration_method: method },
    { eventID: eventId }
  );
  return { eventId };
}

// ── Custom Events ──

export function trackWhatsAppClick(source: string, productId?: string): TrackResult {
  const eventId = generateEventId();
  if (isReady()) {
    fbq(
      "trackCustom",
      "WhatsAppClick",
      {
        source,
        ...(productId ? { content_ids: [productId], content_type: "product" } : {}),
      },
      { eventID: eventId }
    );
  }
  return { eventId };
}

export function trackFormSubmit(formName: string): TrackResult {
  const eventId = generateEventId();
  if (isReady()) {
    fbq("trackCustom", "FormSubmit", { form_name: formName }, { eventID: eventId });
  }
  return { eventId };
}
