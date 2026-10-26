import type { SupabaseClient } from "@supabase/supabase-js";
import { SALE_STATUSES } from "@/lib/transaksi";

/**
 * "Pusat data pelanggan" — satu sumber untuk agregasi + filter + sort, dipakai
 * dashboard admin (`/admin`) **dan** dashboard ops (`/ops/pelanggan`).
 *
 * Satu pelanggan = satu baris `customers` bila akunnya terdaftar; pembeli tanpa akun
 * (order tanpa `customer_id`) tetap ditampilkan sebagai entri "guest" yang dikelompokkan
 * per nama, supaya tidak ada yang hilang.
 *
 * Modul ini mengimpor `SupabaseClient` sebagai **tipe** saja, jadi fungsi filter/sort-nya
 * aman dipakai di klien.
 */

export type DirectoryOrder = {
  order_number: string;
  created_at: string;
  total: number;
  status: string;
  items: string[];
  address: string | null;
  /** Alasan pembatalan (kolom `orders.cancel_reason`); null untuk data lama. */
  cancelReason: string | null;
};

export type DirectoryCustomer = {
  key: string;
  id: string | null;
  name: string;
  whatsapp: string;
  birthDate: string | null;
  registered: boolean;
  /** Waktu daftar akun (kolom `customers.created_at`); tamu → null. */
  createdAt: string | null;
  orders: DirectoryOrder[];
  ordersCount: number;
  /**
   * Jumlah pesanan yang benar-benar jadi transaksi (aturan `SALE_STATUSES` — sama dengan
   * menu Transaksi: diproses/dikirim/selesai). Pesanan belum dibayar & dibatalkan tidak ikut.
   */
  paidOrdersCount: number;
  /** Total belanja = jumlah nilai pesanan yang benar-benar jadi transaksi saja. */
  totalSpend: number;
  lastOrderAt: string | null;
  /** Kota unik dari alamat pesanan (untuk filter Kota). */
  cities: string[];
  /**
   * Punya alamat pengiriman (dari salah satu pesanannya, termasuk yang dibatalkan).
   * Dipakai untuk menandai pelanggan yang alamatnya siap dipakai di menu Transaksi.
   */
  hasAddress: boolean;
  /**
   * Ada alamatnya, TAPI kecamatannya tidak tersimpan di manapun (data lama dari checkout yang
   * dulu membuang kecamatan). Ditandai supaya admin bisa melengkapi manual — bukan ditebak.
   */
  addressIncomplete: boolean;
};

/* ── Agregasi (server) ── */

type ItemRow = { product_name: string | null; series: string | null; kain: string | null; color: string | null; quantity: number | null };
type OrderRow = {
  id: string;
  order_number: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_whatsapp: string | null;
  shipping_address: string | null;
  shipping_city: string | null;
  shipping_kecamatan?: string | null;
  shipping_postal_code: string | null;
  total: number | null;
  status: string | null;
  created_at: string;
  /** Alasan pembatalan (migration 20261026_order_cancel_reason.sql). */
  cancel_reason?: string | null;
  order_items?: ItemRow[] | null;
};
type CustomerRow = { id: string; name: string | null; whatsapp: string | null; birth_date?: string | null; created_at?: string | null };

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

/** Ringkasan singkat isi pesanan untuk baris riwayat belanja. */
function describeItems(items?: ItemRow[] | null): string[] {
  if (!items) return [];
  return items.map((it) => {
    const name = it.product_name || it.series || it.kain || "Item";
    const color = it.color && it.color.toLowerCase() !== "default" ? ` ${it.color}` : "";
    const qty = it.quantity && it.quantity > 1 ? ` ×${it.quantity}` : "";
    return `${name}${color}${qty}`.trim();
  });
}

