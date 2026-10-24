/**
 * Peta + hitungan tagihan J&T — modul MURNI (tanpa React, tanpa node:*), jadi bisa
 * dipakai route server DAN komponen ops, serta diuji langsung lewat Node.
 *
 * Tabel worksheet diterima lewat bentuk STRUKTURAL (bukan impor `xlsx-lite`), supaya
 * modul server itu tidak pernah ikut ke bundle browser — sama seperti pola
 * `OpenOrderCatalogRow` di open-order.
 *
 * Tiga lapis angka yang sengaja TIDAK digabung jadi satu nominal:
 *   1. tagihan J&T (bruto → diskon → net) — basis TANGGAL PENGIRIMAN
 *   2. ongkir yang dibayar customer (orders.shipping_cost) — basis TANGGAL PESANAN
 *   3. omzet produk (orders.total - shipping_cost) — basis TANGGAL PESANAN
 *
 * ATURAN: diskon J&T adalah PENGURANG BIAYA, bukan pendapatan. Karena itu biaya yang
 * dibukukan selalu `net_cost` (setelah diskon) — lihat komentar yang sama di
 * supabase/migrations/20261023_jnt_invoices.sql.
 */

/** File SQL yang harus dijalankan di Supabase bila tabelnya belum ada. */
export const JNT_INVOICE_SQL_FILE = "supabase/migrations/20261023_jnt_invoices.sql";

/** Basis tanggal — ditampilkan di halaman supaya tidak salah baca. */
export const JNT_EXPENSE_BASIS_LABEL = "tanggal pengiriman (Tanggal Pengiriman J&T)";
export const JNT_ORDER_BASIS_LABEL = "tanggal pesanan dibuat (orders.created_at, WIB)";

/** Sejajar dengan `SheetRow`/`SheetTable` di `src/lib/xlsx-lite.ts` (bentuk, bukan impor). */
export type JntSheetRow = Record<string, string>;
export type JntSheetTable = { header: string[]; rows: JntSheetRow[] };

export type JntInvoiceItemInput = {
  awb_no: string;
  delivery_date: string | null;
  city: string | null;
  district: string | null;
  service: string | null;
  weight: number | null;
  gross_cost: number;
  discount: number;
  net_cost: number;
  /** false = J&T menandai baris ini "Tanpa Diskon" (perlu dicek ke J&T). */
  has_discount: boolean;
};

export type JntInvoiceItem = JntInvoiceItemInput & {
  id?: string;
  invoice_id?: string;
  order_number?: string | null;
  shipping_cost?: number | null;
};

export type JntInvoiceHeader = {
  id?: string;
  period: string;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  gross_total: number;
  discount_total: number;
  ppn_total: number;
  paid_total: number;
  status: "unpaid" | "paid";
  notes: string | null;
};

export type JntParseFailure = { row: number; awb: string; reason: string };

export type JntParseResult = {
  items: JntInvoiceItemInput[];
  failed: JntParseFailure[];
  /** Baris yang tanggal pengirimannya di luar bulan periode terpilih (tanda filter portal salah). */
  outsidePeriod: { awb: string; date: string }[];
  totals: { gross: number; discount: number; net: number };
};

export type JntInvoiceSummary = {
  /** Semua resi di periode ini. */
  shipments: number;
  gross: number;
  discount: number;
  net: number;
  /** Resi yang J&T tandai tanpa diskon — kandidat kelebihan bayar. */
  withoutDiscount: number;
  /** Resi yang belum ketemu pesanannya di sistem. */
  unmatched: number;
  matched: number;
  /** Beban net HANYA untuk resi yang cocok ke pesanan (pembanding margin). */
  matchedNet: number;
  /** Ongkir yang dibayar customer (orders.shipping_cost) untuk resi yang cocok. */
  customerShipping: number;
  /** customerShipping - matchedNet. Positif = ongkir customer menutup biaya J&T. */
  margin: number;
  /** Dari tabel orders, basis tanggal pesanan — sumber terpisah, bukan bagian margin. */
  orders: { count: number; productRevenue: number; shippingCollected: number };
};

