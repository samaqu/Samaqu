import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { SITE_URL, DEFAULT_LOCALE } from "@/lib/site-config";
import { resolveStock, type StockRow } from "@/lib/ops-stock";
import { isVideoUrl } from "@/lib/product-thumbnail";
import { OPEN_ORDER_ADDON_TARGET_ID } from "@/lib/open-order-config";

/**
 * Product feed publik untuk Katalog Meta (Commerce Manager → "Gunakan URL").
 *
 * GET /feed/meta.csv
 *
 * Sumber data hanya tabel yang sudah ada: `products`, `product_variants`, `product_images`.
 * Tidak ada tabel/kolom baru dan tidak ada penulisan apa pun (read-only).
 *
 * Aturan baris:
 *  - Produk ber-`series`  → SATU baris per series. Harga semua ukuran dalam satu series sama,
 *    jadi ukuran tidak dipecah jadi baris. `id` = id produk series (id itu juga yang dipakai
 *    sebagai slug URL /katalog/{id}, jadi link-nya cocok dengan halaman yang dibuka customer).
 *  - Produk tanpa `series` (Kabak, Cover Hanger, ...) → satu baris per varian yang ada.
 *  - `item_group_id` = id produk INDUK per warna/series, supaya series dari produk yang sama
 *    dikelompokkan oleh Meta.
 *  - Stok dibaca lewat `resolveStock` (stok bersama ala series: varian turunan memakai stok
 *    produk basis Jiharkah/Nahawand), bukan kolom `stock` mentah.
 *  - `is_published = false` (draft/nonaktif) dan add-on "Extra Cover & Hanger" tidak ikut.
 *    Produk Cover Hanger asli (dijual biasa) tetap ikut.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Urutan ukuran untuk kolom `size` supaya rapi dan stabil. */
const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "ALL SIZE"];

/** Header CSV sesuai standar Meta. */
const COLUMNS = [
  "id",
  "title",
  "description",
  "availability",
  "condition",
  "price",
  "sale_price",
  "link",
  "image_link",
  "additional_image_link",
  "item_group_id",
  "brand",
  "size",
  "color",
] as const;

interface ProductRow {
  id: string;
  name: string | null;
  category: string | null;
  series: string | null;
  colors: string[] | null;
  price: number | null;
  description: string | null;
  jenis_kain_id: string | null;
  jenis_kain?: { name?: string | null } | null;
}

interface VariantRow {
  product_id: string | null;
  color: string | null;
  size: string | null;
  stock: number | null;
  base_product_id: string | null;
  base_size: string | null;
  display_order: number | null;
}

interface ImageRow {
  product_id: string | null;
  url: string | null;
  is_video: boolean | null;
  display_order: number | null;
}