export async function buildCustomerDirectory(admin: SupabaseClient): Promise<DirectoryCustomer[]> {
  // `birth_date` ditambahkan lewat migration terpisah — kalau belum ada, ulangi select tanpa
  // kolom itu supaya daftarnya tidak kosong.
  let customers: CustomerRow[] = [];
  const withBirth = await admin.from("customers").select("id, name, whatsapp, birth_date, created_at");
  if (withBirth.error) {
    console.warn("[CUSTOMERS] customers.birth_date belum tersedia, membaca tanpa kolom itu:", withBirth.error.message);
    const fallback = await admin.from("customers").select("id, name, whatsapp, created_at");
    customers = (fallback.data || []) as CustomerRow[];
  } else {
    customers = (withBirth.data || []) as CustomerRow[];
  }

  // `cancel_reason` baru ditambahkan lewat migration. Kalau kolomnya belum ada, ulangi select
  // tanpa kolom itu — kalau tidak, SELURUH daftar pesanan gagal dibaca dan riwayat pelanggan
  // jadi kosong.
  const ORDER_COLUMNS =
    "id, order_number, customer_id, customer_name, customer_whatsapp, shipping_address, shipping_city, shipping_kecamatan, shipping_postal_code, total, status, created_at";
  const ORDER_ITEMS = "order_items(product_name, series, kain, color, quantity)";
  let orders: OrderRow[] | null = null;
  let ordersError: { message?: string } | null = null;
  {
    const first = await admin.from("orders").select(`${ORDER_COLUMNS}, cancel_reason, ${ORDER_ITEMS}`);
    if (first.error && /cancel_reason/i.test(first.error.message)) {
      const fallback = await admin.from("orders").select(`${ORDER_COLUMNS}, ${ORDER_ITEMS}`);
      orders = (fallback.data || []) as OrderRow[];
      ordersError = fallback.error;
    } else {
      orders = (first.data || []) as OrderRow[];
      ordersError = first.error;
    }
  }
  if (ordersError) console.warn("[CUSTOMERS] Gagal membaca orders:", ordersError.message);

  type Agg = DirectoryCustomer;
  const byKey = new Map<string, Agg>();
  const idByName = new Map<string, string>();

  for (const c of customers) {
    byKey.set(c.id, {
      key: c.id,
      id: c.id,
      name: c.name || "Tanpa nama",
      whatsapp: c.whatsapp || "",
      birthDate: c.birth_date || null,
      registered: true,
      createdAt: c.created_at || null,
      orders: [],
      ordersCount: 0,
      paidOrdersCount: 0,
      totalSpend: 0,
      lastOrderAt: null,
      cities: [],
      hasAddress: false,
      addressIncomplete: false,
    });
    const n = norm(c.name);
    if (n && !idByName.has(n)) idByName.set(n, c.id);
  }

  const citySets = new Map<string, Set<string>>();
  /** Pelanggan yang punya alamat, dan yang kecamatannya tersimpan di data. */
  const addressKeys = new Set<string>();
  const kecamatanKeys = new Set<string>();
  for (const o of (orders || []) as OrderRow[]) {
    // Utamakan `customer_id`; order lama (customer_id null) dicocokkan lewat nama.
    let key: string | null = null;
    if (o.customer_id && byKey.has(o.customer_id)) key = o.customer_id;
    else if (norm(o.customer_name) && idByName.has(norm(o.customer_name))) key = idByName.get(norm(o.customer_name)) || null;

    if (!key) {
      key = `guest:${norm(o.customer_name) || norm(o.customer_whatsapp) || o.id}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          key,
          id: null,
          name: o.customer_name || "Tanpa nama",
          whatsapp: o.customer_whatsapp || "",
          birthDate: null,
          registered: false,
          createdAt: null,
          orders: [],
          ordersCount: 0,
          paidOrdersCount: 0,
          totalSpend: 0,
          lastOrderAt: null,
          cities: [],
          hasAddress: false,
          addressIncomplete: false,
        });
      }
    }

    const agg = byKey.get(key)!;
    agg.orders.push({
      order_number: o.order_number,
      created_at: o.created_at,
      total: o.total || 0,
      status: o.status || "",
      items: describeItems(o.order_items),
      address: [o.shipping_address, o.shipping_city, o.shipping_postal_code].filter(Boolean).join(", ") || null,
      cancelReason: String(o.cancel_reason || "").trim() || null,
    });
    agg.ordersCount += 1;
    // "Total belanja" = hanya pesanan yang benar-benar jadi transaksi belanja, memakai aturan
    // yang SAMA dengan menu Transaksi (`SALE_STATUSES`: diproses/dikirim/selesai).
    // Pesanan yang masih menunggu pembayaran dan pesanan dibatalkan tidak dihitung,
    // jadi angka di sini tidak bisa berbeda dengan menu Transaksi.
    if (SALE_STATUSES.includes(o.status || "")) {
      agg.totalSpend += o.total || 0;
      agg.paidOrdersCount += 1;
    }
    if (!agg.whatsapp && o.customer_whatsapp) agg.whatsapp = o.customer_whatsapp;
    if (!agg.lastOrderAt || o.created_at > agg.lastOrderAt) agg.lastOrderAt = o.created_at;

    // "Punya alamat" = ada pesanan dengan alamat jalan yang benar-benar terisi. Pesanan
    // dibatalkan TETAP dihitung, jadi pelanggan lama tidak hilang dari daftar.
    const street = String(o.shipping_address || "").trim();
    if (street && street !== "-") agg.hasAddress = true;

    // Kecamatan dianggap tersimpan kalau ada di kolomnya sendiri, atau menempel di
    // `shipping_city` dengan format "<kecamatan>, <kota>".
    const kecamatan = String(o.shipping_kecamatan || "").trim();
    const cityParts = String(o.shipping_city || "").split(",").map((part) => part.trim()).filter(Boolean);
    if (street && street !== "-") {
      addressKeys.add(agg.key);
      if (kecamatan || cityParts.length > 1) kecamatanKeys.add(agg.key);
    }

    const city = (o.shipping_city || "").trim();
    if (city) {
      if (!citySets.has(key)) citySets.set(key, new Set());
      citySets.get(key)!.add(city);
    }
  }

  const result = Array.from(byKey.values());
  for (const c of result) {
    c.orders.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    c.cities = Array.from(citySets.get(c.key) || []).sort((a, b) => a.localeCompare(b, "id-ID"));
    // Ada alamat tapi kecamatan tidak tersimpan di pesanan mana pun → perlu dilengkapi manual.
    c.addressIncomplete = addressKeys.has(c.key) && !kecamatanKeys.has(c.key);
  }
  return result;
}

/* ── Filter & sort (murni, bisa di klien) ── */

/**
 * Daftar pelanggan yang sudah punya alamat pengiriman. Dipakai untuk menaruh pelanggan
 * yang alamatnya siap dipakai di urutan atas pilihan pelanggan saat membuat transaksi.
 */
export function withAddress(list: DirectoryCustomer[]): DirectoryCustomer[] {
  return (list || []).filter((customer) => customer.hasAddress !== false);
}

/* ── Tab daftar pelanggan ── */

export type CustomerTab = "all" | "buyers" | "cancelled";

export const CUSTOMER_TABS: { key: CustomerTab; label: string; hint: string }[] = [
  { key: "all", label: "Semua Pelanggan", hint: "Semua pelanggan yang tercatat di sistem" },
  { key: "buyers", label: "Pernah Belanja", hint: "Pelanggan dengan minimal satu transaksi belanja" },
  { key: "cancelled", label: "Hanya Pesanan Batal", hint: "Seluruh pesanannya dibatalkan & belum ada transaksi belanja" },
];

const isCancelled = (status: unknown) => String(status || "").toLowerCase().includes("batal");

/** Ada minimal satu transaksi belanja? (aturan sama dengan menu Transaksi) */
export function pernahBelanja(customer?: DirectoryCustomer | null): boolean {
  return (customer?.orders || []).some((order) => SALE_STATUSES.includes(String(order.status || "")));
}

/** Seluruh riwayat pesanannya dibatalkan & belum punya transaksi belanja. */
export function hanyaPesananBatal(customer?: DirectoryCustomer | null): boolean {
  const orders = customer?.orders || [];
  return orders.length > 0 && !pernahBelanja(customer) && orders.every((order) => isCancelled(order.status));
}

/** Saring daftar sesuai tab yang aktif. */
export function filterByTab(list: DirectoryCustomer[], tab: CustomerTab): DirectoryCustomer[] {
  if (tab === "buyers") return (list || []).filter(pernahBelanja);
  if (tab === "cancelled") return (list || []).filter(hanyaPesananBatal);
  return list || [];
}

/** Jumlah pelanggan di tiap tab — dihitung dari data yang sama dengan yang ditampilkan. */
export function countByTab(list: DirectoryCustomer[]): Record<CustomerTab, number> {
  const items = list || [];
  return {
    all: items.length,
    buyers: items.filter(pernahBelanja).length,
    cancelled: items.filter(hanyaPesananBatal).length,
  };
}

export type AccountFilter = "all" | "registered" | "guest";
export type PeriodFilter = "all" | "30" | "90" | "365";
export type CustomerSort = "newest" | "spend" | "name";

export const ACCOUNT_FILTERS: { key: AccountFilter; label: string }[] = [
  { key: "all", label: "Semua akun" },
  { key: "registered", label: "Punya akun" },
  { key: "guest", label: "Belum daftar" },
];

export const PERIOD_FILTERS: { key: PeriodFilter; label: string }[] = [
  { key: "all", label: "Semua waktu" },
  { key: "30", label: "Belanja 30 hari" },
  { key: "90", label: "Belanja 90 hari" },
  { key: "365", label: "Belanja 1 tahun" },
];

export const CUSTOMER_SORTS: { key: CustomerSort; label: string }[] = [
  { key: "newest", label: "Terbaru" },
  { key: "spend", label: "Belanja terbanyak" },
  { key: "name", label: "Nama A–Z" },
];

function parseBirth(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

/** Aktivitas terakhir: order terakhir, atau waktu daftar — dipakai untuk urutan "Terbaru". */
export function lastActivityAt(c: DirectoryCustomer): string {
  const a = c.lastOrderAt || "";
  const b = c.createdAt || "";
  return a > b ? a : b;
}

export function distinctCities(list: DirectoryCustomer[]): string[] {
  const set = new Set<string>();
  for (const c of list) for (const city of c.cities) set.add(city);
  return Array.from(set).sort((a, b) => a.localeCompare(b, "id-ID"));
}

export function filterCustomers(
  list: DirectoryCustomer[],
  opts: { query?: string; account?: AccountFilter; period?: PeriodFilter; city?: string; birthdayThisMonth?: boolean },
  now: Date = new Date()
): DirectoryCustomer[] {
  const q = (opts.query || "").trim().toLowerCase();
  const nowMs = now.getTime();
  return list.filter((c) => {
    if (opts.account === "registered" && !c.registered) return false;
    if (opts.account === "guest" && c.registered) return false;
    if (opts.birthdayThisMonth) {
      const b = c.birthDate ? parseBirth(c.birthDate) : null;
      if (!b || b.m !== now.getMonth() + 1) return false;
    }
    if (opts.city && opts.city !== "all" && !c.cities.includes(opts.city)) return false;
    if (opts.period && opts.period !== "all") {
      if (!c.lastOrderAt) return false;
      const diffDays = (nowMs - new Date(c.lastOrderAt).getTime()) / 86400000;
      if (diffDays > Number(opts.period)) return false;
    }
    if (q) {
      const hit = c.name.toLowerCase().includes(q) || (c.whatsapp || "").includes(q);
      if (!hit) return false;
    }
    return true;
  });
}

export function sortCustomers(list: DirectoryCustomer[], sort: CustomerSort): DirectoryCustomer[] {
  const arr = [...list];
  if (sort === "spend") arr.sort((a, b) => b.totalSpend - a.totalSpend);
  else if (sort === "name") arr.sort((a, b) => a.name.localeCompare(b.name, "id-ID"));
  else arr.sort((a, b) => lastActivityAt(b).localeCompare(lastActivityAt(a)));
  return arr;
}
