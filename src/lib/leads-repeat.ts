import { normalizeLeadPhone } from "@/lib/ops-lead-sync";
import { isPaketItem, variantName } from "@/lib/item-label";

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

/** Satu baris `order_items` seperti yang dibaca dari database. */
export interface HistoryItemInput {
  product_id?: string | null;
  product_name: string | null;
  series: string | null;
  kain: string | null;
  color: string | null;
  size: string | null;
  quantity: number | null;
  price: number | null;
  product_image: string | null;
}

export interface HistoryOrderInput {
  id: string;
  order_number: string;
  customer_name: string | null;
  customer_whatsapp: string | null;
  total: number | null;
  subtotal: number | null;
  shipping_cost: number | null;
  discount: number | null;
  status: string | null;
  created_at: string;
  shipping_address: string | null;
  shipping_kecamatan: string | null;
  shipping_city: string | null;
  shipping_province: string | null;
  shipping_postal_code: string | null;
  shipping_notes: string | null;
  items: HistoryItemInput[];
}

export interface HistoryLeadInput {
  id: string;
  kontak: string | null;
  order_id: string | null;
}

/** Chip varian seperti di detail Transaksi: kain & series berwarna ("kain"), ukuran/qty netral. */
export interface OrderChip {
  teks: string;
  jenis: "kain" | "netral";
}

/** Satu item pesanan siap tampil (gaya kartu "Informasi Produk" di Transaksi). */
export interface OrderLine {
  key: string;
  nama: string;
  chips: OrderChip[];
  /** Harga satu baris (harga satuan × jumlah). */
  harga: number;
  foto: string | null;
}

export interface LeadOrderEntry {
  order_number: string;
  created_at: string;
  status: string;
  lines: OrderLine[];
  subtotal: number;
  shipping_cost: number;
  discount: number;
  total: number;
  /** Order yang menutup lead ini (tertaut lewat `leads.order_id`). */
  closing: boolean;
  /** Transaksi pertama nomor ini; sisanya adalah order repeat. */
  first: boolean;
}

/** Alamat pengiriman dari transaksi terbaru nomor ini. */
export interface LeadAddress {
  nama: string;
  telepon: string;
  /** Jalan + wilayah (kecamatan, kota, provinsi, kode pos) dalam satu teks, seperti di Transaksi. */
  lengkap: string;
  catatan: string;
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
  /** Dari transaksi terbaru yang punya alamat; null kalau tidak ada yang beralamat. */
  address: LeadAddress | null;
}

export interface RepeatOrderPoint {
  /** Tanggal order menurut WIB (YYYY-MM-DD). */
  date: string;
  total: number;
  /** Nomor ternormalisasi — dipakai halaman untuk mengikuti pencarian. */
  phone: string;
}

const clean = (value: string | null | undefined) => String(value ?? "").trim();
const money = (value: number | null | undefined) => Math.max(0, Number(value) || 0);

/** Tanggal WIB (YYYY-MM-DD) dari timestamp. */
export function wibDateOf(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  return new Date(t + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Item pesanan → baris tampil. Chip mengikuti detail Transaksi persis: pakaian =
 * Kain · Series · Varian · Ukuran/jumlah; paket (Cover & Hanger, Kabak) = Kain · Varian · Ukuran/jumlah.
 */
export function toOrderLines(items?: HistoryItemInput[] | null): OrderLine[] {
  return (items || []).map((item, index) => {
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const size = clean(item.size);
    const kain: OrderChip | null = clean(item.kain) ? { teks: `Kain ${clean(item.kain)}`, jenis: "kain" } : null;
    const series: OrderChip | null = variantName(item.series) ? { teks: variantName(item.series), jenis: "kain" } : null;
    const varian: OrderChip | null = variantName(item.color) ? { teks: variantName(item.color), jenis: "kain" } : null;
    const ukuran: OrderChip = { teks: `${size}${size ? " · " : ""}x${quantity}`, jenis: "netral" };
    const chips = isPaketItem(item) ? [kain, varian, ukuran] : [kain, series, varian, ukuran];
    return {
      key: `${index}-${clean(item.product_name)}-${clean(item.color)}-${size}`,
      nama: clean(item.product_name) || clean(item.series) || clean(item.kain) || "Item",
      chips: chips.filter((chip): chip is OrderChip => chip !== null),
      harga: money(item.price) * quantity,
      foto: clean(item.product_image) || null,
    };
  });
}

/** Alamat dari satu order; null kalau jalannya kosong. */
export function addressOf(order: HistoryOrderInput): LeadAddress | null {
  const street = clean(order.shipping_address);
  if (!street) return null;
  const region = [order.shipping_kecamatan, order.shipping_city, order.shipping_province, order.shipping_postal_code]
    .map(clean)
    .filter(Boolean)
    .join(", ");
  return {
    nama: clean(order.customer_name),
    telepon: clean(order.customer_whatsapp),
    lengkap: [street, region].filter(Boolean).join(", "),
    catatan: clean(order.shipping_notes),
  };
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

    const entries: LeadOrderEntry[] = list.map((order, index) => {
      const lines = toOrderLines(order.items);
      const subtotal = order.subtotal != null ? money(order.subtotal) : lines.reduce((sum, line) => sum + line.harga, 0);
      return {
        order_number: order.order_number,
        created_at: order.created_at,
        status: order.status || "",
        lines,
        subtotal,
        shipping_cost: money(order.shipping_cost),
        discount: money(order.discount),
        total: money(order.total),
        closing: !!lead.order_id && order.id === lead.order_id,
        first: index === 0,
      };
    });

    // Alamat dari transaksi TERBARU yang beralamat (list urut paling awal → paling baru di belakang).
    let address: LeadAddress | null = null;
    for (let i = list.length - 1; i >= 0 && !address; i--) address = addressOf(list[i]);

    out[lead.id] = {
      count: list.length,
      repeat: list.length >= 2,
      spend: entries.reduce((sum, entry) => sum + entry.total, 0),
      first_order_at: entries[0].created_at,
      last_order_at: entries[entries.length - 1].created_at,
      orders: [...entries].reverse(),
      address,
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
      out.push({ date, total: money(order.total), phone });
    }
  }
  return out;
}
