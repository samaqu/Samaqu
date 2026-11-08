import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, unauthorized, stockStatus } from "@/lib/ops-auth";
import { compareOpsRows, productSortKey } from "@/lib/ops-order";
import { isVideoUrl } from "@/lib/product-thumbnail";

/**
 * Produk untuk dashboard internal.
 * Bentuk yang dikembalikan mengikuti entity `Product` app Base44:
 * { sku, name, hpp, price, stock, initial_stock, status, product_type }
 * datanya dibaca dari tabel `products` + total stok dari `product_variants`
 * (tabel yang sama dipakai website, jadi stoknya satu sumber).
 */

const PRODUCT_FIELDS = [
  "sku",
  "name",
  "hpp",
  "price",
  "initial_stock",
  "product_type",
  "status_stok",
  "category",
  "series",
  "jenis_kain_id",
  "colors",
  "image",
  "weight",
  "is_published",
] as const;

async function withTotals(admin: ReturnType<typeof getSupabaseAdmin>, products: any[]) {
  // `base_product_id` = stok bersama ala series: series turunan tidak memegang stoknya
  // sendiri, stoknya milik produk basis (perilaku yang sama dipakai `samaqu_decrement_stock`).
  // Jadi stok yang benar-benar bisa dijual = stok produk basisnya.
  const { data: variants } = await admin
    .from("product_variants")
    .select("product_id, color, size, stock, base_product_id, track_stock, is_sellable");

  /*
   * Stok EFEKTIF dihitung database lewat fungsi yang sama dengan checkout:
   * stok sendiri → induk sharing → MIN stok komponen.
   *
   * Dua penyaringan:
   *  - `is_sellable = false` tidak dihitung sama sekali (varian pensiun, mis. Set Hanger + Cover)
   *  - `track_stock = false` tidak dijumlahkan ke total gudang (stoknya milik KOMPONENNYA;
   *    kalau ikut dijumlah, hanger terhitung dua kali)
   */
  const effectiveMap = new Map<string, number>();
  {
    const { data: eff, error } = await admin.rpc("samaqu_effective_stock_map");
    if (error) console.error("[OPS-PRODUCTS] gagal memuat stok efektif:", error.message);
    for (const row of (eff ?? []) as { product_id: string; color: string | null; size: string | null; effective_stock: number | null }[]) {
      const key = `${row.product_id}|${String(row.color ?? "").trim().toLowerCase()}|${String(row.size ?? "").trim().toLowerCase()}`;
      effectiveMap.set(key, Number(row.effective_stock) || 0);
    }
  }

  const ownStock: Record<string, number> = {};
  const baseLink: Record<string, string> = {};
  for (const v of variants || []) {
    if (v.is_sellable === false) continue;
    if (v.base_product_id) {
      baseLink[v.product_id] = v.base_product_id;
      continue;
    }
    // Varian berkomponen: stoknya milik komponen, jangan dijumlahkan lagi di sini.
    if (v.track_stock === false) continue;
    ownStock[v.product_id] = (ownStock[v.product_id] || 0) + (Number(v.stock) || 0);
  }

  // Stok efektif khusus varian berkomponen (produk itu sendiri, bukan turunan sharing).
  const componentStock: Record<string, number> = {};
  for (const v of variants || []) {
    if (v.is_sellable === false || v.track_stock !== false || v.base_product_id) continue;
    const key = `${v.product_id}|${String(v.color ?? "").trim().toLowerCase()}|${String(v.size ?? "").trim().toLowerCase()}`;
    componentStock[v.product_id] =
      (componentStock[v.product_id] || 0) + (effectiveMap.get(key) ?? 0);
  }

  // Foto produk untuk bot WA (attachment). `products.image` sering video, jadi
  // ambil foto pertama yang BUKAN video dari `product_images`.
  const productIds = products.map((p) => p.id).filter(Boolean);
  const { data: imageRows } = await admin
    .from("product_images")
    .select("product_id, url, is_video, display_order")
    .in("product_id", productIds)
    .order("display_order");

  const photoMap = new Map<string, string>();
  const videoMap = new Map<string, string>();
  for (const row of (imageRows ?? []) as {
    product_id?: string | null;
    url?: string | null;
    is_video?: boolean | null;
  }[]) {
    const productId = String(row.product_id ?? "");
    const url = String(row.url ?? "");
    if (!productId || !url) continue;
    if (row.is_video || isVideoUrl(url)) {
      if (!videoMap.has(productId)) videoMap.set(productId, url);
      continue;
    }
    if (!photoMap.has(productId)) photoMap.set(productId, url);
  }

  return products.map((p) => {
    const total = ownStock[p.id] || 0;
    const fromComponents = componentStock[p.id] || 0;
    const baseId = baseLink[p.id] as string | undefined;
    // Stok efektif: series turunan memakai stok basis; produk berkomponen memakai stok
    // komponennya; produk biasa memakai stoknya sendiri.
    const efektif = baseId ? ownStock[baseId] || 0 : total + fromComponents;
    const baseProduk = baseId ? products.find((b) => b.id === baseId) : null;
    return {
      id: p.id,
      sku: p.sku || String(p.id || "").toUpperCase(),
      name: p.name,
      hpp: p.hpp ?? 0,
      price: p.price ?? 0,
      stock: total,
      initial_stock: p.initial_stock ?? 0,
      status: stockStatus(total),
      // ── Tambahan untuk halaman Produk ops. Field lama di atas sengaja TIDAK diubah
      //    supaya halaman lain (mis. Barang Masuk) tidak ikut berubah perilakunya. ──
      stock_efektif: efektif,
      status_efektif: stockStatus(efektif),
      /** Produk basis kalau produk ini menumpang stok (dipakai form Barang Masuk). */
      base_product_id: baseId ?? null,
      /** Terisi hanya kalau stok produk ini menumpang produk lain (series turunan).
       *  `mengikuti` memakai nama SERIES produk basis supaya sama dengan panel admin
       *  ("Bayati mengikuti Jiharkah"). Nama produk tidak dipakai karena satu nama
       *  produk dipakai banyak series, jadi "mengikuti Thobe Mint" menyesatkan. */
      stok_bersama: baseId
        ? {
            mengikuti: baseProduk?.series || baseProduk?.name || baseId,
            base_name: baseProduk?.name || baseId,
            series: baseProduk?.series || null,
            stock: efektif,
          }
        : null,
      /** Jenis kain (relasi `products.jenis_kain_id`) — dipakai kolom & detail di /ops. */
      jenis_kain: p.jenis_kain
        ? {
            id: p.jenis_kain.id,
            name: p.jenis_kain.name,
            material: p.jenis_kain.material ?? null,
            texture: p.jenis_kain.texture ?? null,
            suitable_for: p.jenis_kain.suitable_for ?? null,
            care_instructions: p.jenis_kain.care_instructions ?? null,
          }
        : null,
      /** Id jenis kain — dipakai form edit di /ops supaya pilihan lamanya tidak hilang. */
      jenis_kain_id: p.jenis_kain_id ?? null,
      product_type: p.product_type || "normal",
      category: p.category,
      series: p.series,
      colors: p.colors,
      image: p.image,
      // Foto pertama non-video (untuk attachment WA); null kalau produk belum punya foto.
      photo:
        photoMap.get(p.id) ||
        (typeof p.image === "string" && p.image && !isVideoUrl(p.image) ? p.image : null),
      // Video pertama produk (untuk kirim video lewat WA); null kalau tidak ada.
      video:
        videoMap.get(p.id) ||
        (Array.isArray(p.images)
          ? (p.images as string[]).find((url) => isVideoUrl(String(url))) || null
          : null) ||
        (typeof p.image === "string" && isVideoUrl(p.image) ? p.image : null),
      // Penanda "tampil di website" (kolom `products.is_published`, default true).
      is_published: p.is_published !== false,
    };
  });
}

