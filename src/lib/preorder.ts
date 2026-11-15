/**
 * Pre-Order (PO) — aturan bersama, MURNI (tanpa I/O), dipakai server dan layar.
 *
 * Konsep (lihat supabase/migrations/20261115_preorder_flags.sql):
 *  - PO = baris `orders` biasa + penanda `is_preorder`. Bukan tabel/status baru.
 *  - Selama `preorder_ready_at` kosong, PO "menunggu stok": stok TIDAK dipotong
 *    (`stock_reserved = false`), belum boleh dibuatkan resi, dan tidak masuk antrean packing.
 *  - Saat barang datang admin menandai ready: stok dipotong lalu `preorder_ready_at` terisi, dan
 *    sejak itu PO mengikuti alur pesanan reguler.
 *  - PO wajib Lunas saat dicatat, tidak bisa dibatalkan ke customer; admin hanya boleh membatalkan
 *    dengan alasan wajib (tercatat di `orders.cancel_reason`).
 */

export const PREORDER_DEFAULT_ESTIMATE = "7-10 hari kerja";
const ESTIMATE_MAX_LENGTH = 60;

/** Kolom minimum untuk mengenali PO dari baris `orders`. */
export interface PreorderFlags {
  is_preorder?: boolean | null;
  preorder_ready_at?: string | null;
  status?: string | null;
}

/** Pesanan ini pre-order (menunggu stok ataupun sudah ready). */
export function isPreorder(order?: PreorderFlags | null): boolean {
  return order?.is_preorder === true;
}

/** PO yang masih menunggu stok: belum ready dan belum dibatalkan. */
export function isPreorderWaiting(order?: PreorderFlags | null): boolean {
  return isPreorder(order) && !order?.preorder_ready_at && String(order?.status || "") !== "dibatalkan";
}

export const PREORDER_NOT_READY_MESSAGE =
  "Pesanan pre-order ini masih menunggu stok. Tandai \"Stok sudah ready\" dulu sebelum membuat resi atau mengubah status pengiriman.";

export const PREORDER_MUST_BE_PAID_MESSAGE =
  "Pre-order wajib Lunas saat dicatat (customer transfer dulu). Pilih status Lunas.";

/** Estimasi untuk customer: teks bebas pendek; kosong → bawaan "7-10 hari kerja". */
export function normalizePreorderEstimate(value: unknown): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim().slice(0, ESTIMATE_MAX_LENGTH);
  return text || PREORDER_DEFAULT_ESTIMATE;
}

/* ── Pembatalan: alasan wajib ──────────────────────────────────────────────── */

export const PREORDER_CANCEL_REASONS = [
  { key: "salah_input", label: "Salah input" },
  { key: "duplikat", label: "Pesanan dobel" },
  { key: "data_uji", label: "Data uji" },
  { key: "lainnya", label: "Lainnya" },
] as const;

export type PreorderCancelReasonKey = (typeof PREORDER_CANCEL_REASONS)[number]["key"];

/** Awalan teks alasan batal PO; dipakai penjaga pusat untuk mengenali pembatalan yang sah. */
export const PREORDER_CANCEL_PREFIX = "Pre-order dibatalkan:";

/** Alasan batal ini berasal dari `parsePreorderCancelReason` (bukan teks bawaan pemanggil lain). */
export function isPreorderCancelRemark(remark: unknown): boolean {
  return String(remark ?? "").startsWith(PREORDER_CANCEL_PREFIX);
}

export const PREORDER_CANCEL_NEEDS_REASON_MESSAGE =
  "Pre-order tidak bisa dibatalkan tanpa alasan. Batalkan dari menu Transaksi/Pre-Order dengan memilih alasan.";

export type PreorderCancelReason =
  | { ok: true; key: PreorderCancelReasonKey; text: string }
  | { ok: false; error: string };

/**
 * Alasan batal/hapus PO. `reason` salah satu kunci di atas; "lainnya" wajib disertai catatan.
 * Teks hasilnya yang disimpan di `orders.cancel_reason` (dan terbaca di riwayat).
 */