/** Bentuk balasan `GET /api/ops/ongkir-jnt` (dipakai halaman & shim data ops). */
export type JntInvoiceResponse = {
  /** false = tabel belum dibuat (migration belum dijalankan di Supabase). */
  tableReady: boolean;
  period: string;
  monthLabel: string;
  sqlFile: string;
  basis: { expense: string; order: string };
  invoice: JntInvoiceHeader | null;
  items: JntInvoiceItem[];
  summary: JntInvoiceSummary | null;
};

/** Bentuk balasan `POST /api/ops/ongkir-jnt/upload`. */
export type JntUploadResult = {
  tableReady: boolean;
  /** false = tabel belum ada, jadi angkanya cuma hasil baca file (belum tersimpan). */
  saved: boolean;
  period: string;
  total: number;
  new: number;
  existing: number;
  failed: number;
  outsidePeriod: number;
  byPeriod: { period: string; new: number; existing: number }[];
  failedRows: JntParseFailure[];
  outsideRows: { awb: string; date: string }[];
  totals: { gross: number; discount: number; net: number };
};

/* ───────────────────────── parsing nilai ───────────────────────── */

function pad2(value: string | number): string {
  return String(value).padStart(2, "0");
}

/**
 * Terima "21000.00" (ekspor J&T) maupun "21.000,50" (format Indonesia) → 21000 / 21000.5.
 * String kosong → null (dibedakan dari 0 supaya baris rusak bisa ditandai).
 */
export function toNumber(value: string | null | undefined): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  let cleaned = raw.replace(/[^\d.,-]/g, "");
  // "abc" / "Rp -" tidak boleh diam-diam jadi 0 — barisnya harus ditandai gagal.
  if (!/\d/.test(cleaned)) return null;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    cleaned =
      lastComma > lastDot
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, "");
  } else if (lastComma >= 0) {
    cleaned = /,\d{1,2}$/.test(cleaned) ? cleaned.replace(",", ".") : cleaned.replace(/,/g, "");
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** "2026-10-12" → "2026-10-12"; juga menerima serial tanggal Excel. Selain itu null. */
export function toIsoDate(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(raw);
  if (iso) return `${iso[1]}-${pad2(iso[2])}-${pad2(iso[3])}`;
  if (/^\d{5}$/.test(raw)) {
    const ms = Date.UTC(1899, 11, 30) + Number(raw) * 86_400_000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  return null;
}

/** "2026-10-12" → "2026-10" (bulan tagihan). */
export function periodOfDate(isoDate: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})/.exec(String(isoDate || ""));
  return m ? `${m[1]}-${m[2]}` : null;
}

