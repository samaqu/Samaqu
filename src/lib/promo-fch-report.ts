/**
 * Hitungan kartu "Promo Free Cover Hanger" di Laporan Office.
 *
 * Murni (tanpa jaringan/database) supaya bisa diuji. Aturan gratis vs dibeli SAMA dengan "Rincian Biaya
 * Free Gift" di `/api/ops/laporan` (satu definisi "cover keluar", angkanya tidak boleh beda):
 *  - baris cover berharga Rp0 (promo website) = gratis penuh;
 *  - baris cover berbayar yang tertutup diskon pesanan = floor(min(diskon, nilai kotor cover) / Rp35.000)
 *    unit, dibagikan ke baris berbayar sesuai urutan barisnya;
 *  - sisanya dianggap dibeli (add-on Open Order dan penjualan biasa).
 * Yang dihitung hanya pesanan sah (diproses/dikirim/selesai); pesanan batal dan belum bayar tidak masuk.
 */

/** Harga normal Cover & Hanger (satu paket); dasar nilai yang digratiskan. */
export const COVER_VALUE = 35_000;
export const COVER_PRODUCT_IDS = ["cover-hanger", "addon-cover-hanger"] as const;
export const VARIAN_THOBE = "Cover Thobe + Hanger";
export const VARIAN_KOKO = "Cover Koko + Hanger";
export const VARIAN_LAIN = "Lainnya";

export type PromoOrigin = "bot" | "admin" | "website";
export const ORIGIN_LABEL: Record<PromoOrigin, string> = {
  bot: "Bot WA",
  admin: "Input admin",
  website: "Website",
};

export interface PromoItem {
  order_id?: string | null;
  product_id?: string | null;
  product_name?: string | null;
  color?: string | null;
  quantity?: number | null;
  qty?: number | null;
  price?: number | null;
  hpp?: number | null;
}

export interface PromoOrder {
  id: string;
  order_number?: string | null;
  status?: string | null;
  created_at: string;
  discount?: number | null;
  customer_name?: string | null;
}

export interface PromoDraft {
  id: string;
  created_at?: string | null;
  payload?: { items?: PromoItem[]; discount?: number | null } | null;
}

export function isCoverLine(item: PromoItem | null | undefined): boolean {
  const id = String(item?.product_id ?? "").trim();
  return (COVER_PRODUCT_IDS as readonly string[]).includes(id);
}

/** Varian cover dari kolom `color`; varian lama "Set Hanger + Cover" dilebur ke Cover Thobe + Hanger. */
export function coverVariantOf(item: PromoItem): string {
  const hint = `${item.color ?? ""} ${item.product_name ?? ""}`;
  if (/koko/i.test(hint)) return VARIAN_KOKO;
  if (/thobe|set\s*hanger/i.test(hint)) return VARIAN_THOBE;
  return VARIAN_LAIN;
}

export interface CoverLineSplit {
  item: PromoItem;
  variant: string;
  free: number;
  paid: number;
  paidRevenue: number;
}

const qtyOf = (item: PromoItem) => Math.max(0, Number(item.quantity ?? item.qty) || 0);
const priceOf = (item: PromoItem) => Math.max(0, Number(item.price) || 0);

/** Pisahkan tiap baris cover pada SATU pesanan menjadi unit gratis dan unit dibeli. */
export function splitCoverLines(items: PromoItem[], orderDiscount: number): CoverLineSplit[] {
  const lines = (items || []).filter((item) => isCoverLine(item) && qtyOf(item) > 0);
  if (!lines.length) return [];

  const coverQty = lines.reduce((sum, item) => sum + qtyOf(item), 0);
  const coverGross = lines.reduce((sum, item) => sum + priceOf(item) * qtyOf(item), 0);
  const freeByPriceQty = lines.filter((item) => priceOf(item) <= 0).reduce((sum, item) => sum + qtyOf(item), 0);
  let discountLeft = Math.min(
    Math.max(0, coverQty - freeByPriceQty),
    Math.floor(Math.min(Math.max(0, Number(orderDiscount) || 0), coverGross) / COVER_VALUE),
  );

  return lines.map((item) => {
    const qty = qtyOf(item);
    const price = priceOf(item);
    const freeByPrice = price <= 0 ? qty : 0;
    const freeByDiscount = price > 0 ? Math.min(discountLeft, qty) : 0;
    discountLeft -= freeByDiscount;
    const free = freeByPrice + freeByDiscount;
    const paid = qty - free;
    return { item, variant: coverVariantOf(item), free, paid, paidRevenue: paid * price };
  });
}

export interface PromoFchRow {
  tanggal: string;
  nomorPesanan: string;
  pelanggan: string;
  unit: number;
  varian: string;
  asal: PromoOrigin;
  status: string;
}

export interface PromoFchReport {
  /** Unit cover gratis yang keluar pada pesanan sah. */
  keluar: number;
  nilaiDigratiskan: number;
  /** Modal sebenarnya (HPP) dari unit gratis; unit tanpa data modal dihitung di `modalTanpaData`. */
  modal: number;
  modalTanpaData: number;
  menunggu: { draft: number; unit: number };
  dibeli: { unit: number; omzet: number };
  perAsal: Record<PromoOrigin, number>;
  perVarian: Array<{ varian: string; gratis: number; dibeli: number; omzetDibeli: number }>;
  perHari: Array<{ hari: string; unit: number }>;
  rinci: PromoFchRow[];
}

