import { supabase } from "@/lib/supabase";
import type { JntInvoiceHeader, JntInvoiceResponse, JntUploadResult } from "@/lib/jnt-invoice";

/**
 * Shim data-layer untuk dashboard internal (/ops).
 *
 * Halaman /ops di-port apa adanya dari app Base44, jadi bentuk `base44.entities.X.*`
 * dipertahankan di sini dan diteruskan ke API internal kita (/api/ops/...) yang
 * membaca/menulis DB SAMAQU yang sama dengan website (satu sumber kebenaran).
 */

export const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function call<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error((json as any)?.error || `Request gagal (${res.status})`);
  return json as T;
}

async function fetchVariants(): Promise<any[]> {
  const json = await call<{ items: any[] }>("GET", VARIANTS);
  return json.items ?? [];
}

const LEADS = "/api/ops/leads";
const PRODUCTS = "/api/ops/products";
const JENIS_KAIN = "/api/ops/jenis-kain";
const VARIANTS = "/api/ops/product-variants";
const STOCK_IN = "/api/ops/stock-in";
const TRANSACTIONS = "/api/ops/transactions";
/** Menu Transaksi: daftar per pesanan + pencatatan transaksi manual. */
const TRANSAKSI = "/api/ops/transaksi";
/** Retur & Tukar Size (tabel returns/return_items). */
const RETURNS = "/api/ops/returns";
/** Buku alamat pelanggan (tabel `saved_addresses` yang sama dengan checkout website). */
const ALAMAT = "/api/ops/alamat";
/** Provinsi/kota/kecamatan dari dataset area J&T (untuk isian alamat). */
const WILAYAH = "/api/ops/wilayah";
/** Deteksi alamat dari teks yang ditempel (tombol "Isi otomatis" di drawer Transaksi). */
const ALAMAT_TEBAK = "/api/ops/alamat-tebak";
/** Sebaran pesanan per kota (menu Database Kota). */
const KOTA = "/api/ops/kota";
/** Cek ongkir J&T: berat dihitung di server, tarifnya dari /api/shipping/jnt-cost (checkout). */
const ONGKIR = "/api/ops/ongkir";
/** Menu Keuangan → Ongkir J&T: tagihan bulanan J&T vs ongkir yang dibayar customer. */
const ONGKIR_JNT = "/api/ops/ongkir-jnt";
/** Pra-cek pembuatan resi (baca data pesanan + kode area J&T; tidak memanggil J&T). */
const RESI_CHECK = "/api/ops/resi-check";
/**
 * Pembuatan resi J&T memakai route admin apa adanya (`PATCH /api/admin/orders` aksi `createJnt`)
 * — guard-nya `isOpsAdmin`, sama dengan route ops lain, jadi tidak perlu route kedua.
 */
const ADMIN_ORDERS = "/api/admin/orders";
const CUSTOMERS = "/api/ops/customers";

/** Base44 memakai sort "-created_date" (desc). Kita terjemahkan ke parameter API. */
function sortParam(sort?: string) {
  if (!sort) return "created_at:asc";
  return sort.startsWith("-") ? "created_at:desc" : "created_at:asc";
}

