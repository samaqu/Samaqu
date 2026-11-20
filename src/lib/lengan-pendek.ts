import type { SupabaseClient } from "@supabase/supabase-js";
import { skuErrorFromDatabase } from "./sku-unique";

/**
 * Model "Lengan Panjang / Lengan Pendek" untuk produk Koko.
 *
 * Aturan (sama dengan stok sharing Thobe, supaya semua logika stok yang sudah jalan tidak berubah):
 *  - Produk Koko yang sudah ada = Lengan Panjang = produk utama dan pemegang stok.
 *  - Lengan Pendek = SATU baris produk turunan: `is_published = false` (tidak jadi kartu sendiri
 *    di katalog) dan varian-variannya bertanda `base_product_id` = produk utama, stok 0 (stok ikut
 *    produk utama per warna & ukuran).
 *  - Foto tidak disalin: halaman detail selalu memakai foto produk utama.
 *  - Harga model terpisah di baris turunan; kosong = sama dengan produk utama.
 *
 * File ini dipakai form admin (baca status + sinkron saat simpan). Halaman detail customer memakai
 * `getLenganPendekModel` di `db.ts` yang hanya membaca.
 */

export const LENGAN_PANJANG = "Lengan Panjang";
export const LENGAN_PENDEK = "Lengan Pendek";
const SKU_SUFFIX = "-LP";

/** ID baris turunan yang dibuat untuk satu produk utama. */
export function lenganPendekId(parentId: string): string {
  return `${parentId}-lengan-pendek`;
}

/** Nama baris turunan: nama produk utama + "Lengan Pendek" (tampil di keranjang, pesanan, label). */
export function lenganPendekName(parentName: string): string {
  const base = String(parentName || "").trim();
  if (base.toLowerCase().endsWith(LENGAN_PENDEK.toLowerCase())) return base;
  return `${base} ${LENGAN_PENDEK}`.trim();
}

interface DerivedLink {
  id: string;
  price: number;
  /** Ada minimal satu varian turunan yang masih dijual. */
  active: boolean;
}

/** Cari baris turunan Lengan Pendek milik produk utama (lewat `base_product_id` pada varian). */
async function findDerived(client: SupabaseClient, parentId: string): Promise<DerivedLink | null> {
  const { data: links, error } = await client
    .from("product_variants")
    .select("product_id, is_sellable")
    .eq("base_product_id", parentId);
  if (error || !links || links.length === 0) return null;

  const ids = [
    ...new Set(
      (links as { product_id: string }[]).map((row) => row.product_id).filter((id) => id && id !== parentId),
    ),
  ];
  if (ids.length === 0) return null;

  const { data: rows } = await client
    .from("products")
    .select("id, price")
    .in("id", ids)
    .eq("category", "Koko")
    .order("created_at", { ascending: true })
    .limit(1);
  const row = rows?.[0] as { id: string; price: number } | undefined;
  if (!row) return null;

  const active = (links as { product_id: string; is_sellable: boolean | null }[]).some(
    (v) => v.product_id === row.id && v.is_sellable !== false,
  );
  return { id: row.id, price: Number(row.price) || 0, active };
}

export interface LenganPendekState {
  /** Model Lengan Pendek sedang aktif untuk produk ini. */
  enabled: boolean;
  /** Harga khusus Lengan Pendek (teks form); kosong = sama dengan Lengan Panjang. */
  price: string;
}

/** Status Lengan Pendek untuk form edit. Gagal baca = anggap tidak aktif (form tetap jalan). */
export async function loadLenganPendekState(
  client: SupabaseClient,
  parentId: string,
  parentPrice: number | null,
): Promise<LenganPendekState> {
  try {
    const derived = await findDerived(client, parentId);
    if (!derived) return { enabled: false, price: "" };
    const differs = derived.price > 0 && derived.price !== Number(parentPrice);
    return { enabled: derived.active, price: differs ? String(derived.price) : "" };
  } catch {
    return { enabled: false, price: "" };
  }
}

/**
 * Sinkronkan baris turunan Lengan Pendek dengan produk utama (dipanggil SETELAH produk utama
 * dan variannya tersimpan).
 *  - aktif: baris produk + varian turunan dibuat/diperbarui mengikuti produk utama (warna, ukuran,
 *    berat, SKU). Stok turunan selalu 0 (ikut produk utama).
 *  - nonaktif: varian turunan ditandai tidak dijual (`is_sellable = false`), TIDAK dihapus, karena
 *    pesanan lama masih bisa merujuknya.
 * Melempar Error berisi pesan yang bisa dibaca admin.
 */
