/**
 * Pemeriksaan bentrok SKU ke seluruh katalog — dipakai form produk admin/ops.
 *
 * Aturan database (index unik per tabel) hanya menjaga datanya tetap bersih; pesan yang
 * dilihat admin harus jelas, bukan "duplicate key value violates unique constraint".
 *
 * Aturan bentrok (SAMA dengan index di database):
 *  - perbandingan `upper(btrim(sku))` → "cvh-cto" == " CVH-CTO "
 *  - SKU kosong / null TIDAK dianggap bentrok
 *  - unik PER TABEL: SKU produk hanya bentrok dengan produk lain, SKU varian hanya
 *    dengan varian lain (produk 1-varian memang memakai SKU yang sama di kedua tabel)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface SkuClash {
  sku: string;
  /** "produk" | "varian" */
  kind: "produk" | "varian";
  /** Nama produk pemilik SKU (atau "produk / warna" untuk varian). */
  owner: string;
}

const norm = (value: unknown) => String(value ?? "").trim().toUpperCase();

/** SKU yang sudah dipakai produk LAIN (selain `exceptProductId`). */
export async function findProductSkuClashes(
  client: SupabaseClient,
  skus: (string | null | undefined)[],
  exceptProductId?: string | null
): Promise<SkuClash[]> {
  return findClashes(client, "products", skus, exceptProductId);
}

/** SKU yang sudah dipakai VARIAN lain (selain baris milik `exceptProductId`). */
export async function findVariantSkuClashes(
  client: SupabaseClient,
  skus: (string | null | undefined)[],
  exceptProductId?: string | null
): Promise<SkuClash[]> {
  return findClashes(client, "product_variants", skus, exceptProductId);
}

type SkuRow = {
  id?: string | null;
  product_id?: string | null;
  name?: string | null;
  color?: string | null;
  sku?: string | null;
};

async function findClashes(
  client: SupabaseClient,
  table: "products" | "product_variants",
  skus: (string | null | undefined)[],
  exceptProductId?: string | null
): Promise<SkuClash[]> {
  const wanted = [...new Set(skus.map(norm).filter(Boolean))];
  if (wanted.length === 0) return [];

  const select = table === "products" ? "id, name, sku" : "product_id, color, sku";
  const rows: SkuRow[] = [];

  // 1. Kandidat persis (`.in` peka huruf besar/kecil).
  const exact = await client.from(table).select(select).in("sku", wanted);
  if (exact.error) {
    console.error("[SKU] gagal memeriksa bentrok:", exact.error.message);
    return [];
  }
  rows.push(...((exact.data ?? []) as unknown as SkuRow[]));

  // 2. Kandidat longgar untuk SKU yang beda kapital/spasi (mis. " cvh-cto ").
  const found = new Set(rows.map((row) => norm(row.sku)));
  const missing = wanted.filter((sku) => !found.has(sku));
  if (missing.length > 0) {
    const filter = missing.map((sku) => `sku.ilike.${escapeIlike(sku)}`).join(",");
    const loose = await client.from(table).select(select).or(filter);
    if (!loose.error) rows.push(...((loose.data ?? []) as unknown as SkuRow[]));
  }

  const clashes: SkuClash[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const sku = norm(row.sku);
    if (!sku || !wanted.includes(sku)) continue;

    const productId = String(table === "products" ? row.id ?? "" : row.product_id ?? "");
    if (exceptProductId && productId === exceptProductId) continue;

    const key = `${sku}|${productId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    clashes.push({
      sku,
      kind: table === "products" ? "produk" : "varian",
      owner:
        table === "products"
          ? String(row.name ?? productId)
          : `${productId}${row.color ? ` / ${row.color}` : ""}`,
    });
  }
  return clashes;
}

/** Escape wildcard `%`/`_` supaya SKU dicocokkan apa adanya. */
function escapeIlike(value: string): string {
  return value.replace(/[%_\\]/g, (match) => `\\${match}`);
}

/** Pesan siap tampil untuk admin. */
export function skuClashMessage(clashes: SkuClash[]): string {
  return clashes
    .map((clash) => `SKU ${clash.sku} sudah dipakai ${clash.kind} "${clash.owner}".`)
    .join(" ");
}

/** Pesan dari error database kalau index unik tetap terpicu (mis. balapan dua admin). */
export function skuErrorFromDatabase(error: { message?: string; code?: string } | null): string | null {
  const message = String(error?.message ?? "");
  if (!message) return null;
  if (error?.code === "23505" && /sku/i.test(message)) {
    return "SKU sudah dipakai produk/varian lain. Gunakan SKU yang berbeda.";
  }
  return null;
}