export const base44 = {
  entities: {
    Lead: {
      async filter(query: any = {}, opts: any = {}) {
        const base = new URLSearchParams();
        if (query?.tanggal?.$gte) base.set("start", String(query.tanggal.$gte));
        if (query?.tanggal?.$lte) base.set("end", String(query.tanggal.$lte));
        if (query?.kontak?.$regex) base.set("search", String(query.kontak.$regex));
        base.set("sort", String(opts?.sort ?? "tanggal"));

        const pageSize = Math.min(Math.max(Number(opts?.limit) || 1000, 1), 2000);
        const items: any[] = [];
        for (let offset = 0; ; ) {
          const params = new URLSearchParams(base);
          params.set("limit", String(pageSize));
          params.set("offset", String(offset));
          const json = await call<{ items: any[]; next_cursor: string | null }>("GET", `${LEADS}?${params.toString()}`);
          const batch = json.items ?? [];
          items.push(...batch);
          offset += batch.length;
          if (!json.next_cursor || batch.length === 0) break;
        }
        return { items };
      },
      async list(opts: any = {}) {
        const params = new URLSearchParams();
        params.set("limit", String(opts?.limit ?? 500));
        if (opts?.cursor) params.set("offset", String(opts.cursor));
        const json = await call<{ items: any[]; next_cursor: string | null }>("GET", `${LEADS}?${params.toString()}`);
        return { items: json.items ?? [], next_cursor: json.next_cursor ?? null };
      },
      async create(data: any) {
        const json = await call<{ items: any[] }>("POST", LEADS, { rows: [data], blockDuplicates: true });
        return json.items?.[0] ?? null;
      },
      async bulkCreate(rows: any[]) {
        return call<{ inserted: number }>("POST", LEADS, { rows });
      },
      async update(id: string, data: any) {
        const json = await call<{ item: any }>("PATCH", LEADS, { id, ...data });
        return json.item ?? null;
      },
      async delete(id: string) {
        return call<{ deleted: number }>("DELETE", LEADS, { id });
      },
    },

    Product: {
      async list(_sort?: string) {
        const json = await call<{ items: any[] }>("GET", PRODUCTS);
        return json.items ?? [];
      },
      async create(data: any) {
        const json = await call<{ item: any }>("POST", PRODUCTS, data);
        return json.item ?? null;
      },
      async update(id: string, data: any) {
        const json = await call<{ item: any }>("PATCH", PRODUCTS, { id, ...data });
        return json.item ?? null;
      },
      async delete(id: string) {
        return call<{ deleted: number }>("DELETE", PRODUCTS, { id });
      },
    },

    JenisKain: {
      async list() {
        const json = await call<{ items: any[] }>("GET", JENIS_KAIN);
        return json.items ?? [];
      },
    },

    ProductVariant: {
      async list(_sort?: string) {
        return fetchVariants();
      },
      /** Varian milik satu produk (dipakai form edit produk). */
      async filter(query: any = {}) {
        const items = await fetchVariants();
        return query?.product_id ? items.filter((v) => v.product_id === query.product_id) : items;
      },
      /** Simpan varian baru: satu baris = satu (produk, warna) + stok per ukuran. */
      async bulkCreate(rows: any[]) {
        return call<{ saved: number }>("POST", VARIANTS, { rows });
      },
      /** Update varian lama; `id`-nya bentuk "product_id||color" dari list(). */
      async bulkUpdate(rows: any[]) {
        return call<{ saved: number }>("PATCH", VARIANTS, { rows });
      },
      async deleteMany(query: any = {}) {
        return call<{ deleted: number }>("DELETE", VARIANTS, query);
      },
    },

    StockIn: {
      async list(sort?: string, opts: any = {}) {
        const params = new URLSearchParams({ sort: sortParam(sort), limit: String(opts?.limit ?? 1000) });
        const json = await call<{ items: any[] }>("GET", `${STOCK_IN}?${params.toString()}`);
        return json.items ?? [];
      },
      async create(data: any) {
        const json = await call<{ item: any }>("POST", STOCK_IN, data);
        return json.item ?? null;
      },
      /** Satu paket barang masuk (banyak produk) — atomik & idempoten lewat request_id. */
      async createBatch(data: any) {
        return call<Record<string, any>>("POST", STOCK_IN, data);
      },
      async delete(id: string) {
        return call<{ deleted: number }>("DELETE", STOCK_IN, { id });
      },
    },

    Transaction: {
      async list(sort?: string, opts: any = {}) {
        const params = new URLSearchParams({ sort: sortParam(sort), limit: String(opts?.limit ?? 2000) });
        const json = await call<{ items: any[] }>("GET", `${TRANSACTIONS}?${params.toString()}`);
        return json.items ?? [];
      },

      /** Daftar transaksi per PESANAN untuk menu Transaksi (bulan terpilih). */
      async orders(range: { start: string; end: string }) {
        const params = new URLSearchParams({ start: range.start, end: range.end });
        const json = await call<{ items: any[] }>("GET", `${TRANSAKSI}?${params.toString()}`);
        return json.items ?? [];
      },

      /** Catat transaksi manual (langsung Lunas, stok langsung terpotong). */
      async createManual(data: any) {
        return call<{ order_number: string; total: number }>("POST", TRANSAKSI, data);
      },

      /** Simpan perubahan transaksi manual. */
      async updateManual(data: any) {
        return call<{ order_number: string; total: number }>("PATCH", TRANSAKSI, { action: "update", ...data });
      },

      /** Batalkan transaksi (stok dikembalikan lewat jalur pembatalan yang sama dengan admin). */
      async cancel(orderNumber: string) {
        return call<{ order_number: string; cancelled: boolean }>("PATCH", TRANSAKSI, {
          action: "cancel",
          order_number: orderNumber,
        });
      },

      /**
       * Alamat pelanggan untuk form transaksi: alamat tersimpan (`addresses`) + alamat
       * pesanan terakhirnya (`last`) supaya isian alamat bisa langsung terisi.
       */
      async addresses(params: { customer_id?: string; whatsapp?: string; name?: string }) {
        const search = new URLSearchParams();
        if (params?.customer_id) search.set("customer_id", params.customer_id);
        if (params?.whatsapp) search.set("whatsapp", params.whatsapp);
        if (params?.name) search.set("name", params.name);
        if ([...search.keys()].length === 0) return { addresses: [], last: null };
        const json = await call<{ items: any[]; last: any }>("GET", `${ALAMAT}?${search.toString()}`);
        return { addresses: json.items ?? [], last: json.last ?? null };
      },

      /** Simpan alamat baru ke buku alamat pelanggan. */
      async saveAddress(data: any) {
        const json = await call<{ item: any }>("POST", ALAMAT, data);
        return json.item ?? null;
      },

      /**
       * Hapus transaksi manual (untuk membuang data uji). Server menolak kalau pesanan sudah
       * punya resi J&T atau kalau itu pesanan website, dan mengembalikan stok lebih dulu.
       */
      async deleteOrder(orderNumber: string) {
        return call<{ order_number: string; deleted: boolean }>("DELETE", TRANSAKSI, { order_number: orderNumber });
      },

      /**
       * Buat resi J&T untuk satu pesanan (aksi sungguhan ke J&T). Memakai route admin apa
       * adanya: `PATCH /api/admin/orders { orderNumber, action: "createJnt" }`.
       * Kontrak responsnya dipertahankan: sukses `{ success, awbNo, status, shippingStatus }`,
       * gagal melempar Error dengan pesan server apa adanya.
       */
      async createResi(orderNumber: string, packaging?: any) {
        return call<{ success: boolean; awbNo: string; status: string; shippingStatus: string; serviceCode?: string; packagingWarning?: boolean }>(
          "PATCH",
          ADMIN_ORDERS,
          { orderNumber, action: "createJnt", packaging },
        );
      },

      /** Paket kemasan default/sudah tersimpan untuk satu pesanan. */
      async packaging(orderNumber: string) {
        return call<any>("GET", `/api/ops/orders/${encodeURIComponent(orderNumber)}/packaging`);
      },

      /**
       * Simpan nomor resi pesanan HBO (dibuat manual di J&T VIP). `shipped` true = paket sudah
       * dikirim (status langsung `dikirim` + notifikasi), false = resi dibuat, menunggu pickup.
       * Memakai route admin yang sama: `PATCH /api/admin/orders { action: "manualResi" }`.
       */
      async createManualResi(orderNumber: string, awbNo: string, shipped: boolean, packaging?: any) {
        return call<{ success: boolean; awbNo: string; status: string; shippingStatus: string; serviceCode?: string; packagingWarning?: boolean }>(
          "PATCH",
          ADMIN_ORDERS,
          { orderNumber, action: "manualResi", awbNo, shipped, packaging },
        );
      },

      /** "Tandai Dikirim" untuk resi HBO yang masih menunggu pickup. */
      async markShipped(orderNumber: string) {
        return call<{ success: boolean; awbNo: string; status: string; shippingStatus: string }>(
          "PATCH",
          ADMIN_ORDERS,
          { orderNumber, action: "markShipped" },
        );
      },

      /** Detail pesanan + item (dipakai form pengajuan retur). */
      async getOrder(orderNumber: string) {
        const params = new URLSearchParams({ order_number: orderNumber });
        const json = await call<{ order: any }>("GET", `/api/ops/orders?${params.toString()}`);
        return json.order ?? null;
      },

      /** Daftar pesanan terbaru untuk dropdown pengajuan retur. */
      async recentOrders(limit = 60) {
        const params = new URLSearchParams({ limit: String(limit) });
        const json = await call<{ orders: any[] }>("GET", `/api/ops/orders?${params.toString()}`);
        return json.orders ?? [];
      },
    },

    /** Retur & Tukar Size. */
    Return: {
      async list(params: { type?: string; status?: string; q?: string; limit?: number } = {}) {
        const search = new URLSearchParams();
        if (params.type) search.set("type", params.type);
        if (params.status) search.set("status", params.status);
        if (params.q) search.set("q", params.q);
        if (params.limit) search.set("limit", String(params.limit));
        const suffix = search.toString();
        const json = await call<{ items: any[] }>("GET", suffix ? `${RETURNS}?${suffix}` : RETURNS);
        return json.items ?? [];
      },

      async get(returnNumber: string) {
        const params = new URLSearchParams({ return_number: returnNumber });
        const json = await call<{ item: any }>("GET", `${RETURNS}?${params.toString()}`);
        return json.item ?? null;
      },

      async create(data: any) {
        const json = await call<{ item: any }>("POST", RETURNS, data);
        return json.item ?? null;
      },

      async update(returnNumber: string, action: string, data: any = {}) {
        const json = await call<{ item: any }>("PATCH", RETURNS, { return_number: returnNumber, action, ...data });
        return json.item ?? null;
      },

      /** Hapus permanen (koreksi/reset data uji). Stok dibalik dulu di server. */
      async remove(returnNumber: string) {
        return call<{ deleted: boolean }>("DELETE", `${RETURNS}?return_number=${encodeURIComponent(returnNumber)}`);
      },

      async createResi(returnNumber: string) {
        return call<{ item: any; awbNo: string; weightGrams?: number }>("POST", `${RETURNS}/resi`, {
          return_number: returnNumber,
        });
      },
    },

    /** Pra-cek pembuatan resi (hanya membaca; tidak memanggil J&T dan tidak menulis apa pun). */
    Resi: {
      async check(orderNumber: string) {
        return call<{
          ok: boolean;
          checks: { key: string; label: string; ok: boolean; detail?: string }[];
          weight_grams: number;
          receiver: { name: string; phone: string; address: string; kecamatan: string; city: string; postal_code: string };
          awb_no: string;
          status: string;
        }>("POST", RESI_CHECK, { order_number: orderNumber });
      },
    },

    /** Cek ongkir J&T dari drawer Transaksi (berat dihitung di server). */
    Ongkir: {
      async check(body: { city: string; kecamatan: string; items: unknown[] }) {
        return call<{ data: any[]; weight_grams: number; city: string; kecamatan: string }>("POST", ONGKIR, body);
      },
    },

    /** Tagihan bulanan J&T (menu Keuangan → Ongkir J&T). */
    OngkirJnt: {
      get(period: string) {
        return call<JntInvoiceResponse>("GET", `${ONGKIR_JNT}?period=${encodeURIComponent(period)}`);
      },
      /** Simpan angka invoice J&T: bruto, diskon, PPN, total bayar, jatuh tempo, status. */
      async simpan(body: Record<string, unknown>) {
        const json = await call<{ invoice: JntInvoiceHeader }>("POST", ONGKIR_JNT, body);
        return json.invoice;
      },
      /** Upload ekspor "Resi Saya" J&T — idempoten per nomor resi. */
      async upload(file: File, period: string) {
        const form = new FormData();
        form.append("file", file);
        form.append("period", period);
        const res = await fetch(`${ONGKIR_JNT}/upload`, {
          method: "POST",
          headers: await authHeaders(),
          body: form,
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error((json as any)?.error || `Upload gagal (${res.status})`);
        return json as JntUploadResult;
      },
    },

    /** Provinsi/kota/kecamatan (sumbernya dataset area J&T yang sudah ada). */
    Wilayah: {
      async provinces() {
        const json = await call<{ provinces: string[] }>("GET", WILAYAH);
        return json.provinces ?? [];
      },
      async cities(province: string) {
        const params = new URLSearchParams({ province });
        const json = await call<{ cities: string[] }>("GET", `${WILAYAH}?${params.toString()}`);
        return json.cities ?? [];
      },
      async districts(city: string) {
        const params = new URLSearchParams({ city });
        const json = await call<{ districts: string[] }>("GET", `${WILAYAH}?${params.toString()}`);
        return json.districts ?? [];
      },
      /** Kode pos yang mungkin untuk kota + kecamatan (bantuan isi alamat). */
      async postalCodes(city: string, district: string) {
        const params = new URLSearchParams({ city, district });
        return call<{ postal_codes: string[] }>("GET", `${WILAYAH}?${params.toString()}`);
      },
    },

    /**
     * "Tempel alamat lengkap, isi otomatis": kirim teks mentah, server mendeteksi
     * nama/nomor HP + provinsi/kota/kecamatan/kode pos dari data wilayah yang dipakai
     * dropdown. Bagian yang tidak dikenali dibiarkan kosong (tidak ditebak).
     */
    AlamatTebak: {
      async deteksi(text: string) {
        return call<{
          name: string;
          whatsapp: string;
          street: string;
          province: string;
          city: string;
          kecamatan: string;
          postal_code: string;
          missing: string[];
          filled: string[];
        }>("POST", ALAMAT_TEBAK, { text });
      },
    },

    /** Menu Database Kota: sebaran pesanan per kota beserta rinciannya. */
    Kota: {
      async list(params: { start?: string; end?: string; source?: string; province?: string; q?: string }) {
        const search = new URLSearchParams();
        if (params?.start) search.set("start", params.start);
        if (params?.end) search.set("end", params.end);
        if (params?.source && params.source !== "all") search.set("source", params.source);
        if (params?.province && params.province !== "all") search.set("province", params.province);
        if (params?.q) search.set("q", params.q);
        const json = await call<{ items: any[]; totals: any; options: any }>(
          "GET",
          `${KOTA}?${search.toString()}`,
        );
        return { items: json.items ?? [], totals: json.totals ?? null, options: json.options ?? { provinces: [], sources: [] } };
      },
    },

    Customer: {
      async list() {
        const json = await call<{ items: any[] }>("GET", CUSTOMERS);
        return json.items ?? [];
      },
    },
  },
};