export function normalizeAwb(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function pick(row: JntSheetRow, ...names: string[]): string {
  const keys = Object.keys(row);
  for (const name of names) {
    const wanted = normalizeHeader(name);
    const key = keys.find((k) => normalizeHeader(k) === wanted);
    if (key) return row[key] ?? "";
  }
  return "";
}

/* ───────────────────────── peta worksheet → item ───────────────────────── */

/**
 * Ekspor "Resi Saya" (Ekspor → Data semua halaman) → baris per resi.
 * Kolom dicari lewat NAMA header, bukan posisi, jadi urutan kolom J&T boleh berubah.
 */
export function parseJntResiTable(table: JntSheetTable, period?: string | null): JntParseResult {
  const headerNames = table.header.map(normalizeHeader);
  const has = (name: string) => headerNames.includes(normalizeHeader(name));

  if (!has("No. Waybill") || !has("Biaya Kirim")) {
    throw new Error(
      'Kolom "No. Waybill"/"Biaya Kirim" tidak ditemukan — pastikan file ini ekspor dari menu "Resi Saya" J&T (Ekspor → Data semua halaman).',
    );
  }

  const items: JntInvoiceItemInput[] = [];
  const failed: JntParseFailure[] = [];
  const outsidePeriod: { awb: string; date: string }[] = [];
  const seen = new Set<string>();

  table.rows.forEach((row, index) => {
    // +2 = baris header (1) + index berbasis 0, supaya nomornya sama dengan yang dilihat di Excel.
    const rowNo = index + 2;
    const awb = normalizeAwb(pick(row, "No. Waybill"));
    if (!awb) {
      failed.push({ row: rowNo, awb: "", reason: "Nomor resi kosong" });
      return;
    }
    if (seen.has(awb)) {
      failed.push({ row: rowNo, awb, reason: "Nomor resi dobel di file ini" });
      return;
    }

    const deliveryDate = toIsoDate(pick(row, "Tanggal Pengiriman"));
    if (!deliveryDate) {
      failed.push({ row: rowNo, awb, reason: "Tanggal pengiriman tidak dikenali" });
      return;
    }

    const gross = toNumber(pick(row, "Biaya Kirim"));
    if (gross == null) {
      failed.push({ row: rowNo, awb, reason: "Biaya kirim bukan angka" });
      return;
    }

    const discount = toNumber(pick(row, "Biaya Diskon")) ?? 0;
    const netAfter = toNumber(pick(row, "Total Biaya Setelah Diskon"));
    const net = netAfter == null ? gross - discount : netAfter;

    seen.add(awb);
    items.push({
      awb_no: awb,
      delivery_date: deliveryDate,
      city: pick(row, "Kota Penerima") || null,
      district: pick(row, "Kecamatan Penerima") || null,
      service: pick(row, "Layanan") || null,
      weight: toNumber(pick(row, "Berat")),
      gross_cost: gross,
      discount,
      net_cost: net,
      has_discount: discount > 0,
    });

    if (period && periodOfDate(deliveryDate) !== period) {
      outsidePeriod.push({ awb, date: deliveryDate });
    }
  });

  return {
    items,
    failed,
    outsidePeriod,
    totals: {
      gross: items.reduce((sum, item) => sum + item.gross_cost, 0),
      discount: items.reduce((sum, item) => sum + item.discount, 0),
      net: items.reduce((sum, item) => sum + item.net_cost, 0),
    },
  };
}

/* ───────────────────────── ringkasan ───────────────────────── */

export function summarizeJntInvoice(
  items: JntInvoiceItem[],
  orders: JntInvoiceSummary["orders"] = { count: 0, productRevenue: 0, shippingCollected: 0 },
): JntInvoiceSummary {
  const matched = items.filter((item) => item.order_number);
  const customerShipping = matched.reduce((sum, item) => sum + Number(item.shipping_cost || 0), 0);
  const matchedNet = matched.reduce((sum, item) => sum + Number(item.net_cost || 0), 0);

  return {
    shipments: items.length,
    gross: items.reduce((sum, item) => sum + Number(item.gross_cost || 0), 0),
    discount: items.reduce((sum, item) => sum + Number(item.discount || 0), 0),
    net: items.reduce((sum, item) => sum + Number(item.net_cost || 0), 0),
    withoutDiscount: items.filter((item) => !item.has_discount).length,
    unmatched: items.length - matched.length,
    matched: matched.length,
    matchedNet,
    customerShipping,
    margin: customerShipping - matchedNet,
    orders,
  };
}

/* ───────────────────────── format tampilan ───────────────────────── */

const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export function formatRp(value: number | null | undefined): string {
  const n = Number(value || 0);
  return `Rp ${n.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`;
}

export function formatKg(value: number | null | undefined): string {
  const n = Number(value || 0);
  return `${n.toLocaleString("id-ID", { maximumFractionDigits: 2 })} kg`;
}

/** "2026-10-12" → "12 Okt 2026"; kosong → "—". */
export function formatTanggalPendek(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return "—";
  return `${Number(m[3])} ${BULAN_PENDEK[Number(m[2]) - 1] || m[2]} ${m[1]}`;
}

/** "2026-10" → "Oktober 2026". */
export function formatPeriode(period: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})$/.exec(String(period || ""));
  if (!m) return String(period || "—");
  const panjang = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  return `${panjang[Number(m[2]) - 1] || m[2]} ${m[1]}`;
}