export async function syncLenganPendek(
  client: SupabaseClient,
  opts: { parentId: string; enabled: boolean; priceInput: string },
): Promise<void> {
  const { parentId, enabled, priceInput } = opts;

  const { data: parent, error: parentError } = await client
    .from("products")
    .select("*")
    .eq("id", parentId)
    .maybeSingle();
  if (parentError || !parent) throw new Error("produk utama tidak ditemukan");
  if (parent.category !== "Koko") return;

  const existing = await findDerived(client, parentId);
  const derivedId = existing?.id ?? lenganPendekId(parentId);

  if (!enabled) {
    if (existing) {
      const { error } = await client
        .from("product_variants")
        .update({ is_sellable: false })
        .eq("product_id", derivedId);
      if (error) throw new Error(error.message);
    }
    return;
  }

  const { data: parentVariants, error: variantError } = await client
    .from("product_variants")
    .select("*")
    .eq("product_id", parentId)
    .order("display_order");
  if (variantError) throw new Error(variantError.message);

  const sellable = (parentVariants || []).filter(
    (v: { is_sellable?: boolean | null }) => v.is_sellable !== false,
  );
  if (sellable.length === 0) throw new Error("produk utama belum punya varian warna/ukuran");

  const typedPrice = parseInt(String(priceInput || "").trim(), 10);
  const row: Record<string, unknown> = {
    id: derivedId,
    name: lenganPendekName(parent.name),
    category: parent.category,
    description: parent.description ?? null,
    price: Number.isFinite(typedPrice) && typedPrice > 0 ? typedPrice : parent.price,
    minimum_price: parent.minimum_price ?? null,
    recommended_price: parent.recommended_price ?? null,
    create_your_price_enabled: parent.create_your_price_enabled ?? false,
    image: parent.image || "",
    images: parent.images ?? [],
    colors: parent.colors ?? [],
    jenis_kain_id: parent.jenis_kain_id ?? null,
    series: parent.series ?? null,
    catatan_harga: parent.catatan_harga ?? null,
    badge_type: null,
    open_order_enabled: false,
    // Tidak jadi kartu sendiri: halaman detail Lengan Panjang yang menawarkannya sebagai pilihan.
    is_published: false,
    sku: parent.sku ? `${parent.sku}${SKU_SUFFIX}` : null,
  };
  // Kolom opsional: hanya disalin kalau kolomnya memang ada di tabel.
  if (parent.weight) row.weight = parent.weight;
  if ("kain" in parent) row.kain = parent.kain ?? null;
  if ("hpp" in parent) row.hpp = parent.hpp;
  if ("product_type" in parent) row.product_type = parent.product_type;
  if ("promo_fch_enabled" in parent) row.promo_fch_enabled = false;

  const { error: productError } = await client.from("products").upsert(row, { onConflict: "id" });
  if (productError) throw new Error(skuErrorFromDatabase(productError) ?? productError.message);

  const variantRows = sellable.map(
    (v: {
      color: string;
      hex: string | null;
      size: string;
      weight: number | null;
      price_override: number | null;
      sku: string | null;
      display_order: number | null;
    }) => ({
      product_id: derivedId,
      color: v.color,
      hex: v.hex ?? null,
      size: v.size,
      stock: 0,
      // Berat kosong = jangan sentuh kolom (nilai lama tetap).
      ...(v.weight ? { weight: v.weight } : {}),
      // Harga Lengan Pendek mengikuti `products.price` barisnya (itu yang divalidasi server saat
      // checkout), jadi harga khusus per ukuran milik Lengan Panjang tidak disalin.
      price_override: null,
      sku: v.sku ? `${v.sku}${SKU_SUFFIX}` : null,
      display_order: v.display_order ?? 0,
      base_product_id: parentId,
      base_size: v.size,
      is_sellable: true,
    }),
  );
  const { error: upsertError } = await client
    .from("product_variants")
    .upsert(variantRows, { onConflict: "product_id,color,size" });
  if (upsertError) throw new Error(skuErrorFromDatabase(upsertError) ?? upsertError.message);

  // Ukuran/warna yang sudah dicabut dari produk utama: turunannya dipensiunkan, bukan dihapus.
  const keep = new Set(variantRows.map((r: { color: string; size: string }) => `${r.color}|${r.size}`));
  const { data: derivedVariants } = await client
    .from("product_variants")
    .select("id, color, size")
    .eq("product_id", derivedId);
  const retireIds = (derivedVariants || [])
    .filter((v: { color: string; size: string }) => !keep.has(`${v.color}|${v.size}`))
    .map((v: { id: string }) => v.id);
  if (retireIds.length > 0) {
    const { error } = await client.from("product_variants").update({ is_sellable: false }).in("id", retireIds);
    if (error) throw new Error(error.message);
  }
}
