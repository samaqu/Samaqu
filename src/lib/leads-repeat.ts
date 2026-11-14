import { normalizeLeadPhone } from "@/lib/ops-lead-sync";

/**
 * Deteksi customer REPEAT untuk menu Leads (hanya hitung, tidak menulis apa pun).
 *
 * Aturan (disepakati dengan pemilik):
 *  - Repeat = nomor WA punya DUA transaksi sah atau lebih. "Sah" = status diproses/dikirim/selesai
 *    (aturan `SALE_STATUSES`, sama dengan menu Transaksi dan Pelanggan). Pesanan belum bayar
 *    dan dibatalkan tidak dihitung.
 *  - Order pertama (paling awal) = closing awal; semua order sesudahnya = order repeat.
 *  - Repeat TIDAK membuat baris lead baru, jadi riwayatnya diambil dari tabel `orders` lewat nomor WA.
 *
 * Modul ini murni (tanpa akses database) supaya mudah diuji.
 */

const WIB_OFFSET_MS = 7 * 3600 * 1000;

export interface HistoryOrderInput {
  id: string;
  order_number: string;
  customer_whatsapp: string | null;
  total: number | null;
  status: string | null;
  created_at: string;
  /** Ringkasan isi pesanan (lihat `describeOrderItems`). */
  items: string[];
}

export interface HistoryLeadInput {
  id: string;
  kontak: string | null;
  order_id: string | null;
}

export interface LeadOrderEntry {
  order_number: string;
  created_at: string;
  total: number;
  status: string;
  items: string[];
  /** Order yang menutup lead ini (tertaut lewat `leads.order_id`). */
  closing: boolean;
  /** Transaksi pertama nomor ini; sisanya adalah order repeat. */
  first: boolean;
}

export interface LeadHistory {
  /** Jumlah transaksi sah nomor ini. */
  count: number;
  /** Repeat = `count >= 2`. */
  repeat: boolean;
  /** Total belanja semua transaksi sah. */
  spend: number;
  first_order_at: string;
  last_order_at: string;
  /** Terbaru di atas. */
  orders: LeadOrderEntry[];
}

export interface RepeatOrderPoint {
  /** Tanggal order menurut WIB (YYYY-MM-DD). */
  date: string;
  total: number;
  /** Nomor ternormalisasi — dipakai halaman untuk mengikuti pencarian. */
  phone: string;
}

/** Tanggal WIB (YYYY-MM-DD) dari timestamp. */
export function wibDateOf(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  return new Date(t + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

/** Ringkasan satu baris item pesanan, mis. "Thobe Alqowi Hitam ×2". */
export function describeOrderItems(
  items?: Array<{ product_name: string | null; series: string | null; kain: string | null; color: string | null; quantity: number | null }> | null
): string[] {
  if (!items) return [];
  return items.map((it) => {
    const name = it.product_name || it.series || it.kain || "Item";
    const color = it.color && it.color.toLowerCase() !== "default" ? ` ${it.color}` : "";
    const qty = it.quantity && it.quantity > 1 ? ` ×${it.quantity}` : "";
    return `${name}${color}${qty}`.trim();
  });
}

/** Kelompokkan transaksi sah per nomor, urut dari yang paling awal. */
function groupByPhone(orders: HistoryOrderInput[], saleStatuses: readonly string[]) {
  const map = new Map<string, HistoryOrderInput[]>();
  for (const order of orders) {
    if (!saleStatuses.includes(order.status || "")) continue;
    const phone = normalizeLeadPhone(order.customer_whatsapp);
    if (!phone) continue;
    const list = map.get(phone);
    if (list) list.push(order);
    else map.set(phone, [order]);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.order_number.localeCompare(b.order_number));
  }
  return map;
}

/**
 * Riwayat order per lead. Hanya lead yang nomornya punya minimal satu transaksi sah yang muncul di
 * hasil; lead tanpa transaksi tidak punya entri.
 */
export function buildLeadHistories(
  leads: HistoryLeadInput[],
  orders: HistoryOrderInput[],
  saleStatuses: readonly string[]
): Record<string, LeadHistory> {
  const byPhone = groupByPhone(orders, saleStatuses);
  const out: Record<string, LeadHistory> = {};

  for (const lead of leads) {
    const phone = normalizeLeadPhone(lead.kontak);
    const list = phone ? byPhone.get(phone) : undefined;
    if (!list || list.length === 0) continue;

    const entries: LeadOrderEntry[] = list.map((order, index) => ({
      order_number: order.order_number,
      created_at: order.created_at,
      total: Math.max(0, Number(order.total) || 0),
      status: order.status || "",
      items: order.items,
      closing: !!lead.order_id && order.id === lead.order_id,
      first: index === 0,
    }));

    out[lead.id] = {
      count: list.length,
      repeat: list.length >= 2,
      spend: entries.reduce((sum, entry) => sum + entry.total, 0),
      first_order_at: entries[0].created_at,
      last_order_at: entries[entries.length - 1].created_at,
      orders: [...entries].reverse(),
    };
  }
  return out;
}

/**
 * Order repeat dalam rentang tanggal (WIB, inklusif) untuk nomor yang ada di tabel leads:
 * semua transaksi sah SESUDAH transaksi pertama sebuah nomor (nomor dengan >= 2 transaksi).
 */
export function buildRepeatOrders(
  orders: HistoryOrderInput[],
  leadPhones: Set<string>,
  start: string,
  end: string,
  saleStatuses: readonly string[]
): RepeatOrderPoint[] {
  const out: RepeatOrderPoint[] = [];
  for (const [phone, list] of groupByPhone(orders, saleStatuses)) {
    if (list.length < 2 || !leadPhones.has(phone)) continue;
    for (const order of list.slice(1)) {
      const date = wibDateOf(order.created_at);
      if (!date || date < start || date > end) continue;
      out.push({ date, total: Math.max(0, Number(order.total) || 0), phone });
    }
  }
  return out;
}
