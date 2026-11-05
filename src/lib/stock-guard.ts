/**
 * Pengaman stok untuk jalur pesanan (checkout website, Open Order, Promo FCH, ops).
 *
 * Dua hal yang dijaga di sini:
 *
 * 1. **Item tanpa warna/ukuran.** Dulu item seperti ini langsung `continue` — dianggap
 *    "produk tidak dilacak stoknya" — padahal sering kali produknya PUNYA varian dan
 *    pengirimnya saja yang lupa mengisi nama paketnya (kasus `addon-cover-hanger`).
 *    Sekarang: hanya dilewati kalau produknya benar-benar tidak punya baris varian.
 *
 * 2. **Pesan gagal yang membedakan penyebab.** "stok tidak cukup" dan "varian tidak
 *    ditemukan" butuh tindakan admin yang berbeda, jadi tidak boleh disamakan.
 *
 * Fungsi di sini TIDAK memotong stok; pemotongan tetap lewat RPC `samaqu_decrement_stock`
 * supaya atomik (row lock). Helper ini hanya memutuskan boleh/tidak dan mencatat anomali.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type DbFailureReason =
  | "variant_not_found"
  | "no_variants"
  | "phantom_product"
  | "insufficient_stock"
  | "component_out_of_stock"
  | "component_variant_not_found"
  | "component_none_configured";

/**
 * Kumpulan kunci varian yang sudah TIDAK dijual (`product_variants.is_sellable = false`).
 *
 * Dipakai checkout untuk menolak keranjang lama yang masih berisi varian pensiun
 * (mis. "Set Hanger + Cover" setelah cover dipecah). Pesanan lama tidak terpengaruh —
 * pemeriksaan ini hanya jalan untuk checkout baru.
 */
export type SellableMap = Set<string>;

function variantKey(productId: string, color: string, size: string): string {
  return `${String(productId ?? "").trim()}|${String(color ?? "").trim().toLowerCase()}|${String(size ?? "").trim().toLowerCase()}`;
}

/** Baca semua varian pensiun untuk produk-produk ini. Gagal baca → himpunan kosong. */
export async function loadSellableVariants(
  client: SupabaseClient,
  productIds: string[]
): Promise<SellableMap> {
  const blocked: SellableMap = new Set();
  if (productIds.length === 0) return blocked;

  const { data, error } = await client
    .from("product_variants")
    .select("product_id, color, size, is_sellable")
    .in("product_id", productIds);

  if (error) {
    console.error("[STOCK] Gagal membaca is_sellable:", error.message);
    return blocked;
  }

  for (const row of (data ?? []) as { product_id: string; color: string | null; size: string | null; is_sellable: boolean | null }[]) {
    if (row.is_sellable === false) blocked.add(variantKey(row.product_id, row.color ?? "", row.size ?? ""));
  }
  return blocked;
}

/** True kalau varian ini MASIH dijual (atau tidak dikenal — dianggap boleh, dicek jalur lain). */
export function isSellableVariant(
  productId: string,
  color: string | null | undefined,
  size: string | null | undefined,
  blocked: SellableMap
): boolean {
  return !blocked.has(variantKey(productId, color ?? "", size ?? ""));
}

/**
 * Apakah item ini boleh dilewati dari pemeriksaan stok?
 *
 * Hanya kalau produknya memang tidak punya satu pun baris `product_variants`.
 * Kalau produknya punya varian, item tanpa warna/ukuran adalah data rusak dan harus
 * ditolak — bukan dilewati diam-diam.
 */
export async function canSkipStockCheck(
  client: SupabaseClient,
  productId: string
): Promise<{ skip: boolean; hasVariants: boolean }> {
  const { data, error } = await client
    .from("product_variants")
    .select("product_id")
    .eq("product_id", productId)
    .limit(1);

  if (error) {
    // Tidak bisa memastikan → jangan dilewati (lebih aman diperiksa).
    return { skip: false, hasVariants: true };
  }

  const hasVariants = Array.isArray(data) && data.length > 0;
  return { skip: !hasVariants, hasVariants };
}