export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from("products").select("*, jenis_kain(*)").order("name", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const items = await withTotals(admin, data || []);
  // Urutan tampil pakai aturan bersama dengan Laporan Stok: kategori → jenis kain (A-Z)
  // → warna → series urut tetap. Lihat src/lib/ops-order.ts.
  items.sort((a, b) => compareOpsRows(productSortKey(a), productSortKey(b)));
  return NextResponse.json({ items });
}

/**
 * Kolom `products` yang NOT NULL tapi tidak ada di form /ops.
 * Diisi nilai netral supaya produk baru tetap bisa disimpan tanpa error —
 * foto & deskripsi aslinya dilengkapi lewat panel admin.
 */
const CREATE_DEFAULTS: Record<string, unknown> = {
  image: "/logo.svg",
  images: [],
  colors: [],
  description: "",
};

/** id produk di tabel ini berupa slug, bukan uuid: "nama" atau "nama-series". */
function slugify(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Susun id baru dari nama + series; kalau sudah dipakai, tambah angka di belakang. */
async function buildProductId(
  admin: ReturnType<typeof getSupabaseAdmin>,
  name: unknown,
  series: unknown,
) {
  const base = [slugify(name), slugify(series)].filter(Boolean).join("-") || `produk-${Date.now()}`;
  const { data } = await admin.from("products").select("id").like("id", `${base}%`);
  const taken = new Set((data || []).map((r) => String(r.id)));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  }
  return `${base}-${Date.now()}`;
}

export async function POST(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  try {
    const body = await req.json();
    const admin = getSupabaseAdmin();
    // Produk baru dari form /ops tidak mengirim id — dibuatkan dari nama + series.
    const id = body.id || (await buildProductId(admin, body.name, body.series));
    const row: Record<string, unknown> = { ...CREATE_DEFAULTS, id, name: body.name };
    for (const f of PRODUCT_FIELDS) if (body[f] !== undefined) row[f] = body[f];
    // Produk baru dari ops BELUM tampil di website — admin yang menerbitkannya.
    row.is_published = false;
    const { data, error } = await admin.from("products").insert(row).select().maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ item: data });
  } catch (e) {
    console.error("[OPS] products POST:", e);
    return NextResponse.json({ error: "Gagal menyimpan produk" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  try {
    const body = await req.json();
    const { id, ...patch } = body || {};
    if (!id) return NextResponse.json({ error: "id wajib" }, { status: 400 });
    const row: Record<string, unknown> = {};
    for (const f of PRODUCT_FIELDS) if (patch[f] !== undefined) row[f] = patch[f];

    const admin = getSupabaseAdmin();
    const { data, error } = await admin.from("products").update(row).eq("id", id).select().maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ item: data });
  } catch (e) {
    console.error("[OPS] products PATCH:", e);
    return NextResponse.json({ error: "Gagal mengubah produk" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  try {
    const body = await req.json().catch(() => null);
    const id = body?.id || new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id wajib" }, { status: 400 });

    const admin = getSupabaseAdmin();
    // Hapus varian dulu (stok & ukuran), baru produknya.
    await admin.from("product_variants").delete().eq("product_id", id);
    const { error, count } = await admin.from("products").delete({ count: "exact" }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ deleted: count ?? 0 });
  } catch (e) {
    console.error("[OPS] products DELETE:", e);
    return NextResponse.json({ error: "Gagal menghapus produk" }, { status: 500 });
  }
}
