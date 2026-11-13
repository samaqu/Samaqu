/**
 * Harga reseller — SATU sumber aturan (dipakai katalog portal, pembuatan
 * pesanan, validasi harga jual, dan tab admin "Produk & Harga").
 *
 * - Produk/series hanya dijual kalau `products.reseller_enabled = true`
 *   (penyaringan baris dilakukan query, bukan di sini).
 * - Diskon efektif, urut prioritas: diskon KHUSUS per series (`products.reseller_discount_percent`)
 *   kalau diisi -> diskon KHUSUS reseller (`resellers.discount_percent`) kalau diisi -> diskon DEFAULT
 *   pengaturan reseller. Kosong/null di tiap tingkat berarti turun ke tingkat berikutnya.
 * - Harga beli = harga katalog × (1 − diskon efektif/100), dibulatkan ke rupiah.
 * - Batas harga jual (SATU sumber, `resellerMinSellInfo`):
 *   · `reseller_min_sell_price` kosong/null → harga katalog SAMAQU.
 *   · kolom diisi → nilai itu, tetapi tidak pernah di bawah harga beli reseller.
 *   Tidak ada batas atas; pesanan lama tidak berubah.
 */

export interface ResellerPriceable {
  price: number;
  /** Diskon khusus series (persen). NULL/kosong = pakai diskon default. */
  reseller_discount_percent?: number | string | null;
  /** Batas minimum harga jual khusus reseller. */
  reseller_min_sell_price?: number | null;
}

export type ResellerMinSellSource = "catalog" | "configured" | "buy";

export interface ResellerMinSellInfo {
  value: number;
  source: ResellerMinSellSource;
  /** Teks sumber untuk UI ("harga katalog SAMAQU", dst.). */
  reason: string;
  /** Pesan lengkap untuk error server/UI. */
  message: string;
}

/** Diskon dipotong ke rentang wajar 0–100. */
export function clampDiscount(value: number): number {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}

/** Persen diskon khusus (0–100); null/NaN dianggap 0. */
export function discountPercent(value?: number | string | null): number {
  return clampDiscount(Number(value));
}

const isBlank = (value: unknown): boolean => value === null || value === undefined || String(value).trim() === "";

/**
 * Diskon yang benar-benar dipakai: khusus series kalau ada, lalu khusus reseller kalau ada, selain itu default.
 * `resellerPercent` = `resellers.discount_percent` (null/kosong = ikut default).
 */
export function effectiveDiscountPercent(
  product: ResellerPriceable,
  defaultPercent: number,
  resellerPercent?: number | string | null
): number {
  const raw = product?.reseller_discount_percent;
  if (!isBlank(raw)) return clampDiscount(Number(raw));
  if (!isBlank(resellerPercent)) return clampDiscount(Number(resellerPercent));
  return clampDiscount(Number(defaultPercent));
}

/**
 * Diskon DASAR yang dilihat reseller di Beranda (tanpa melihat series tertentu): diskon khusus reseller
 * kalau diisi admin, selain itu diskon default. `sumber` memberi tahu apakah angkanya khusus untuk dia.
 * Diskon khusus per series bisa menimpa angka ini di Katalog/pesanan (aturan di `effectiveDiscountPercent`).
 */
export function resellerBaseDiscount(
  defaultPercent: number,
  resellerPercent?: number | string | null
): { persen: number; sumber: "khusus" | "standar" } {
  const persen = effectiveDiscountPercent({ price: 0 }, defaultPercent, resellerPercent);
  return { persen, sumber: isBlank(resellerPercent) ? "standar" : "khusus" };
}

/**
 * Baca isian diskon dari admin: kosong -> null (ikut default), angka 0-100 dibulatkan 2 desimal,
 * selain itu tidak valid.
 */
export function parseResellerDiscount(input: unknown): { ok: true; value: number | null } | { ok: false } {
  if (input === null || input === undefined || String(input).trim() === "") return { ok: true, value: null };
  const value = Number(String(input).trim().replace(",", "."));
  if (!Number.isFinite(value) || value < 0 || value > 100) return { ok: false };
  return { ok: true, value: Math.round(value * 100) / 100 };
}

/** Harga beli reseller = harga katalog dipotong diskon efektif, dibulatkan. */
export function resellerBuyPrice(
  product: ResellerPriceable,
  defaultPercent: number,
  resellerPercent?: number | string | null
): number {
  const base = Math.round(Number(product.price) || 0);
  return Math.round(base * (1 - effectiveDiscountPercent(product, defaultPercent, resellerPercent) / 100));
}

const MIN_SELL_REASON: Record<ResellerMinSellSource, string> = {
  catalog: "harga katalog SAMAQU",
  configured: "batas harga dari SAMAQU",
  buy: "sama dengan harga beli kamu",
};

/**
 * Batas bawah harga jual + sumbernya — SATU sumber untuk server, katalog,
 * form Buat Pesanan, dan tab admin. Jangan menulis ulang rumus ini di tempat lain.
 */
export function resellerMinSellInfo(
  product: ResellerPriceable,
  defaultPercent: number,
  resellerPercent?: number | string | null
): ResellerMinSellInfo {
  const buyPrice = resellerBuyPrice(product, defaultPercent, resellerPercent);
  const catalogPrice = Math.round(Number(product.price) || 0);
  const stored = Math.round(Number(product.reseller_min_sell_price) || 0);

  let value = catalogPrice;
  let source: ResellerMinSellSource = "catalog";
  if (stored > 0) {
    if (stored < buyPrice) {
      value = buyPrice;
      source = "buy";
    } else {
      value = stored;
      source = "configured";
    }
  }

  const reason = MIN_SELL_REASON[source];
  return {
    value,
    source,
    reason,
    message: `Harga jual minimal Rp ${value.toLocaleString("id-ID")} (${reason})`,
  };
}

/** Batas bawah harga jual reseller (angka saja) — lihat `resellerMinSellInfo`. */
export function resellerMinSellPrice(
  product: ResellerPriceable,
  defaultPercent: number,
  resellerPercent?: number | string | null
): number {
  return resellerMinSellInfo(product, defaultPercent, resellerPercent).value;
}