export function parsePreorderCancelReason(input: { reason?: unknown; note?: unknown } | null | undefined): PreorderCancelReason {
  const key = String(input?.reason ?? "").trim();
  const note = String(input?.note ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  const found = PREORDER_CANCEL_REASONS.find((entry) => entry.key === key);
  if (!found) {
    return {
      ok: false,
      error:
        "Pre-order tidak bisa dibatalkan tanpa alasan. Pilih alasan: salah input, pesanan dobel, data uji, atau lainnya.",
    };
  }
  if (found.key === "lainnya" && note.length < 3) {
    return { ok: false, error: "Alasan \"Lainnya\" wajib diisi catatan singkat." };
  }
  return {
    ok: true,
    key: found.key,
    text: `${PREORDER_CANCEL_PREFIX} ${found.label}${note ? ` — ${note}` : ""}`,
  };
}

/* ── Stok: kebutuhan PO dan alokasi urut transfer (FIFO) ───────────────────── */

export interface PreorderLine {
  product_id: string;
  color?: string | null;
  size?: string | null;
  quantity: number;
}

export interface PreorderPlanOrder {
  id: string;
  order_number: string;
  created_at: string;
  items: PreorderLine[];
}

/** Kunci varian yang sama dengan pembacaan stok (`color` kosong = "default", size huruf besar). */
export function variantKey(line: { product_id: unknown; color?: unknown; size?: unknown }): string {
  const color = String(line.color ?? "").trim() || "default";
  const size = String(line.size ?? "").trim().toUpperCase();
  return `${String(line.product_id ?? "").trim()}||${color}||${size}`;
}

/** Baris yang punya stok: layanan (mis. jasa potong panjang) dan baris tanpa ukuran dilewati. */
function stocked(line: PreorderLine, isService?: (line: PreorderLine) => boolean): boolean {
  if (!String(line.product_id || "").trim()) return false;
  if (!String(line.size || "").trim()) return false;
  if (Number(line.quantity) <= 0) return false;
  return !(isService && isService(line));
}

/** Kebutuhan satu pesanan per varian (baris varian yang sama dijumlahkan). */
export function preorderNeeds(order: PreorderPlanOrder, isService?: (line: PreorderLine) => boolean): Map<string, number> {
  const needs = new Map<string, number>();
  for (const line of order.items || []) {
    if (!stocked(line, isService)) continue;
    const key = variantKey(line);
    needs.set(key, (needs.get(key) || 0) + Math.round(Number(line.quantity) || 0));
  }
  return needs;
}

export interface PreorderShortage {
  key: string;
  need: number;
  have: number;
}

export interface PreorderPlan {
  /** Pesanan yang stoknya cukup, urut siapa transfer duluan. */
  ready: PreorderPlanOrder[];
  /** Pesanan yang dilewati karena stoknya belum cukup (tidak menghalangi pesanan lain). */
  skipped: { order: PreorderPlanOrder; short: PreorderShortage[] }[];
}

/**
 * Susun pesanan mana yang bisa diproses dengan stok yang ada, urut `created_at` (siapa transfer
 * duluan). Pesanan yang stoknya belum cukup DILEWATI tanpa menghalangi pesanan sesudahnya.
 * Satu pesanan diproses seluruhnya atau tidak sama sekali (semua item dikirim bersamaan).
 * `stock` tidak diubah; alokasi dihitung di salinan.
 */
export function planPreorderReady(
  orders: PreorderPlanOrder[],
  stock: Map<string, number>,
  isService?: (line: PreorderLine) => boolean,
): PreorderPlan {
  const remaining = new Map(stock);
  const sorted = [...orders].sort(
    (a, b) => String(a.created_at).localeCompare(String(b.created_at)) || String(a.order_number).localeCompare(String(b.order_number)),
  );
  const plan: PreorderPlan = { ready: [], skipped: [] };
  for (const order of sorted) {
    const needs = preorderNeeds(order, isService);
    if (needs.size === 0) {
      // Tanpa barang bersetok (hanya layanan): tidak ada yang ditunggu.
      plan.ready.push(order);
      continue;
    }
    const short: PreorderShortage[] = [];
    for (const [key, need] of needs) {
      const have = remaining.get(key) ?? 0;
      if (have < need) short.push({ key, need, have });
    }
    if (short.length > 0) {
      plan.skipped.push({ order, short });
      continue;
    }
    for (const [key, need] of needs) remaining.set(key, (remaining.get(key) ?? 0) - need);
    plan.ready.push(order);
  }
  return plan;
}

export interface PreorderDemandRow {
  key: string;
  product_id: string;
  color: string;
  size: string;
  /** Total qty yang dibutuhkan semua PO yang menunggu. */
  needed: number;
  /** Jumlah pesanan PO yang menunggu varian ini. */
  orders: number;
}

/** Ringkasan kebutuhan PO per produk/warna/ukuran (untuk spanduk Barang Masuk dan menu Pre-Order). */
export function preorderDemand(orders: PreorderPlanOrder[], isService?: (line: PreorderLine) => boolean): PreorderDemandRow[] {
  const rows = new Map<string, PreorderDemandRow>();
  for (const order of orders) {
    for (const [key, need] of preorderNeeds(order, isService)) {
      const [product_id, color, size] = key.split("||");
      const row = rows.get(key) || { key, product_id, color, size, needed: 0, orders: 0 };
      row.needed += need;
      row.orders += 1;
      rows.set(key, row);
    }
  }
  return [...rows.values()].sort((a, b) => b.needed - a.needed || a.key.localeCompare(b.key));
}