export interface BuildPromoFchInput {
  /** HANYA pesanan sah. */
  orders: PromoOrder[];
  items: PromoItem[];
  originOf: (order: PromoOrder) => PromoOrigin;
  /** Modal per unit untuk satu baris cover (HPP baris, atau HPP produk bila baris tidak punya). */
  hppOf: (item: PromoItem) => number;
  /** Draft Perlu Review berstatus pending. */
  drafts?: PromoDraft[];
  /** Semua hari periode (`YYYY-MM-DD`, WIB) supaya grafik tidak bolong. */
  dayKeys: string[];
  /** Selisih WIB terhadap UTC dalam ms (default 7 jam). */
  offsetMs?: number;
  statusLabel?: (status: string | null | undefined) => string;
}

const WIB_MS = 7 * 60 * 60 * 1000;

export function buildPromoFchReport(input: BuildPromoFchInput): PromoFchReport {
  const offset = input.offsetMs ?? WIB_MS;
  const wibDay = (iso: string) => new Date(new Date(iso).getTime() + offset).toISOString().slice(0, 10);
  const label = input.statusLabel ?? ((status) => String(status ?? "-"));

  const itemsByOrder = new Map<string, PromoItem[]>();
  for (const item of input.items || []) {
    const key = String(item.order_id ?? "");
    if (!key) continue;
    const list = itemsByOrder.get(key);
    if (list) list.push(item);
    else itemsByOrder.set(key, [item]);
  }

  const perAsal: Record<PromoOrigin, number> = { bot: 0, admin: 0, website: 0 };
  const perVarian = new Map<string, { gratis: number; dibeli: number; omzetDibeli: number }>();
  const perHari = new Map<string, number>(input.dayKeys.map((day) => [day, 0]));
  const rinci: PromoFchRow[] = [];
  let keluar = 0;
  let modal = 0;
  let modalTanpaData = 0;
  let dibeliUnit = 0;
  let dibeliOmzet = 0;

  for (const order of input.orders || []) {
    const lines = splitCoverLines(itemsByOrder.get(String(order.id)) || [], Number(order.discount) || 0);
    if (!lines.length) continue;

    let freeInOrder = 0;
    const variantNotes = new Map<string, number>();
    for (const line of lines) {
      const entry = perVarian.get(line.variant) || { gratis: 0, dibeli: 0, omzetDibeli: 0 };
      entry.gratis += line.free;
      entry.dibeli += line.paid;
      entry.omzetDibeli += line.paidRevenue;
      perVarian.set(line.variant, entry);

      dibeliUnit += line.paid;
      dibeliOmzet += line.paidRevenue;
      freeInOrder += line.free;
      if (line.free > 0) {
        variantNotes.set(line.variant, (variantNotes.get(line.variant) || 0) + line.free);
        const unitHpp = Number(input.hppOf(line.item)) || 0;
        if (unitHpp > 0) modal += unitHpp * line.free;
        else modalTanpaData += line.free;
      }
    }
    if (freeInOrder <= 0) continue;

    const origin = input.originOf(order);
    keluar += freeInOrder;
    perAsal[origin] += freeInOrder;
    const day = wibDay(order.created_at);
    perHari.set(day, (perHari.get(day) || 0) + freeInOrder);
    rinci.push({
      tanggal: order.created_at,
      nomorPesanan: String(order.order_number ?? order.id),
      pelanggan: String(order.customer_name ?? "").trim() || "-",
      unit: freeInOrder,
      varian: [...variantNotes.entries()].map(([name, qty]) => `${name} x${qty}`).join(", "),
      asal: origin,
      status: label(order.status),
    });
  }

  let menungguDraft = 0;
  let menungguUnit = 0;
  for (const draft of input.drafts || []) {
    const payload = draft.payload || {};
    const split = splitCoverLines(Array.isArray(payload.items) ? payload.items : [], Number(payload.discount) || 0);
    if (!split.length) continue;
    menungguDraft += 1;
    menungguUnit += split.reduce((sum, line) => sum + line.free, 0);
  }

  const urutVarian = [VARIAN_THOBE, VARIAN_KOKO, VARIAN_LAIN];
  return {
    keluar,
    nilaiDigratiskan: keluar * COVER_VALUE,
    modal,
    modalTanpaData,
    menunggu: { draft: menungguDraft, unit: menungguUnit },
    dibeli: { unit: dibeliUnit, omzet: dibeliOmzet },
    perAsal,
    perVarian: [...perVarian.entries()]
      .map(([varian, value]) => ({ varian, ...value }))
      .sort((a, b) => urutVarian.indexOf(a.varian) - urutVarian.indexOf(b.varian)),
    perHari: [...perHari.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([hari, unit]) => ({ hari, unit })),
    rinci: rinci.sort((a, b) => b.tanggal.localeCompare(a.tanggal)),
  };
}
