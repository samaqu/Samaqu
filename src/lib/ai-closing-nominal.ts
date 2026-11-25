import { SALE_STATUSES, orderRevenue } from "@/lib/transaksi";
import { normalizeLeadPhone } from "@/lib/ops-lead-sync";

/**
 * Aturan hitung closing bot di AI Performance (modul MURNI, tanpa akses database).
 *
 * Prinsip: angka utama hanya berisi closing yang bisa dibuktikan lewat order, dan nominalnya
 * HARGA PRODUK saja (total setelah diskon, tanpa ongkir = `orderRevenue`).
 *
 * | Kondisi closing bot                                        | Dihitung | Nominal                             |
 * | Draft approved + order sah                                 | ya       | produk saja dari order              |
 * | Draft approved + order batal                               | tidak    | -                                   |
 * | Draft pending (belum di-approve)                           | ya       | nominal transfer - ongkir di draft  |
 * | Draft rejected / tanpa draft + order manual yang COCOK     | ya       | produk saja dari order manual       |
 * |   (nomor HP sama + total PERSIS sama dengan nominal transfer)                                              |
 * | Draft rejected tanpa order cocok                           | tidak    | -                                   |
 * | Tanpa draft dan tanpa order cocok, atau order tidak ada    | tidak    | ditampilkan terpisah ("belum tertaut") |
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** Order manual boleh dibuat paling cepat 1 hari sebelum closing dan paling lambat 3 hari sesudahnya. */
export const MANUAL_MATCH_BEFORE_MS = DAY_MS;
export const MANUAL_MATCH_AFTER_MS = 3 * DAY_MS;

export interface ClosingRow {
  id: string;
  inboxId: string;
  /** Nomor WA pengirim (wa_closings.sender). */
  sender: string;
  /** Nominal bukti transfer yang dicatat bot (produk setelah diskon + ongkir). */
  nominal: number;
  createdAt: string;
}

export interface ClosingDraft {
  /** pending | approved | rejected */
  status: string;
  /** Nomor order hasil approve (hanya kalau approved). */
  orderNumber: string | null;
  /** Ongkir yang diisi bot di draft. */
  shippingCost: number;
}

export interface ClosingOrder {
  orderNumber: string;
  status: string;
  total: number;
  shippingCost: number;
  /** Hanya dipakai untuk pencocokan manual. */
  createdAt?: string;
  /** Nomor WA pelanggan order (mentah), hanya untuk pencocokan manual. */
  whatsapp?: string | null;
}

export type ClosingKind =
  | "order"
  | "draft_menunggu"
  | "cocok_manual"
  | "batal"
  | "ditolak"
  | "belum_tertaut";

export interface ClosingResolution {
  /** Masuk angka utama (jumlah closing dan nominal)? */
  counted: boolean;
  /** Nominal harga produk saja; 0 kalau tidak dihitung. */
  nominal: number;
  kind: ClosingKind;
}

const lower = (value: unknown) => String(value ?? "").trim().toLowerCase();
const rupiah = (value: unknown) => Math.max(0, Math.round(Number(value) || 0));

function fromOrder(order: ClosingOrder, saleKind: ClosingKind): ClosingResolution {
  const status = lower(order.status);
  if (status === "dibatalkan") return { counted: false, nominal: 0, kind: "batal" };
  if (SALE_STATUSES.includes(status)) {
    return {
      counted: true,
      nominal: orderRevenue({ total: order.total, shipping_cost: order.shippingCost }),
      kind: saleKind,
    };
  }
  // Order ada tapi belum sah (mis. belum bayar): belum bisa dibuktikan.
  return { counted: false, nominal: 0, kind: "belum_tertaut" };
}

/** Putuskan nasib satu closing bot. `order` = order hasil draft approved; `manual` = order manual yang cocok. */
export function resolveClosing(
  row: Pick<ClosingRow, "nominal">,
  draft: ClosingDraft | null | undefined,
  order: ClosingOrder | null | undefined,
  manual: ClosingOrder | null | undefined,
): ClosingResolution {
  const transfer = rupiah(row.nominal);

  if (draft && lower(draft.status) === "approved") {
    return order ? fromOrder(order, "order") : { counted: false, nominal: 0, kind: "belum_tertaut" };
  }
  if (draft && lower(draft.status) === "pending") {
    return {
      counted: true,
      nominal: Math.max(0, transfer - rupiah(draft.shippingCost)),
      kind: "draft_menunggu",
    };
  }
  // Draft ditolak, atau tidak ada draft (mis. dihapus): hanya order manual yang cocok yang membuktikan.
  if (manual) return fromOrder(manual, "cocok_manual");
  if (draft && lower(draft.status) === "rejected") return { counted: false, nominal: 0, kind: "ditolak" };
  return { counted: false, nominal: 0, kind: "belum_tertaut" };
}

/**
 * Pasangkan closing yang tidak punya order lewat draft dengan order manual:
 * nomor HP sama (setelah normalisasi), total order PERSIS sama dengan nominal transfer,
 * dibuat 1 hari sebelum sampai 3 hari sesudah closing, order sah atau dibatalkan, dan belum dipakai
 * closing lain. Kalau beberapa cocok, dipilih yang waktunya paling dekat. Satu order = satu closing.
 */
export function matchManualOrders(
  rows: ClosingRow[],
  orders: ClosingOrder[],
  usedOrderNumbers: Set<string>,
): Map<string, ClosingOrder> {
  const result = new Map<string, ClosingOrder>();
  const used = new Set(usedOrderNumbers);
  const ordered = [...rows].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

  for (const row of ordered) {
    const phone = normalizeLeadPhone(row.sender);
    const closedAt = Date.parse(row.createdAt);
    const transfer = rupiah(row.nominal);
    if (!phone || !Number.isFinite(closedAt) || transfer <= 0) continue;

    let best: ClosingOrder | null = null;
    let bestGap = Infinity;
    for (const order of orders) {
      if (used.has(order.orderNumber)) continue;
      if (normalizeLeadPhone(order.whatsapp) !== phone) continue;
      if (rupiah(order.total) !== transfer) continue;
      const status = lower(order.status);
      if (status !== "dibatalkan" && !SALE_STATUSES.includes(status)) continue;
      const createdAt = Date.parse(order.createdAt || "");
      if (!Number.isFinite(createdAt)) continue;
      const delta = createdAt - closedAt;
      if (delta < -MANUAL_MATCH_BEFORE_MS || delta > MANUAL_MATCH_AFTER_MS) continue;
      const gap = Math.abs(delta);
      if (gap < bestGap) {
        best = order;
        bestGap = gap;
      }
    }
    if (best) {
      result.set(row.id, best);
      used.add(best.orderNumber);
    }
  }
  return result;
}
