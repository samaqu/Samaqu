/**
 * Riwayat Pesanan reseller (menu Reseller > tab "Riwayat Pesanan") — fungsi MURNI.
 *
 * Hanya membaca dan menghitung ulang data yang sudah ada (`orders` + `order_items`). Tidak ada
 * tulis ke database, tidak menyentuh aturan harga/saldo/pesanan. Satu sumber untuk tabel,
 * kartu ringkasan, dan CSV supaya angkanya tidak mungkin beda.
 *
 * Aturan angka:
 *  - Pesanan dibatalkan TETAP tampil di daftar, tetapi TIDAK dihitung di kartu ringkasan.
 *  - Harga beli = `order_items.reseller_buy_price` (satuan per pcs); kalau kosong pakai `price`.
 *  - Total produk = jumlah (harga beli x qty); total ongkir = jumlah `orders.shipping_cost`.
 */

import { ORDER_STAGE_LABEL, orderStage, type OrderStage } from "@/lib/order-flow";

export interface RiwayatOrderSource {
  id: string;
  order_number: string;
  created_at: string;
  status: string;
  shipping_status?: string | null;
  tracking_status_code?: number | null;
  awb_no?: string | null;
  is_preorder?: boolean | null;
  preorder_ready_at?: string | null;
  shipping_cost?: number | null;
  customer_name?: string | null;
  reseller_id: string;
  order_items?: RiwayatItemSource[] | null;
}

export interface RiwayatItemSource {
  id?: string | number | null;
  product_name?: string | null;
  series?: string | null;
  kain?: string | null;
  color?: string | null;
  size?: string | null;
  quantity?: number | null;
  reseller_buy_price?: number | null;
  price?: number | null;
}

export interface RiwayatItem {
  product_name: string;
  kain: string;
  series: string;
  /** Warna Thobe selalu "default" di database — tidak ditampilkan (kosong). */
  color: string;
  size: string;
  quantity: number;
  /** Harga beli reseller per pcs. */
  buy_price: number;
}

export interface RiwayatOrder {
  id: string;
  order_number: string;
  created_at: string;
  reseller_id: string;
  reseller_name: string;
  customer_name: string;
  shipping_cost: number;
  awb_no: string;
  stage: OrderStage;
  stage_label: string;
  cancelled: boolean;
  items: RiwayatItem[];
}

export interface RiwayatSummary {
  /** Pesanan yang dihitung (tanpa yang dibatalkan). */
  pesanan: number;
  /** Baris item yang dihitung. */
  item: number;
  /** Total pcs (jumlah qty). */
  pcs: number;
  /** Jumlah harga beli x qty. */
  total_produk: number;
  total_ongkir: number;
  /** Pesanan dibatalkan di hasil filter (tidak dihitung di atas). */
  dibatalkan: number;
}

export interface RiwayatFilters {
  reseller_id: string;
  /** "YYYY-MM" (WIB). Kosong = tidak membatasi bulan. */
  bulan: string;
  /** "YYYY-MM-DD" (WIB), dipakai bila `bulan` kosong. */
  dari: string;
  sampai: string;
  /** Salah satu `OrderStage` atau kosong = semua. */
  status: string;
  q: string;
}