/** Catat anomali stok. Tidak pernah melempar — kegagalan catat tidak boleh menggagalkan order. */
export async function recordStockAnomaly(
  client: SupabaseClient,
  row: {
    productId: string | null;
    color: string | null;
    size: string | null;
    qty: number;
    reason: string;
    orderId?: string | null;
    source: string;
  }
): Promise<void> {
  try {
    await client.from("stock_anomaly_log").insert({
      product_id: row.productId,
      color: row.color ?? "",
      size: row.size ?? "",
      qty: row.qty,
      reason: row.reason,
      order_id: row.orderId ?? null,
      source: row.source,
    });
  } catch (error) {
    console.error("[STOCK-ANOMALY] gagal mencatat:", error);
  }
}

/** Pesan untuk admin — dibedakan menurut penyebab (poin 4 brief). */
export function stockFailureMessage(
  reason: DbFailureReason | string,
  name: string,
  color: string,
  size: string
): string {
  const variant = `${color || "-"} / ${size || "-"}`;
  switch (reason) {
    case "variant_not_found":
      return `Varian "${name}" (${variant}) tidak ditemukan di data stok. Periksa nama warna/ukuran produk ini di menu Produk.`;
    case "no_variants":
      return `Produk "${name}" belum punya data varian stok, jadi tidak bisa diperiksa stoknya. Lengkapi varian produknya dulu.`;
    case "phantom_product":
      return `Produk "${name}" tidak terdaftar sebagai produk (hanya penanda add-on lama), jadi tidak bisa dipotong stoknya.`;
    // Varian tanpa stok sendiri: penyebabnya selalu komponennya, bukan stok varian ini.
    case "component_out_of_stock":
      return `Stok komponen "${name}" (${variant}) tidak mencukupi — Cover atau Hanger-nya habis. Silakan pilih varian lain.`;
    case "component_variant_not_found":
      return `Komponen untuk "${name}" (${variant}) belum punya data stok. Periksa stok Cover dan Hanger di menu Produk.`;
    case "component_none_configured":
      return `Varian "${name}" (${variant}) belum punya komponen terdaftar, jadi tidak bisa dipesan. Hubungi admin.`;
    default:
      return `Stok "${name}" (${variant}) tidak mencukupi. Silakan kurangi jumlah atau pilih varian lain.`;
  }
}

/** Ambil penyebab gagal dari DB; `null` kalau tidak bisa dipastikan. */
export async function resolveFailureReason(
  client: SupabaseClient,
  productId: string,
  color: string,
  size: string
): Promise<DbFailureReason | null> {
  try {
    const { data, error } = await client.rpc("samaqu_stock_failure_reason", {
      p_product_id: productId,
      p_color: color,
      p_size: size,
    });
    if (error) return null;
    return (data as DbFailureReason) ?? null;
  } catch {
    return null;
  }
}

/**
 * Tangkap penanda `STOCK_ANOMALY:<json>` dari pesan error RPC SQL lalu catat ke log.
 * Dipakai setelah transaksi SQL gagal (rollback), karena tulisan log di dalam transaksi
 * ikut hilang.
 */
export async function recordAnomalyFromError(
  client: SupabaseClient,
  message: string,
  source: string,
  orderId?: string | null
): Promise<void> {
  const marker = "STOCK_ANOMALY:";
  const at = message.indexOf(marker);
  if (at < 0) return;

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(message.slice(at + marker.length)) as Record<string, unknown>;
  } catch {
    return;
  }

  await recordStockAnomaly(client, {
    productId: (parsed.product_id as string) ?? null,
    color: (parsed.color as string) ?? "",
    size: (parsed.size as string) ?? "",
    qty: Number(parsed.qty) || 0,
    reason: String(parsed.reason ?? "unknown"),
    orderId: orderId ?? (parsed.order_id as string) ?? null,
    source,
  });
}

/** Buang penanda dari pesan error sebelum ditampilkan ke pengguna. */
export function cleanErrorMessage(message: string): string {
  const at = message.indexOf("STOCK_ANOMALY:");
  return at >= 0 ? message.slice(0, at).trim() : message;
}
