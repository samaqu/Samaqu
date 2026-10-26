import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, unauthorized, stockStatus } from "@/lib/ops-auth";
import { ownSizeMap, resolveStock } from "@/lib/ops-stock";
import { compareOpsRows, variantSortKey } from "@/lib/ops-order";

/**
 * Varian stok untuk dashboard internal.
 * Mengikuti entity `ProductVariant` Base44: satu baris = satu (produk, warna)
 * dengan `stock` berupa map ukuran { XS: n, S: n, ... }.
 * Sumbernya tabel `product_variants` milik website — baris (warna × ukuran)
 * dikelompokkan kembali jadi map, jadi stoknya identik dengan yang dijual.
 *
 * Catatan penting soal stok bersama ala series: baris yang punya
 * `base_product_id` menumpang stok produk lain. Tulis varian di sini
 * mempertahankan kolom itu apa adanya — yang berubah hanya `stock`.
 */

const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

/** Key `id` di entity Base44 = gabungan produk + warna (bukan uuid baris). */
const groupKey = (productId: string, color: string) => `${productId}||${color}`;
const parseGroupKey = (id: string) => {
  const [productId, color] = String(id || "").split("||");
  return productId && color ? { productId, color } : null;
};

function normalizeStockMap(stock: unknown): Record<string, number> {
  const src = (stock && typeof stock === "object" ? stock : {}) as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const size of SIZES) out[size] = Number(src[size]) || 0;
  return out;
}

type Admin = ReturnType<typeof getSupabaseAdmin>;

/** Tulis satu kelompok (produk, warna): ukuran yang sudah ada diperbarui,
 *  ukuran yang belum ada ditambahkan. `base_product_id`/`base_size` tidak disentuh. */
async function writeVariantGroup(
  admin: Admin,
  productId: string,
  color: string,
  stock: unknown,
  hex?: string | null,
) {
  const stok = normalizeStockMap(stock);
  const { data: existing, error } = await admin
    .from("product_variants")
    .select("id, size")
    .eq("product_id", productId)
    .eq("color", color);
  if (error) throw new Error(error.message);

  const bySize = new Map((existing || []).map((r) => [String(r.size).toUpperCase(), r.id]));

  const updates: { id: string; stock: number }[] = [];
  const inserts: Record<string, unknown>[] = [];
  SIZES.forEach((size, index) => {
    const id = bySize.get(size);
    if (id) {
      updates.push({ id, stock: stok[size] });
      return;
    }
    // Ukuran yang belum punya baris hanya dibuat kalau ada stoknya. Baris 0 untuk
    // ukuran yang tidak dijual bikin ukuran itu ikut tampil di website.
    if (stok[size] > 0) {
      inserts.push({
        product_id: productId,
        color,
        size,
        stock: stok[size],
        hex: hex ?? null,
        display_order: index,
      });
    }
  });

  for (const u of updates) {
    const { error: e } = await admin.from("product_variants").update({ stock: u.stock }).eq("id", u.id);
    if (e) throw new Error(e.message);
  }
  if (inserts.length > 0) {
    const { error: e } = await admin.from("product_variants").insert(inserts);
    if (e) throw new Error(e.message);
  }
  return updates.length + inserts.length;
}

/** Nama series disimpan per PRODUK (`products.series`), bukan per varian. */
async function syncProductSeries(admin: Admin, productId: string, seriesName?: string) {
  const series = String(seriesName || "").trim();
  if (!series) return;
  const { error } = await admin.from("products").update({ series }).eq("id", productId);
  if (error) throw new Error(error.message);
}