export const RIWAYAT_STAGES: OrderStage[] = [
  "belum_bayar",
  "menunggu_stok",
  "belum_dipacking",
  "sudah_dipacking",
  "dikirim",
  "selesai",
  "dibatalkan",
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Baca filter dari query string dengan validasi ketat; nilai tak valid dibuang (bukan error). */
export function parseRiwayatFilters(params: URLSearchParams): RiwayatFilters {
  const resellerId = (params.get("reseller_id") || "").trim();
  const bulan = (params.get("bulan") || "").trim();
  const dari = (params.get("dari") || "").trim();
  const sampai = (params.get("sampai") || "").trim();
  const status = (params.get("status") || "").trim();
  // Karakter khusus filter PostgREST (`,` `(` `)`) dan wildcard dibuang dari pencarian.
  const q = (params.get("q") || "").replace(/[,()%*\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  const validBulan = MONTH_RE.test(bulan) ? bulan : "";
  return {
    reseller_id: UUID_RE.test(resellerId) ? resellerId : "",
    bulan: validBulan,
    dari: !validBulan && DAY_RE.test(dari) ? dari : "",
    sampai: !validBulan && DAY_RE.test(sampai) ? sampai : "",
    status: (RIWAYAT_STAGES as string[]).includes(status) ? status : "",
    q,
  };
}

/** Tambah hari ke tanggal "YYYY-MM-DD" tanpa bergantung zona waktu server. */
export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Batas waktu (ISO UTC) dari filter tanggal WIB: [gte, lt). Kosong = tidak dibatasi. */
export function dateBounds(filters: Pick<RiwayatFilters, "bulan" | "dari" | "sampai">): {
  gte: string | null;
  lt: string | null;
} {
  const wib = (ymd: string) => new Date(`${ymd}T00:00:00+07:00`).toISOString();
  if (filters.bulan) {
    const [y, m] = filters.bulan.split("-").map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    return { gte: wib(`${filters.bulan}-01`), lt: wib(`${next}-01`) };
  }
  return {
    gte: filters.dari ? wib(filters.dari) : null,
    lt: filters.sampai ? wib(addDaysYmd(filters.sampai, 1)) : null,
  };
}

const num = (value: unknown): number => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? n : 0;
};

/** Ubah baris database menjadi pesanan siap tampil (tahap dihitung dengan `orderStage` yang sama dengan Transaksi). */
export function toRiwayatOrder(row: RiwayatOrderSource, resellerName: string): RiwayatOrder {
  const stage = orderStage({
    status: row.status,
    is_preorder: row.is_preorder,
    preorder_ready_at: row.preorder_ready_at,
    awb_no: row.awb_no,
    shipping_status: row.shipping_status,
    tracking_status_code: row.tracking_status_code,
  });
  const items = (Array.isArray(row.order_items) ? row.order_items : [])
    .slice()
    .sort((a, b) => String(a.id ?? "").localeCompare(String(b.id ?? ""), undefined, { numeric: true }))
    .map<RiwayatItem>((item) => {
      const color = String(item.color || "").trim();
      return {
        product_name: String(item.product_name || "").trim(),
        kain: String(item.kain || "").trim(),
        series: String(item.series || "").trim(),
        color: color.toLowerCase() === "default" ? "" : color,
        size: String(item.size || "").trim(),
        quantity: num(item.quantity),
        buy_price: num(item.reseller_buy_price ?? item.price),
      };
    });
  return {
    id: String(row.id),
    order_number: String(row.order_number),
    created_at: String(row.created_at),
    reseller_id: String(row.reseller_id),
    reseller_name: resellerName,
    customer_name: String(row.customer_name || "").trim(),
    shipping_cost: num(row.shipping_cost),
    awb_no: String(row.awb_no || "").trim(),
    stage,
    stage_label: ORDER_STAGE_LABEL[stage],
    cancelled: stage === "dibatalkan",
    items,
  };
}

/** Ringkasan kartu: pesanan dibatalkan tidak dihitung (hanya dilaporkan jumlahnya). */
export function summarize(orders: RiwayatOrder[]): RiwayatSummary {
  const summary: RiwayatSummary = { pesanan: 0, item: 0, pcs: 0, total_produk: 0, total_ongkir: 0, dibatalkan: 0 };
  for (const order of orders) {
    if (order.cancelled) {
      summary.dibatalkan += 1;
      continue;
    }
    summary.pesanan += 1;
    summary.total_ongkir += order.shipping_cost;
    for (const item of order.items) {
      summary.item += 1;
      summary.pcs += item.quantity;
      summary.total_produk += item.buy_price * item.quantity;
    }
  }
  return summary;
}

/* ── CSV ── */

export const CSV_HEADERS = [
  "Tanggal",
  "Nomor Pesanan",
  "Reseller",
  "Produk",
  "Kain",
  "Series",
  "Warna",
  "Size",
  "Qty",
  "Harga Beli",
  "Ongkir",
  "Resi",
  "Status",
] as const;

/** Tanggal + jam WIB "YYYY-MM-DD HH:mm" dari ISO. */
export function wibDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ");
}

/** Teks bebas: cegah rumus Excel (=, +, -, @) lalu kutip bila perlu. Angka tidak lewat sini. */
export function csvText(value: string): string {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Satu baris CSV per item, kolom sama dengan tabel. Tanggal, nomor, dan reseller diulang di tiap baris
 * (supaya bisa disaring di Excel); ongkir, resi, dan status hanya di baris pertama pesanan seperti di
 * tabel, jadi menjumlahkan kolom Ongkir tidak menghitung ongkir dua kali.
 */
export function buildCsv(orders: RiwayatOrder[]): string {
  const lines: string[] = [CSV_HEADERS.join(",")];
  for (const order of orders) {
    const items: (RiwayatItem | null)[] = order.items.length > 0 ? order.items : [null];
    items.forEach((item, index) => {
      const first = index === 0;
      lines.push(
        [
          csvText(wibDateTime(order.created_at)),
          csvText(order.order_number),
          csvText(order.reseller_name),
          csvText(item?.product_name ?? ""),
          csvText(item?.kain ?? ""),
          csvText(item?.series ?? ""),
          csvText(item?.color ?? ""),
          csvText(item?.size ?? ""),
          item ? String(item.quantity) : "",
          item ? String(item.buy_price) : "",
          first ? String(order.shipping_cost) : "",
          first ? csvText(order.awb_no) : "",
          first ? csvText(order.stage_label) : "",
        ].join(",")
      );
    });
  }
  return lines.join("\r\n") + "\r\n";
}