/** Escape satu sel CSV: kutip kalau mengandung koma, kutip, atau baris baru. */
function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** Buang tag HTML + rapikan spasi (description kadang berisi markup dari editor). */
function stripHtml(value?: string | null): string {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Harga Meta: "359000 IDR". */
function metaPrice(amount: number | null | undefined): string {
  const n = Math.round(Number(amount) || 0);
  return `${n} IDR`;
}

const sizeRank = (size: string) => {
  const i = SIZE_ORDER.indexOf(size);
  return i === -1 ? SIZE_ORDER.length : i;
};

const norm = (value?: string | null) => String(value ?? "").trim().toLowerCase();

/**
 * `item_group_id` = id produk INDUK per warna, supaya semua series dari produk yang sama
 * (mis. "Thobe Superblack" Jiharkah/Imron/Bayati) dikelompokkan Meta jadi satu.
 *
 * Untuk Thobe, warna sebenarnya ada di NAMA produk dan kolom `color` varian berisi `default`,
 * jadi nama produk dipakai sebagai kunci kalau tidak ada warna asli.
 */
function itemGroupId(product: ProductRow, color: string): string {
  const key = color || String(product.name ?? "").trim() || String(product.id);
  return norm(key).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || String(product.id);
}

/**
 * Warna untuk kolom `color`. Urutan: warna asli varian → `products.colors` → kata warna di
 * NAMA produk.
 *
 * Kasus Thobe: kolom `color` varian berisi `default` dan `products.colors` juga `["default"]`;
 * warna sebenarnya hanya ada di nama produk ("Thobe Superblack"). Tanpa langkah terakhir ini
 * kolom `color` keluar kosong dan Meta menganggap semua varian tidak punya warna.
 */
function displayColor(product: ProductRow, variants: VariantRow[]): string {
  const fromVariants = Array.from(
    new Set(
      variants
        .map((v) => String(v.color ?? "").trim())
        .filter((c) => c && norm(c) !== "default" && norm(c) !== "-")
    )
  );
  if (fromVariants.length > 0) return fromVariants.join(", ");

  const fromProduct = (product.colors ?? []).map((c) => String(c ?? "").trim()).filter((c) => c && norm(c) !== "default");
  if (fromProduct.length > 0) return fromProduct.join(", ");

  // "Thobe Superblack" → "Superblack"; "Koko Sand Beige" → "Sand Beige".
  const words = String(product.name ?? "").trim().split(/\s+/);
  return words.length > 1 ? words.slice(1).join(" ") : "";
}

/** Nama produk + kain + series → sama dengan judul yang dibaca di halaman series. */
function buildTitle(product: ProductRow): string {
  const parts = [String(product.name ?? "").trim()];
  const kain = String(product.jenis_kain?.name ?? "").trim();
  if (kain && !norm(parts[0]).includes(norm(kain))) parts.push(`Kain ${kain}`);
  const series = String(product.series ?? "").trim();
  if (series) parts.push(`${series} Series`);
  return parts.filter(Boolean).join(" - ");
}

export async function GET() {
  try {
    // 1. Produk yang tampil di katalog. Draft/nonaktif tidak ikut feed.
    const { data: rawProducts, error: productError } = await supabase
      .from("products")
      .select("id, name, category, series, colors, price, description, jenis_kain_id, jenis_kain(name)")
      .eq("is_published", true)
      .order("created_at", { ascending: true });

    if (productError) {
      console.error("[feed/meta] gagal ambil products:", productError.message);
      return new NextResponse("Gagal mengambil data produk", { status: 500 });
    }

    // Add-on Open Order punya baris katalog yang sama dengan Cover Hanger; add-on tidak dijual
    // sebagai produk terpisah di katalog, jadi dikeluarkan dari feed.
    const products = ((rawProducts ?? []) as unknown as ProductRow[]).filter(
      (p) => p.series || p.id !== OPEN_ORDER_ADDON_TARGET_ID
    );

    if (products.length === 0) {
      return csvResponse([COLUMNS.join(",")]);
    }

    const ids = products.map((p) => p.id);

    // 2. Varian (stok + ukuran + link produk basis) dan foto — dua query batch.
    const [{ data: rawVariants, error: variantError }, { data: rawImages, error: imageError }] = await Promise.all([
      supabase
        .from("product_variants")
        .select("product_id, color, size, stock, base_product_id, base_size, display_order")
        .in("product_id", ids)
        .order("display_order"),
      supabase
        .from("product_images")
        .select("product_id, url, is_video, display_order")
        .in("product_id", ids)
        .order("display_order"),
    ]);

    if (variantError) console.error("[feed/meta] gagal ambil product_variants:", variantError.message);
    if (imageError) console.error("[feed/meta] gagal ambil product_images:", imageError.message);

    const variants = (rawVariants ?? []) as VariantRow[];
    const images = (rawImages ?? []) as ImageRow[];

    // Stok bersama ala series — SATU resolver yang sama dengan dashboard ops.
    const stock = resolveStock(
      variants.map((v) => ({
        product_id: v.product_id,
        color: v.color,
        size: v.size,
        stock: v.stock,
        base_product_id: v.base_product_id,
      })) as StockRow[]
    );

    const variantsByProduct = new Map<string, VariantRow[]>();
    for (const v of variants) {
      const key = String(v.product_id ?? "");
      if (!key) continue;
      const list = variantsByProduct.get(key) ?? [];
      list.push(v);
      variantsByProduct.set(key, list);
    }

    const imagesByProduct = new Map<string, string[]>();
    for (const img of images) {
      const key = String(img.product_id ?? "");
      const url = String(img.url ?? "").trim();
      if (!key || !url || img.is_video || isVideoUrl(url)) continue;
      const list = imagesByProduct.get(key) ?? [];
      if (!list.includes(url)) list.push(url);
      imagesByProduct.set(key, list);
    }

    const rows: string[] = [COLUMNS.join(",")];

    for (const product of products) {
      const items = variantsByProduct.get(product.id) ?? [];
      const foto = imagesByProduct.get(product.id) ?? [];
      const imageLink = foto[0] ?? "";
      // Meta menolak baris tanpa gambar — lebih baik dilewati daripada mematahkan seluruh feed.
      if (!imageLink) continue;

      const additional = foto.slice(1).join(",");
      const color = displayColor(product, items);
      const groupId = itemGroupId(product, color);
      // `products.description` masih kosong di semua produk. Meta butuh description, jadi dipakai
      // deskripsi ringkas dari data yang ADA (nama + kain + series), bukan karangan.
      const description =
        stripHtml(product.description) ||
        stripHtml(
          [
            String(product.name ?? "").trim(),
            String(product.jenis_kain?.name ?? "").trim() ? `Kain ${String(product.jenis_kain?.name).trim()}` : "",
            String(product.series ?? "").trim() ? `${String(product.series).trim()} Series` : "",
            "Busana muslim pria premium dari SAMAQU.",
          ]
            .filter(Boolean)
            .join(" ")
        );
      const link = `${SITE_URL}/${DEFAULT_LOCALE}/katalog/${encodeURIComponent(product.id)}`;

      // Stok efektif per ukuran (ikut pool produk basis untuk series turunan).
      const sizeStock = new Map<string, number>();
      for (const v of items) {
        const size = String(v.size ?? "").trim().toUpperCase();
        if (!size) continue;
        let effective = 0;
        if (v.base_product_id) {
          const baseSize = String(v.base_size ?? v.size ?? "").trim().toUpperCase();
          effective = stock.ownBySize[String(v.base_product_id)]?.[baseSize] ?? 0;
        } else {
          effective = Number(v.stock) || 0;
        }
        sizeStock.set(size, (sizeStock.get(size) ?? 0) + effective);
      }

      const sizes = Array.from(sizeStock.keys()).sort((a, b) => sizeRank(a) - sizeRank(b));
      const availableSizes = sizes.filter((s) => (sizeStock.get(s) ?? 0) > 0);
      if (sizes.length === 0) continue;

      const base = {
        description,
        condition: "new",
        price: metaPrice(product.price),
        // Tidak ada fitur harga coret/diskon aktif di skema saat ini → kolom dibiarkan kosong.
        sale_price: "",
        link,
        image_link: imageLink,
        additional_image_link: additional,
        item_group_id: groupId,
        brand: "SAMAQU",
        color,
      };

      if (product.series) {
        // Satu baris per series: semua ukuran digabung, tidak dipecah.
        rows.push(
          [
            product.id,
            buildTitle(product),
            base.description,
            availableSizes.length > 0 ? "in stock" : "out of stock",
            base.condition,
            base.price,
            base.sale_price,
            base.link,
            base.image_link,
            base.additional_image_link,
            base.item_group_id,
            base.brand,
            sizes.join(","),
            base.color,
          ].map(csvCell).join(",")
        );
        continue;
      }

      // Tanpa series: satu baris per varian.
      for (const size of sizes) {
        const sizeVariants = items.filter((v) => String(v.size ?? "").trim().toUpperCase() === size);
        rows.push(
          [
            `${product.id}-${size.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
            buildTitle(product),
            base.description,
            (sizeStock.get(size) ?? 0) > 0 ? "in stock" : "out of stock",
            base.condition,
            base.price,
            base.sale_price,
            base.link,
            base.image_link,
            base.additional_image_link,
            base.item_group_id,
            base.brand,
            size,
            displayColor(product, sizeVariants),
          ].map(csvCell).join(",")
        );
      }
    }

    return csvResponse(rows);
  } catch (error) {
    console.error("[feed/meta] error tak terduga:", error);
    return new NextResponse("Gagal membuat feed", { status: 500 });
  }
}

function csvResponse(rows: string[]) {
  // BOM membantu Excel; Meta mengabaikannya. Line ending CRLF sesuai RFC 4180.
  const body = "\uFEFF" + rows.join("\r\n") + "\r\n";
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'inline; filename="meta.csv"',
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