export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const admin = getSupabaseAdmin();
  const [{ data: products }, { data: rows }] = await Promise.all([
    // `weight` = berat produk (gram), fallback kalau berat per ukuran kosong.
    // Kolom `open_order_*` + `minimum_price`/`create_your_price_enabled` ikut dibaca supaya form
    // Ubah Transaksi bisa memakai JALUR HARGA OPEN ORDER untuk pesanan CYO (bukan harga katalog).
    admin
      .from("products")
      .select(
        "id, name, series, price, minimum_price, create_your_price_enabled, open_order_enabled, open_order_price, open_order_minimum_price, open_order_cyp_enabled, hpp, category, weight, jenis_kain(name)",
      ),
    // `weight` = berat per ukuran (gram) — sumber utama yang sama dengan cek ongkir & resi.
    admin.from("product_variants").select("product_id, color, size, stock, sku, price_override, hex, display_order, base_product_id, weight"),
  ]);

  const byId: Record<string, any> = {};
  for (const p of products || []) byId[p.id] = p;

  // Stok bersama ala series: baris ber-`base_product_id` menumpang stok produk basis.
  // Resolusinya sama dengan /api/ops/products supaya angka di Laporan Stok = Daftar Produk.
  const resolution = resolveStock((rows || []) as any);

  const grouped: Record<string, any> = {};
  for (const r of rows || []) {
    const key = groupKey(r.product_id, r.color || "default");
    if (!grouped[key]) {
      const prod = byId[r.product_id] || {};
      const baseId = resolution.baseLink[r.product_id] || null;
      grouped[key] = {
        id: key,
        product_id: r.product_id,
        product_name: prod.name || r.product_id,
        series_name: prod.series || "",
        category: prod.category || null,
        jenis_kain_name: prod.jenis_kain?.name || null,
        color: r.color || "default",
        hex: r.hex || null,
        price: prod.price ?? 0,
        // Jalur harga Open Order (kolom `open_order_*` menang atas katalog) + padanan katalognya.
        // Form Ubah Transaksi memilih jalur sesuai sumber pesanan: CYO → Open Order, lainnya → katalog.
        minimum_price: prod.minimum_price ?? null,
        create_your_price_enabled: prod.create_your_price_enabled ?? null,
        open_order_enabled: prod.open_order_enabled ?? null,
        open_order_price: prod.open_order_price ?? null,
        open_order_minimum_price: prod.open_order_minimum_price ?? null,
        open_order_cyp_enabled: prod.open_order_cyp_enabled ?? null,
        hpp: prod.hpp ?? 0,
        stock: {},
        /** SKU per ukuran (baris `product_variants`), dipakai form Barang Masuk. */
        skus: {},
        /** Harga per ukuran (price_override → fallback harga produk). */
        prices: {},
        /** Berat per ukuran (gram) — dipakai ringkasan transaksi supaya angkanya sama
         *  dengan perhitungan ongkir/resi (varian → produk). */
        weights: {},
        product_weight: Number(prod.weight) || 0,
        // Terisi hanya kalau varian ini menumpang stok produk lain (series turunan).
        base_product_id: baseId,
        base_product_name: baseId ? byId[baseId]?.name || baseId : null,
        // Nama SERIES basis — dipakai di layar supaya sama dengan panel admin
        // ("Bayati mengikuti Jiharkah"), bukan nama produk yang dipakai bersama.
        base_series_name: baseId ? byId[baseId]?.series || null : null,
      };
    }
    const size = (r.size || "").toUpperCase();
    if (size) {
      grouped[key].stock[size] = Number(r.stock) || 0;
      grouped[key].skus[size] = String(r.sku || "").trim();
      const override = Number(r.price_override);
      grouped[key].prices[size] = override > 0 ? override : Number(grouped[key].price) || 0;
    }
    const weight = Number(r.weight) || 0;
    if (size && weight > 0) grouped[key].weights[size] = weight;
  }

  const items = Object.values(grouped).map((v: any) => {
    const total = Object.values(v.stock).reduce((a: number, b: any) => a + (Number(b) || 0), 0);
    // Stok efektif: varian turunan memakai stok basisnya (per ukuran), bukan stoknya yang 0.
    const efektifMap = v.base_product_id ? ownSizeMap(resolution, v.base_product_id) : { ...v.stock };
    const totalEfektif = Object.values(efektifMap).reduce((a: number, b: any) => a + (Number(b) || 0), 0);
    return {
      ...v,
      stock_efektif: efektifMap,
      status: stockStatus(total),
      status_efektif: stockStatus(totalEfektif),
    };
  });

  // Urutan tampil pakai aturan bersama dengan Daftar Produk: kategori → jenis kain (A-Z)
  // → warna → series urut tetap. Lihat src/lib/ops-order.ts.
  items.sort((a, b) => compareOpsRows(variantSortKey(a), variantSortKey(b)));

  return NextResponse.json({ items });
}

/** Tambah varian baru (satu baris = satu kombinasi produk + warna). */
export async function POST(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  try {
    const body = await req.json();
    const rows: any[] = Array.isArray(body?.rows) ? body.rows : [];
    if (rows.length === 0) return NextResponse.json({ saved: 0 });

    const admin = getSupabaseAdmin();
    let saved = 0;
    for (const row of rows) {
      const productId = String(row?.product_id || "").trim();
      if (!productId) return NextResponse.json({ error: "product_id wajib" }, { status: 400 });
      const color = String(row?.color || "default").trim() || "default";
      saved += await writeVariantGroup(admin, productId, color, row?.stock, row?.hex ?? null);
      if (row?.series_name) await syncProductSeries(admin, productId, row.series_name);
    }
    return NextResponse.json({ saved });
  } catch (e) {
    console.error("[OPS] product-variants POST:", e);
    return NextResponse.json({ error: "Gagal menyimpan varian" }, { status: 500 });
  }
}

/** Update varian: `id` = "product_id||color" (bentuk entity Base44). */
export async function PATCH(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  try {
    const body = await req.json();
    const rows: any[] = Array.isArray(body?.rows) ? body.rows : [];
    if (rows.length === 0) return NextResponse.json({ saved: 0 });

    const admin = getSupabaseAdmin();
    let saved = 0;
    for (const row of rows) {
      const parsed = parseGroupKey(row?.id);
      if (!parsed) return NextResponse.json({ error: "id varian tidak valid" }, { status: 400 });
      const { productId, color: oldColor } = parsed;
      const newColor = String(row?.color || oldColor).trim() || oldColor;

      // Produk yang menumpang stok (stok bersama ala series) tidak boleh ditulis
      // stoknya sendiri — angka stoknya hidup di produk basisnya.
      const { data: groupRows, error: readErr } = await admin
        .from("product_variants")
        .select("id, base_product_id")
        .eq("product_id", productId)
        .eq("color", oldColor);
      if (readErr) throw new Error(readErr.message);
      const derived = (groupRows || []).some((r) => r.base_product_id);

      // Warna diganti: pindahkan seluruh baris ukuran ke warna baru dulu.
      if (newColor !== oldColor) {
        const { error } = await admin
          .from("product_variants")
          .update({ color: newColor })
          .eq("product_id", productId)
          .eq("color", oldColor);
        if (error) throw new Error(error.message);
      }

      if (!derived) {
        saved += await writeVariantGroup(admin, productId, newColor, row?.stock, row?.hex ?? null);
      }
      if (row?.series_name) await syncProductSeries(admin, productId, row.series_name);
    }
    return NextResponse.json({ saved });
  } catch (e) {
    console.error("[OPS] product-variants PATCH:", e);
    return NextResponse.json({ error: "Gagal mengubah varian" }, { status: 500 });
  }
}

/** Hapus varian: `{ product_id, id: { $in: ["produk||warna", ...] } }` */
export async function DELETE(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  try {
    const body = await req.json().catch(() => null);
    const admin = getSupabaseAdmin();

    const ids: string[] = Array.isArray(body?.id?.$in)
      ? body.id.$in
      : Array.isArray(body?.ids)
        ? body.ids
        : [];
    const pairs = ids.map(parseGroupKey).filter(Boolean) as { productId: string; color: string }[];

    if (pairs.length === 0) {
      const productId = String(body?.product_id || "").trim();
      if (!productId) return NextResponse.json({ error: "product_id wajib" }, { status: 400 });
      const { error, count } = await admin
        .from("product_variants")
        .delete({ count: "exact" })
        .eq("product_id", productId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ deleted: count ?? 0 });
    }

    let deleted = 0;
    for (const { productId, color } of pairs) {
      const { error, count } = await admin
        .from("product_variants")
        .delete({ count: "exact" })
        .eq("product_id", productId)
        .eq("color", color);
      if (error) throw new Error(error.message);
      deleted += count ?? 0;
    }
    return NextResponse.json({ deleted });
  } catch (e) {
    console.error("[OPS] product-variants DELETE:", e);
    return NextResponse.json({ error: "Gagal menghapus varian" }, { status: 500 });
  }
}
