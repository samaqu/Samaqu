import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, opsIdentity, unauthorized } from "@/lib/ops-auth";
import { cancelOrderCompletely, type CancelableOrder } from "@/lib/cancel-order";
import { MANUAL_PRICE_MAX, MANUAL_PRICE_MIN, MANUAL_SOURCE_KEYS, hasManualPrice, itemSummary, manualPrice, orderSourceKey, orderSourceLabel, sourceKey, statusLabel } from "@/lib/transaksi";
import { localPhone } from "@/lib/whatsapp";
import { notifyCustomerInvoice } from "@/lib/fonnte";
import { kotaFromShipping } from "@/lib/kota";
import { itemProductIds, loadOrderPhotoLookup } from "@/lib/order-photo-data";
import { resolveItemPhotos } from "@/lib/order-photo";
import {
  productWeightMapFromRows,
  resolveLineWeight,
  sumWeightGramsBySize,
  variantWeightMapFromRows,
  type VariantWeightMap,
  type WeightMap,
} from "@/lib/shipping-weight";
import { computeOrderHppForItems, snapshotOrderHpp } from "@/lib/produksi-order-hpp";
import { orderEditGuard, weightEditError } from "@/lib/order-edit";
import {
  isOpenOrderAddonLine,
  isStockedAddonLine,
  OPEN_ORDER_ADDON,
  OPEN_ORDER_ADDON_TARGET_ID,
  OPEN_ORDER_ADDON_VARIANT,
  resolveAddonWeight,
} from "@/lib/open-order-config";
import { openOrderEffectivePrice } from "@/lib/open-order-offering";

/**
 * Menu "Transaksi" dashboard internal.
 *
 * Datanya SAMA dengan pesanan website — tidak ada tabel pesanan kedua: baris di sini
 * berasal dari `orders` + `order_items` (pesanan website & Open Order otomatis muncul),
 * ditambah transaksi manual yang dicatat admin (WhatsApp/Instagram/Shopee/TikTok/Offline).
 *
 * Yang membedakan transaksi manual hanyalah kolom `orders.source` (Website = default dari
 * checkout) dan statusnya langsung `diproses` (= Lunas) karena dibayar di tempat.
 *
 * Stok memakai jalur yang sama dengan checkout: RPC `samaqu_decrement_stock` saat dicatat
 * (sudah menghormati stok bersama ala series) dan `samaqu_restore_stock` saat dibatalkan
 * (lewat `cancelOrderCompletely`, penandanya `orders.stock_reserved`).
 *
 * Harga satuan: default dibaca ulang dari `products.price` (harga katalog). Admin boleh menimpanya
 * dengan harga manual per item (kolom "Harga" di drawer Tambah/Ubah Transaksi) — nilai itu
 * divalidasi `manualPrice()` lalu disimpan sebagai `order_items.price`, sehingga subtotal/total
 * pesanan dan semua angka pembukuan (omset, laba, Produk Terlaris) memakai harga yang diketik.
 */

const pad = (n: number) => String(n).padStart(2, "0");
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

const bad = (message: string) => NextResponse.json({ error: message }, { status: 400 });

/** Tanggal & jam WIB dari sebuah timestamptz — dipakai kolom Tanggal/Jam di layar. */
function wibParts(iso: string) {
  const w = new Date(new Date(iso).getTime() + WIB_OFFSET_MS);
  return {
    date_wib: `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}`,
    time_wib: `${pad(w.getUTCHours())}.${pad(w.getUTCMinutes())}`,
  };
}

/** Awal hari (WIB) dalam bentuk timestamptz, dari "YYYY-MM-DD". */
const wibDayStart = (dateStr: string) => `${dateStr}T00:00:00+07:00`;

function shiftDay(dateStr: string, days: number) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function newOrderNumber(createdAt: Date) {
  return `OPS-${createdAt.toISOString().slice(0, 10).replace(/-/g, "")}-${String(Math.floor(Math.random() * 900) + 100)}`;
}

type ItemInput = {
  product_id?: unknown;
  /** Nama dari form — hanya dipakai membedakan add-on Open Order dari produk katalog biasa. */
  product_name?: unknown;
  color?: unknown;
  size?: unknown;
  quantity?: unknown;
  price?: unknown;
  /** id baris lama saat mode Ubah — dipakai menyalin harga/CYP dari baris yang diganti. */
  source_item_id?: unknown;
};

type Shipping = {
  address: string;
  province: string;
  city: string;
  kecamatan: string;
  postal_code: string;
};

/** Isian alamat wajib lengkap — sama seperti checkout website. */
function readShipping(body: any): { shipping?: Shipping; error?: string } {
  const address = String(body?.shipping?.address || "").trim();
  const province = String(body?.shipping?.province || "").trim();
  const city = String(body?.shipping?.city || "").trim();
  const kecamatan = String(body?.shipping?.kecamatan || "").trim();
  const postalCode = String(body?.shipping?.postal_code || "").trim();
  if (!address) return { error: "Alamat lengkap wajib diisi" };
  if (!province) return { error: "Provinsi wajib dipilih" };
  if (!city) return { error: "Kota/Kabupaten wajib dipilih" };
  if (!kecamatan) return { error: "Kecamatan wajib diisi" };
  if (!postalCode) return { error: "Kode pos wajib diisi" };
  return { shipping: { address, province, city, kecamatan, postal_code: postalCode } };
}

/**
 * `orders.shipping_city` tetap disimpan "<kecamatan>, <kota>" — format yang sama dengan
 * checkout website, karena kolom itu dipakai saat admin membuat resi J&T.
 * Provinsi & kecamatan juga disimpan terpisah di kolomnya masing-masing.
 */
const shippingCityValue = (shipping: Shipping) =>
  [shipping.kecamatan, shipping.city].filter(Boolean).join(", ");

/** Tambah alamat baru ke daftar alamat pelanggan (tabel yang sama dengan checkout). */
async function saveCustomerAddress(
  admin: Admin,
  customerId: string | null,
  name: string,
  whatsapp: string,
  shipping: Shipping,
) {
  if (!customerId) return;
  const { data: existing } = await admin
    .from("saved_addresses")
    .select("id")
    .eq("customer_id", customerId)
    .limit(1);
  const isFirst = (existing || []).length === 0;

  const { error } = await admin.from("saved_addresses").insert({
    customer_id: customerId,
    label: "Alamat",
    recipient_name: name || "Pelanggan",
    phone: localPhone(whatsapp),
    address: shipping.address,
    province: shipping.province,
    city: shipping.city,
    kecamatan: shipping.kecamatan,
    postal_code: shipping.postal_code,
    is_default: isFirst,
  });
  // Alamat gagal disimpan tidak boleh menggagalkan transaksinya — alamatnya sudah
  // tercatat di pesanan, ini cuma menambahkannya ke buku alamat pelanggan.
  if (error) console.error("[OPS] simpan alamat pelanggan:", error.message);
}

type Snapshot = {
  product_id: string;
  product_name: string;
  series: string | null;
  kain: string | null;
  color: string | null;
  size: string | null;
  quantity: number;
  price: number;
  /** true = harga baris ini diketik admin (bukan harga katalog). */
  manual_price: boolean;
  customer_price?: number | null;
  minimum_price?: number | null;
  product_image?: string | null;
};

type Admin = ReturnType<typeof getSupabaseAdmin>;

/**
 * Nama & harga produk dibaca ulang dari database (tidak dipercaya dari layar), sama seperti
 * checkout website. Ukuran juga divalidasi harus benar-benar ada supaya pemotongan stok tidak
 * diam-diam terlewat.
 *
 * PENGECUALIAN — harga manual: kolom "Harga" di drawer Transaksi boleh diisi admin (mis. harga
 * nego). Nilai itu ikut dikirim sebagai `price` per item dan DIPAKAI sebagai harga baris, supaya
 * pembukuan (subtotal/total pesanan, omset, laba, Produk Terlaris) memakai harga yang benar-benar
 * disepakati — bukan harga katalog. Nilainya tetap divalidasi di sini (`manualPrice`), jadi yang
 * diterima hanya bilangan bulat dalam batas `MANUAL_PRICE_MIN`–`MANUAL_PRICE_MAX`; selain itu
 * permintaannya ditolak. Tanpa `price`, harga katalog database yang dipakai seperti biasa.
 */
async function buildSnapshot(admin: Admin, input: ItemInput[]): Promise<{ items?: Snapshot[]; error?: string }> {
  const cleaned = input
    .map((row) => ({
      product_id: String(row?.product_id || "").trim(),
      color: String(row?.color || "default").trim() || "default",
      size: String(row?.size || "").trim().toUpperCase(),
      quantity: Math.round(Number(row?.quantity) || 0),
      /** Harga manual ketikan admin; `undefined`/kosong = pakai harga katalog. */
      price: row?.price,
    }))
    .filter((row) => row.product_id);

  if (cleaned.length === 0) return { error: "Minimal satu produk harus diisi" };
  for (const row of cleaned) {
    if (!row.size) return { error: "Ukuran produk harus dipilih" };
    if (row.quantity < 1 || row.quantity > 99) return { error: "Jumlah produk harus antara 1 dan 99" };
  }

  const productIds = [...new Set(cleaned.map((row) => row.product_id))];
  const [{ data: products }, { data: variants }] = await Promise.all([
    admin.from("products").select("id, name, series, price, jenis_kain(name)").in("id", productIds),
    admin.from("product_variants").select("product_id, color, size").in("product_id", productIds),
  ]);

  const productById = new Map<string, any>((products || []).map((p: any) => [p.id, p]));
  const variantSet = new Set((variants || []).map((v: any) => `${v.product_id}||${v.color}||${String(v.size).toUpperCase()}`));

  const items: Snapshot[] = [];
  for (const row of cleaned) {
    const product = productById.get(row.product_id);
    if (!product) return { error: `Produk tidak ditemukan (${row.product_id})` };
    if (!variantSet.has(`${row.product_id}||${row.color}||${row.size}`)) {
      return { error: `Ukuran ${row.size} tidak tersedia untuk ${product.name}` };
    }

    // Harga katalog dari database sebagai default; harga manual hanya dipakai kalau dikirim
    // DAN lolos validasi batas. Yang dikirim klien tidak pernah masuk tanpa diperiksa.
    let price = Number(product.price) || 0;
    let manual = false;
    if (hasManualPrice(row.price)) {
      const typed = manualPrice(row.price);
      if (typed === null) {
        return {
          error: `Harga manual "${product.name}" tidak valid — isi Rp ${MANUAL_PRICE_MIN} sampai Rp ${MANUAL_PRICE_MAX}`,
        };
      }
      price = typed;
      manual = true;
    }

    items.push({
      product_id: row.product_id,
      product_name: product.name,
      series: product.series ?? null,
      kain: product.jenis_kain?.name ?? null,
      color: row.color,
      size: row.size,
      quantity: row.quantity,
      price,
      manual_price: manual,
    });
  }
  return { items };
}

type OldItem = {
  id: string;
  product_id: string;
  product_name: string;
  series: string | null;
  kain: string | null;
  color: string | null;
  size: string | null;
  quantity: number;
  price: number;
  customer_price: number | null;
  minimum_price: number | null;
  product_image: string | null;
};

/**
 * Batas bawah harga Open Order satu baris `products` (hanya saat Create Your Price aktif).
 * Kolom `open_order_*` menang atas katalog; `null` = tidak ada batas bawah.
 */
function openOrderMinimumOf(row: any): number | null {
  if (!row) return null;
  const hasOpenOrderPrice = row.open_order_price != null;
  const cyp = hasOpenOrderPrice ? Boolean(row.open_order_cyp_enabled) : Boolean(row.create_your_price_enabled);
  if (!cyp) return null;
  const minimum = Number(hasOpenOrderPrice ? row.open_order_minimum_price : row.minimum_price) || 0;
  return minimum > 0 ? minimum : null;
}

/**
 * Snapshot untuk EDIT item. Beda dengan create:
 *  - harga default ikut baris LAMA selama produknya SAMA; kalau admin mengganti series/produk,
 *    harga mengikuti jalur sumber pesanan (Open Order → `open_order_*`, lainnya → katalog);
 *  - `customer_price` disalin dari baris lama;
 *  - baris add-on Open Order dinormalisasi ke nilai aslinya (tidak boleh berubah).
 */
async function buildEditSnapshot(
  admin: Admin,
  input: ItemInput[],
  oldItems: OldItem[],
  group: "manual" | "website" | "open_order" | "unknown",
): Promise<{ items?: Snapshot[]; error?: string }> {
  const cleaned = input
    .map((row) => ({
      product_id: String(row?.product_id || "").trim(),
      // Nama dari form dipakai HANYA untuk membedakan add-on Open Order dari produk
      // "Cover Hanger" biasa (id-nya sama). Nama yang disimpan tetap dari database.
      product_name: String(row?.product_name || "").trim(),
      color: String(row?.color || "default").trim() || "default",
      size: String(row?.size || "").trim().toUpperCase(),
      quantity: Math.round(Number(row?.quantity) || 0),
      price: row?.price,
      source_item_id: String(row?.source_item_id || "").trim(),
    }))
    .filter((row) => row.product_id);

  if (cleaned.length === 0) return { error: "Minimal satu produk harus diisi" };
  for (const row of cleaned) {
    // Baris add-on Open Order dikenali lewat helper bersama (format lama & baru) — hanya di
    // pesanan Open Order, supaya Cover Hanger yang dibeli biasa tetap baris produk normal.
    const openOrderAddon = group === "open_order" && isOpenOrderAddonLine(row);
    if (!openOrderAddon && !row.size) return { error: "Ukuran produk harus dipilih" };
    if (row.quantity < 1 || row.quantity > 99) return { error: "Jumlah produk harus antara 1 dan 99" };
  }

  const productIds = [
    ...new Set(
      cleaned
        .filter((row) => !(group === "open_order" && isOpenOrderAddonLine(row)))
        .map((row) => row.product_id),
    ),
  ];
  let products: any[] = [];
  let variants: any[] = [];
  if (productIds.length > 0) {
    const [productResult, variantResult] = await Promise.all([
      // Kolom `open_order_*` ikut dibaca: pesanan CYO memakai jalur harga Open Order, bukan katalog.
      admin
        .from("products")
        .select(
          "id, name, series, price, minimum_price, create_your_price_enabled, open_order_price, open_order_minimum_price, open_order_cyp_enabled, jenis_kain(name)",
        )
        .in("id", productIds),
      admin.from("product_variants").select("product_id, color, size").in("product_id", productIds),
    ]);
    products = productResult.data || [];
    variants = variantResult.data || [];
  }

  const productById = new Map<string, any>((products || []).map((p: any) => [String(p.id), p]));
  const variantSet = new Set((variants || []).map((v: any) => `${v.product_id}||${v.color}||${String(v.size).toUpperCase()}`));
  const oldById = new Map(oldItems.map((row) => [String(row.id), row]));
  const oldByKey = new Map(
    oldItems.map((row) => [
      `${row.product_id}||${String(row.color || "default")}||${String(row.size || "").toUpperCase()}`,
      row,
    ]),
  );

  const items: Snapshot[] = [];
  for (const row of cleaned) {
    if (group === "open_order" && isOpenOrderAddonLine(row)) {
      // Cari baris lama yang bersangkutan: format lama (tanpa warna/ukuran) atau format baru
      // (varian katalog add-on). Bentuk barisnya DIPERTAHANKAN apa adanya — format baru tetap
      // membawa color/size-nya supaya stoknya cocok saat edit, format lama tetap tanpa varian.
      const old =
        oldById.get(row.source_item_id) ||
        oldByKey.get(`${row.product_id}||${row.color}||${row.size}`) ||
        oldByKey.get(`${row.product_id}||default||`) ||
        oldItems.find(
          (entry) =>
            isOpenOrderAddonLine(entry) &&
            String(entry.product_id) === String(row.product_id),
        ) ||
        oldItems.find((entry) => isOpenOrderAddonLine(entry));

      const stocked = isStockedAddonLine(row) || isStockedAddonLine(old);
      items.push({
        product_id: stocked ? OPEN_ORDER_ADDON_TARGET_ID : OPEN_ORDER_ADDON.id,
        product_name: OPEN_ORDER_ADDON.name,
        series: null,
        kain: null,
        color: stocked ? OPEN_ORDER_ADDON_VARIANT.color : null,
        size: stocked ? OPEN_ORDER_ADDON_VARIANT.size : null,
        quantity: 1,
        price: OPEN_ORDER_ADDON.price,
        manual_price: false,
        customer_price: null,
        minimum_price: null,
        product_image: old?.product_image ?? null,
      });
      continue;
    }

    const product = productById.get(row.product_id);
    if (!product) return { error: `Produk tidak ditemukan (${row.product_id})` };
    // Produk Cover Hanger yang dibeli sebagai produk BIASA di pesanan Open Order: barisnya
    // divalidasi seperti produk lain (varian harus ada). Add-on sendiri sudah ditangani di atas.
    if (!variantSet.has(`${row.product_id}||${row.color}||${row.size}`)) {
      return { error: `Ukuran ${row.size} tidak tersedia untuk ${product.name}` };
    }

    const old =
      oldById.get(row.source_item_id) ||
      oldByKey.get(`${row.product_id}||${row.color}||${row.size}`);

    // Harga default:
    //  - baris yang masih produk SAMA → harga baris lama (yang sudah disepakati);
    //  - ganti series/produk atau baris baru → jalur sumber pesanan:
    //      Open Order (CYO) → `open_order_*` (termasuk minimum CYP), lainnya → katalog.
    // Admin tetap boleh mengetik harga sendiri.
    const sameProduct = Boolean(old) && String(old!.product_id) === String(row.product_id);
    let price = sameProduct
      ? Number(old!.price) || 0
      : group === "open_order"
        ? openOrderEffectivePrice(product)
        : Number(product.price) || 0;
    let manual = false;
    if (hasManualPrice(row.price)) {
      const typed = manualPrice(row.price);
      if (typed === null) {
        return {
          error: `Harga manual "${product.name}" tidak valid — isi Rp ${MANUAL_PRICE_MIN} sampai Rp ${MANUAL_PRICE_MAX}`,
        };
      }
      price = typed;
      manual = true;
    }

    // Batas bawah CYP ikut PRODUK yang dipilih sekarang (bukan cuma baris lama) — jadi ganti
    // series tidak bisa lolos dengan harga di bawah minimum series barunya.
    let minimum = old?.minimum_price == null ? null : Number(old.minimum_price) || 0;
    if (group === "open_order") {
      const productMinimum = openOrderMinimumOf(product);
      if (productMinimum !== null) minimum = productMinimum;
    }
    if (group === "open_order" && minimum != null && price < minimum) {
      return { error: `Harga ${product.name} tidak boleh di bawah harga minimum Open Order (Rp ${minimum}).` };
    }

    items.push({
      product_id: row.product_id,
      product_name: product.name,
      series: product.series ?? null,
      kain: product.jenis_kain?.name ?? null,
      color: row.color,
      size: row.size,
      quantity: row.quantity,
      price,
      manual_price: manual,
      customer_price: old?.customer_price ?? null,
      minimum_price: minimum,
      product_image: old?.product_image ?? null,
    });
  }

  return { items };
}
async function deductStock(admin: Admin, items: Snapshot[]) {
  const done: Snapshot[] = [];
  for (const item of items) {
    const { data, error } = await admin.rpc("samaqu_decrement_stock", {
      p_product_id: item.product_id,
      p_color: item.color,
      p_size: item.size,
      p_qty: item.quantity,
    });
    if (error) return { ok: false as const, done, message: "Gagal memeriksa stok produk" };
    if (data === false) {
      return {
        ok: false as const,
        done,
        message: `Stok ${item.product_name} (${item.color} / ${item.size}) tidak mencukupi`,
      };
    }
    done.push(item);
  }
  return { ok: true as const, done };
}

async function restoreStock(admin: Admin, items: Snapshot[]) {
  for (const item of items) {
    await admin.rpc("samaqu_restore_stock", {
      p_product_id: item.product_id,
      p_color: item.color,
      p_size: item.size,
      p_qty: item.quantity,
    });
  }
}

/** Daftar transaksi per PESANAN (bukan per item) untuk bulan terpilih. */
export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const sp = new URL(req.url).searchParams;
  const start = String(sp.get("start") || "").trim();
  const end = String(sp.get("end") || "").trim();
  const limit = Math.min(Math.max(parseInt(sp.get("limit") || "1000", 10) || 1000, 1), 2000);

  const admin = getSupabaseAdmin();
  let query = admin
    .from("orders")
    .select(
      "id, order_number, created_at, customer_id, customer_name, customer_whatsapp, status, source, stock_reserved, subtotal, discount, shipping_cost, shipping_method, total, shipping_notes, weight, awb_no, jnt_order_id, shipping_status, tracking_status_code, shipping_address, shipping_city, shipping_province, shipping_kecamatan, shipping_postal_code, payment_method, payment_status, paid_at, payment_provider, payment_channel, reseller_id, reseller_balance_deduction, reseller_shortfall_amount, reseller_shortfall_status, show_reseller_name_on_label",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  // Batas bulan dihitung dalam WIB supaya transaksi dini hari tidak salah bulan.
  if (start) query = query.gte("created_at", wibDayStart(start));
  if (end) query = query.lt("created_at", wibDayStart(shiftDay(end, 1)));

  const { data: orders, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const list = orders || [];
  if (list.length === 0) return NextResponse.json({ items: [] });

  const orderIds = list.map((order: any) => String(order.id));

  // Kolom ini baru dibuat oleh migrasi 20261025_edit_order_items.sql. Dibaca terpisah
  // supaya halaman Transaksi tetap jalan walau migrasi belum dijalankan.
  const editedAfterResi = new Map<string, boolean>();
  let editReady = true;
  try {
    const { data: editFlags, error: editFlagsError } = await admin
      .from("orders")
      .select("id, items_edited_after_resi")
      .in("id", orderIds);
    if (!editFlagsError) {
      for (const row of editFlags || []) {
        editedAfterResi.set(String((row as any).id), Boolean((row as any).items_edited_after_resi));
      }
    } else {
      editReady = false;
    }
  } catch {
    // Migrasi belum dijalankan — flag dianggap false, halaman tetap tampil normal.
    editReady = false;
  }

  // Hanya dipakai untuk status/peringatan kemasan — nilai HPP tidak dikirim ke layar.
  const { data: hppHeaders } = await admin
    .from("production_order_hpp")
    .select("order_id, packaging_status, packaging_warning")
    .in("order_id", orderIds);
  const hppByOrder = new Map((hppHeaders || []).map((row: any) => [String(row.order_id), row]));

  const { data: lineItems } = await admin
    .from("order_items")
    .select(
      "id, order_id, product_id, product_name, series, kain, color, size, quantity, price, product_image, customer_price, minimum_price, reseller_buy_price, reseller_sell_price",
    )
    .in("order_id", list.map((o) => o.id));

  // Foto produk sering kosong di `order_items` (mis. baris Open Order yang belum punya snapshot,
  // atau foto yang sudah terhapus dari CDN). Diselesaikan di sini memakai rantai yang SAMA
  // dengan panel admin & halaman Akun: snapshot → foto katalog per warna → foto utama katalog →
  // pencocokan katalog lama. Kalau tetap tidak ada, layar memakai placeholder netral.
  const photoLookup = await loadOrderPhotoLookup(itemProductIds(lineItems || []));
  const itemsWithPhotos = resolveItemPhotos(lineItems || [], photoLookup);

  // Berat per item (gram) — `order_items` tidak menyimpannya, jadi dihitung di sini seperti
  // panel admin: berat varian (per produk+warna+ukuran) → cadangan berat produk. Aturan
  // resolusinya milik `src/lib/shipping-weight.ts` supaya angkanya sama dengan admin.
  const productIds = [...new Set((itemsWithPhotos || []).map((item) => item.product_id).filter(Boolean))] as string[];
  let productWeights: WeightMap = {};
  let variantWeights: VariantWeightMap = {};
  if (productIds.length > 0) {
    const [{ data: productRows }, { data: variantRows }] = await Promise.all([
      admin.from("products").select("id, weight").in("id", productIds),
      admin.from("product_variants").select("product_id, color, size, weight").in("product_id", productIds),
    ]);
    productWeights = productWeightMapFromRows(productRows as { id?: string | null; weight?: number | null }[]);
    variantWeights = variantWeightMapFromRows(
      variantRows as { product_id?: string | null; color?: string | null; size?: string | null; weight?: number | null }[],
    );
  }

  // Nama toko reseller untuk badge baris RSL- & blok "Reseller" di drawer.
  const resellerIds = [...new Set(list.map((order: any) => order.reseller_id).filter(Boolean))];
  const resellerById = new Map<string, { store_name: string; owner_name: string; whatsapp: string | null }>();
  if (resellerIds.length > 0) {
    const { data: resellerRows } = await admin
      .from("resellers")
      .select("id, store_name, owner_name, whatsapp")
      .in("id", resellerIds);
    for (const row of resellerRows || []) {
      resellerById.set(String((row as any).id), {
        store_name: String((row as any).store_name || ""),
        owner_name: String((row as any).owner_name || ""),
        whatsapp: ((row as any).whatsapp as string | null) ?? null,
      });
    }
  }

  const byOrder = new Map<string, any[]>();
  for (const item of itemsWithPhotos || []) {
    const row = {
      ...item,
      weight: resolveLineWeight(
        { productId: item.product_id, color: item.color, size: item.size },
        productWeights,
        variantWeights,
      ),
    };
    if (!byOrder.has(item.order_id)) byOrder.set(item.order_id, []);
    byOrder.get(item.order_id)!.push(row);
  }

  const items = list.map((order) => {
    const rows = byOrder.get(order.id) || [];
    const status = String(order.status || "");
    const key = sourceKey(order.source);
    const resolvedKey = orderSourceKey(order);
    const editGuard = orderEditGuard(order);
    return {
      id: order.id,
      order_number: order.order_number,
      created_at: order.created_at,
      ...wibParts(order.created_at),
      customer_id: order.customer_id ?? null,
      customer_name: order.customer_name || "-",
      customer_whatsapp: order.customer_whatsapp || "",
      source: key,
      source_key: resolvedKey,
      source_label: orderSourceLabel(order),
      // Atribut reseller (null untuk pesanan biasa — tidak mengubah perilaku lama).
      reseller_id: order.reseller_id ?? null,
      reseller_store_name: order.reseller_id ? resellerById.get(String(order.reseller_id))?.store_name || "" : "",
      reseller_whatsapp: order.reseller_id ? resellerById.get(String(order.reseller_id))?.whatsapp || "" : "",
      reseller_owner_name: order.reseller_id ? resellerById.get(String(order.reseller_id))?.owner_name || "" : "",
      reseller_balance_deduction: Number(order.reseller_balance_deduction) || 0,
      reseller_shortfall_amount: Number(order.reseller_shortfall_amount) || 0,
      reseller_shortfall_status: order.reseller_shortfall_status || "none",
      show_reseller_name_on_label: order.show_reseller_name_on_label === true,
      status,
      status_label: statusLabel(status),
      subtotal: Number(order.subtotal) || 0,
      discount: Number(order.discount) || 0,
      shipping_cost: Number(order.shipping_cost) || 0,
      // Layanan tersimpan ("J&T EZ"/"J&T ECO"/"J&T HBO") — dipakai drawer & form Ubah.
      shipping_method: order.shipping_method || "",
      total: Number(order.total) || 0,
      // Metode & waktu pembayaran — dipakai drawer Detail Transaksi (panel admin).
      payment_method: order.payment_method || "",
      // Provider & channel gateway (mis. Mayar → QRIS/VA/e-wallet) supaya rincian pembayaran
      // di drawer tidak cuma menampilkan "Online".
      payment_provider: order.payment_provider || "",
      payment_channel: order.payment_channel || "",
      // Status bayar asli dipakai form Ubah Transaksi supaya langkah Pembayaran terisi
      // otomatis. Data lama tanpa kolom ini mengikuti status pesanan (pending = belum lunas).
      payment_status: order.payment_status || (status === "pending" ? "unpaid" : "paid"),
      paid_at: order.paid_at || null,
      notes: order.shipping_notes || "",
      shipping_address: order.shipping_address || "",
      shipping_city: order.shipping_city || "",
      shipping_province: order.shipping_province || "",
      shipping_kecamatan: order.shipping_kecamatan || "",
      shipping_postal_code: order.shipping_postal_code || "",
      // Kota dipisah dari `shipping_city` ("<kecamatan>, <kota>") supaya layar tidak perlu
      // tahu aturan penggabungannya.
      kota: kotaFromShipping(order.shipping_city, order.shipping_kecamatan),
      qty_total: rows.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0),
      item_summary: itemSummary(rows),
      items: rows,
      // Data resi J&T — dipakai layar untuk menampilkan/menyalin nomor resi, status kirim,
      // dan memutuskan tombol Buat Resi/Cetak Resi. Murni tambahan, tidak mengubah field lain.
      awb_no: order.awb_no || "",
      jnt_order_id: order.jnt_order_id || "",
      shipping_status: order.shipping_status || "",
      tracking_status_code: typeof order.tracking_status_code === "number" ? order.tracking_status_code : null,
      // Peringatan kemasan boleh dilihat semua admin (tanpa harga/HPP).
      packaging_warning: Boolean(hppByOrder.get(order.id)?.packaging_warning),
      packaging_status: hppByOrder.get(order.id)?.packaging_status || null,
      // HPP sengaja TIDAK dikirim ke daftar/drawer Transaksi ops — disamakan dengan
      // dashboard /admin yang hanya menampilkan data pesanan. Snapshot HPP tetap tersimpan
      // di database dan dipakai laporan/produksi.
      // Guard edit item dipakai server & UI. Website/Open Order sekarang boleh diedit
      // selama stoknya tercatat, status belum dikirim, dan pengiriman belum berjalan.
      can_edit: editReady && editGuard.canEdit,
      edit_warning: editGuard.warning,
      weight: order.weight == null ? null : Number(order.weight) || 0,
      items_edited_at: null,
      items_edited_after_resi: editedAfterResi.get(String(order.id)) || false,
      can_cancel: status === "pending" || status === "diproses",
    };
  });

  return NextResponse.json({ items });
}

/** Catat transaksi manual: langsung Lunas (`diproses`), stok langsung terpotong. */
export async function POST(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  try {
    const body = await req.json();

    const customerName = String(body?.customer_name || "").trim();
    const customerWhatsapp = String(body?.customer_whatsapp || "").trim();
    const customerId = String(body?.customer_id || "").trim() || null;
    const source = String(body?.source || "").trim().toLowerCase();
    const notes = String(body?.notes || "").trim();
    const shippingCost = Math.max(0, Math.round(Number(body?.shipping_cost) || 0));
    const discount = Math.max(0, Math.round(Number(body?.discount) || 0));
    const createdAt = new Date(String(body?.created_at || ""));
    const inputItems: ItemInput[] = Array.isArray(body?.items) ? body.items : [];

    if (!customerName) return bad("Nama pelanggan wajib diisi");
    if (!customerWhatsapp) return bad("Nomor HP pelanggan wajib diisi");
    if (!MANUAL_SOURCE_KEYS.includes(source)) return bad("Sumber transaksi tidak valid");
    if (Number.isNaN(createdAt.getTime())) return bad("Tanggal/jam transaksi tidak valid");

    const shippingResult = readShipping(body);
    if (shippingResult.error || !shippingResult.shipping) return bad(shippingResult.error || "Alamat belum lengkap");
    const shipping = shippingResult.shipping;

    const admin = getSupabaseAdmin();
    const snapshot = await buildSnapshot(admin, inputItems);
    if (snapshot.error || !snapshot.items) return bad(snapshot.error || "Produk tidak valid");

    const items = snapshot.items;
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const finalDiscount = Math.min(discount, subtotal);
    const total = subtotal - finalDiscount + shippingCost;

    // Stok dipotong sebelum pesanan disimpan — kalau ada yang kurang, tidak ada yang tersimpan.
    const deducted = await deductStock(admin, items);
    if (!deducted.ok) {
      await restoreStock(admin, deducted.done);
      return bad(deducted.message);
    }

    // Status bayar dipilih admin di drawer ("Lunas" bawaan, atau "Belum Lunas"). Belum lunas
    // memakai status `pending` yang sudah ada ("Belum Bayar") supaya TIDAK ikut dihitung sebagai
    // omset/laba — semua laporan memakai `SALE_STATUSES` (diproses/dikirim/selesai).
    const paid = String(body?.payment_status || "paid").trim().toLowerCase() !== "unpaid";

    // Metode pembayaran: transaksi manual memakai metode BANK AKTIF dari Pengaturan → Payment
    // Methods (id asli), bukan lagi string hardcoded "cash" yang tidak pernah terdaftar sebagai
    // metode. Kalau admin belum punya metode bank aktif, kolom dibiarkan kosong (tampil "-") —
    // lebih baik kosong daripada menampilkan nama metode yang tidak ada.
    const { data: activeMethods } = await admin
      .from("payment_methods")
      .select("id, method_type")
      .eq("is_active", true)
      .order("display_order");
    const paymentMethod = (activeMethods || []).find((m) => m.method_type === "bank")?.id ?? null;

    const orderRow = {
      customer_id: customerId,
      customer_name: customerName,
      customer_whatsapp: customerWhatsapp,
      // Alamat yang diisi admin disimpan di pesanan — inilah yang dibaca menu Pelanggan
      // ("Riwayat Belanja & Alamat") dan Database Kota.
      shipping_address: shipping.address,
      shipping_city: shippingCityValue(shipping),
      shipping_kecamatan: shipping.kecamatan,
      shipping_province: shipping.province,
      shipping_postal_code: shipping.postal_code,
      shipping_notes: notes || null,
      shipping_cost: shippingCost,
      ...(String(body?.shipping_method || "").trim() === "J&T HBO" ? { shipping_method: "J&T HBO" } : {}),
      payment_method: paymentMethod,
      payment_status: paid ? "paid" : "unpaid",
      paid_at: paid ? createdAt.toISOString() : null,
      subtotal,
      discount: finalDiscount,
      total,
      status: paid ? "diproses" : "pending",
      // Stok sudah dipotong di atas → pembatalan wajib mengembalikannya.
      stock_reserved: true,
      source,
      created_at: createdAt.toISOString(),
      updated_at: createdAt.toISOString(),
    };

    let order: { id: string; order_number: string } | null = null;
    let insertError: { message: string } | null = null;
    for (let attempt = 0; attempt < 5 && !order; attempt += 1) {
      const candidate = { ...orderRow, order_number: newOrderNumber(createdAt) };
      const { data, error } = await admin.from("orders").insert(candidate).select("id, order_number").single();
      if (!error) {
        order = data;
        break;
      }
      insertError = error;
      // Nomor pesanan bentrok → coba nomor lain; error lain langsung dilaporkan.
      if (!/duplicate|unique/i.test(error.message)) break;
    }

    if (!order) {
      await restoreStock(admin, items);
      console.error("[OPS] transaksi insert:", insertError?.message);
      return bad("Gagal menyimpan transaksi. Coba lagi.");
    }

    const { error: itemsError } = await admin.from("order_items").insert(
      items.map((item) => ({
        order_id: order!.id,
        product_id: item.product_id,
        product_name: item.product_name,
        series: item.series,
        kain: item.kain,
        color: item.color,
        size: item.size,
        quantity: item.quantity,
        price: item.price,
      })),
    );

    if (itemsError) {
      await admin.from("orders").delete().eq("id", order.id);
      await restoreStock(admin, items);
      console.error("[OPS] transaksi items:", itemsError.message);
      return bad("Gagal menyimpan produk transaksi. Coba lagi.");
    }

    // Snapshot HPP per baris. Kegagalan snapshot tidak boleh menggagalkan transaksi.
    try {
      await snapshotOrderHpp(admin, order.id);
    } catch (snapshotError) {
      console.error("[OPS] snapshot HPP order:", order.order_number, snapshotError);
    }

    // Alamat baru (kalau admin menambahkannya) ikut masuk buku alamat pelanggan.
    if (body?.save_address) await saveCustomerAddress(admin, customerId, customerName, customerWhatsapp, shipping);

    // Belum lunas → invoice otomatis ke WA pembeli. Nomor rekening diambil dari Pengaturan →
    // Payment Methods (`payment_methods`, method_type "bank" & aktif). Kalau pengiriman gagal,
    // transaksi tetap tersimpan (fungsi fonnte tidak pernah melempar error).
    if (!paid) {
      await notifyCustomerInvoice({
        orderNumber: order.order_number,
        customerName,
        customerWhatsapp,
        items: items.map((item) => ({
          name: item.product_name,
          series: item.series,
          kain: item.kain,
          color: item.color,
          size: item.size,
          quantity: item.quantity,
          price: item.price,
        })),
        subtotal,
        discount: finalDiscount,
        shippingCost,
        total,
        paid: false,
      });
    }

    return NextResponse.json({ order_number: order.order_number, total });
  } catch (e) {
    console.error("[OPS] transaksi POST:", e);
    return NextResponse.json({ error: "Gagal menyimpan transaksi" }, { status: 500 });
  }
}

/**
 * Ubah transaksi manual (`action: "update"`) atau batalkan (`action: "cancel"`).
 *
 * Pembatalan memakai jalur bersama `cancelOrderCompletely` — sama dengan tombol batal di
 * panel admin: resi J&T di-void lebih dulu (kalau ada) baru stok dikembalikan, jadi tidak
 * ada dua aturan stok yang berbeda antar layar.
 */
export async function PATCH(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  try {
    const body = await req.json();
    const orderNumber = String(body?.order_number || "").trim();
    const action = String(body?.action || "").trim();
    if (!orderNumber) return bad("Nomor pesanan wajib diisi");

    const admin = getSupabaseAdmin();
    const { data: order, error } = await admin
      .from("orders")
      .select("id, order_number, status, source, awb_no, jnt_order_id, stock_reserved, customer_name, customer_whatsapp, customer_id, shipping_status, weight, subtotal, total, discount, shipping_cost, paid_at")
      .eq("order_number", orderNumber)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!order) return bad("Pesanan tidak ditemukan");

    if (action === "cancel") {
      // "Dibatalkan sebelum dikirim" — pesanan yang sudah jalan tidak bisa dibatalkan di sini.
      if (order.status !== "pending" && order.status !== "diproses") {
        return bad("Pesanan yang sudah dikirim atau sudah dibatalkan tidak bisa dibatalkan di sini");
      }
      const result = await cancelOrderCompletely(
        {
          id: order.id,
          order_number: order.order_number,
          status: order.status,
          awb_no: order.awb_no,
          jnt_order_id: order.jnt_order_id,
          stock_reserved: order.stock_reserved,
          customer_name: order.customer_name,
          customer_whatsapp: order.customer_whatsapp,
        } as CancelableOrder,
        "Dibatalkan dari menu Transaksi",
      );
      if (!result.success) return bad(result.message);
      return NextResponse.json({
        order_number: order.order_number,
        cancelled: true,
        packagingWarning: Boolean(result.packagingWarning),
      });
    }

    if (action !== "update") return bad("Aksi tidak dikenal");

    const guard = orderEditGuard(order);
    if (!guard.canEdit) return bad(guard.reason);
    const group = guard.sourceGroup;
    const isManual = group === "manual";

    const inputItems: ItemInput[] = Array.isArray(body?.items) ? body.items : [];
    if (inputItems.length === 0) return bad("Minimal satu produk harus diisi");

    const { data: oldRows, error: oldError } = await admin
      .from("order_items")
      .select("id, product_id, product_name, series, kain, color, size, quantity, price, customer_price, minimum_price, product_image")
      .eq("order_id", order.id);
    if (oldError) return NextResponse.json({ error: oldError.message }, { status: 500 });
    const oldItems: OldItem[] = (oldRows || []).map((row: any) => ({
      id: String(row.id),
      product_id: String(row.product_id || ""),
      product_name: String(row.product_name || ""),
      series: row.series ?? null,
      kain: row.kain ?? null,
      color: row.color ?? null,
      size: row.size ?? null,
      quantity: Number(row.quantity) || 0,
      price: Number(row.price) || 0,
      customer_price: row.customer_price == null ? null : Number(row.customer_price) || 0,
      minimum_price: row.minimum_price == null ? null : Number(row.minimum_price) || 0,
      product_image: row.product_image ?? null,
    }));
    if (oldItems.length === 0) return bad("Pesanan ini tidak punya item untuk diubah");

    // Add-on Open Order tidak boleh berubah: jumlah baris, qty, dan harga harus sama.
    // Pengenalannya lewat satu helper — format lama (`addon-cover-hanger`) dan format baru
    // (`cover-hanger` + varian add-on) sama-sama dipatok.
    if (group === "open_order") {
      const oldAddon = oldItems.filter((row) => isOpenOrderAddonLine(row));
      const newAddon = inputItems.filter((row) =>
        isOpenOrderAddonLine({
          product_id: String(row?.product_id ?? ""),
          color: String(row?.color ?? ""),
          size: String(row?.size ?? ""),
        }),
      );
      if (oldAddon.length !== newAddon.length) return bad("Baris Extra Cover & Hanger tidak boleh ditambah atau dihapus.");
      for (const row of newAddon) {
        const qty = Math.round(Number(row?.quantity) || 0);
        if (qty !== 1) return bad("Baris Extra Cover & Hanger tidak boleh diubah.");
        if (hasManualPrice(row?.price) && manualPrice(row?.price) !== OPEN_ORDER_ADDON.price) {
          return bad("Baris Extra Cover & Hanger tidak boleh diubah.");
        }
        // Format baru boleh membawa varian katalognya; format lama tidak punya varian.
        const productId = String(row?.product_id || "").trim();
        if (productId === OPEN_ORDER_ADDON_TARGET_ID) {
          const color = String(row?.color || "").trim();
          const size = String(row?.size || "").trim().toUpperCase();
          if (color && color !== OPEN_ORDER_ADDON_VARIANT.color) {
            return bad("Baris Extra Cover & Hanger tidak boleh diubah.");
          }
          if (size && size !== OPEN_ORDER_ADDON_VARIANT.size.toUpperCase()) {
            return bad("Baris Extra Cover & Hanger tidak boleh diubah.");
          }
        }
      }
    }

    let customerName = String(order.customer_name || "").trim();
    let customerWhatsapp = String(order.customer_whatsapp || "").trim();
    let customerId = order.customer_id || null;
    let source = String(order.source || "").trim().toLowerCase();
    let notes = "";
    let shippingCost = Number(order.shipping_cost) || 0;
    let discount = Number(order.discount) || 0;
    let createdAt: Date | null = null;
    let shipping: Shipping | null = null;

    if (isManual) {
      customerName = String(body?.customer_name || "").trim();
      customerWhatsapp = String(body?.customer_whatsapp || "").trim();
      customerId = String(body?.customer_id || "").trim() || order.customer_id || null;
      source = String(body?.source || "").trim().toLowerCase();
      notes = String(body?.notes || "").trim();
      shippingCost = Math.max(0, Math.round(Number(body?.shipping_cost) || 0));
      discount = Math.max(0, Math.round(Number(body?.discount) || 0));
      const parsedCreatedAt = new Date(String(body?.created_at || ""));
      if (!customerName) return bad("Nama pelanggan wajib diisi");
      if (!customerWhatsapp) return bad("Nomor HP pelanggan wajib diisi");
      if (!MANUAL_SOURCE_KEYS.includes(source)) return bad("Sumber transaksi tidak valid");
      if (Number.isNaN(parsedCreatedAt.getTime())) return bad("Tanggal/jam transaksi tidak valid");
      createdAt = parsedCreatedAt;
      const shippingResult = readShipping(body);
      if (shippingResult.error || !shippingResult.shipping) return bad(shippingResult.error || "Alamat belum lengkap");
      shipping = shippingResult.shipping;
    }

    const snapshot = await buildEditSnapshot(admin, inputItems, oldItems, group);
    if (snapshot.error || !snapshot.items) return bad(snapshot.error || "Produk tidak valid");
    const items = snapshot.items;

    const allSubtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const addonTotal =
      group === "open_order"
        ? items
            .filter((item) => isOpenOrderAddonLine(item))
            .reduce((sum, item) => sum + item.price * item.quantity, 0)
        : 0;
    const subtotal = group === "open_order" ? allSubtotal - addonTotal : allSubtotal;

    let finalDiscount = 0;
    let total = 0;
    if (isManual) {
      finalDiscount = Math.min(discount, subtotal);
      total = subtotal + addonTotal + shippingCost - finalDiscount;
    } else if (group === "open_order") {
      finalDiscount = Number(order.discount) || 0;
      shippingCost = Number(order.shipping_cost) || 0;
      total = subtotal + addonTotal + shippingCost;
    } else {
      finalDiscount = Number(order.discount) || 0;
      shippingCost = Number(order.shipping_cost) || 0;
      total = subtotal + shippingCost - finalDiscount;
    }
    total = Math.round(total);

    // Website & Open Order: total tidak boleh berubah, supaya invoice/payment tidak perlu disentuh.
    if (group !== "manual" && total !== Math.round(Number(order.total) || 0)) {
      return bad(
        `Total berubah (Rp ${Math.round(Number(order.total) || 0).toLocaleString("id-ID")} → Rp ${total.toLocaleString("id-ID")}). ` +
          "Untuk pesanan website/Open Order, gunakan batal lalu buat order baru.",
      );
    }

    // Berat baru tidak boleh melebihi berat lama.
    // Baris add-on tetap dihitung beratnya:
    //  - format BARU → berat varian katalognya sendiri (id `cover-hanger`), jadi ikut dihitung
    //    lewat jalur biasa dan TIDAK boleh ditambah setting lagi;
    //  - format LAMA → id bayangan tanpa baris varian; beratnya dari setting admin.
    const isAddonItem = (item: Snapshot) => group === "open_order" && isOpenOrderAddonLine(item);
    const countedForWeight = (item: Snapshot) => !isAddonItem(item) || isStockedAddonLine(item);
    const weightIds = [...new Set(items.filter(countedForWeight).map((item) => item.product_id))];
    let productWeights: WeightMap = {};
    let variantWeights: VariantWeightMap = {};
    if (weightIds.length > 0) {
      const [{ data: pRows }, { data: vRows }] = await Promise.all([
        admin.from("products").select("id, weight").in("id", weightIds),
        admin.from("product_variants").select("product_id, color, size, weight").in("product_id", weightIds),
      ]);
      productWeights = productWeightMapFromRows(pRows as { id?: string | null; weight?: number | null }[]);
      variantWeights = variantWeightMapFromRows(
        vRows as { product_id?: string | null; color?: string | null; size?: string | null; weight?: number | null }[],
      );
    }
    const weightResult = sumWeightGramsBySize(
      items
        .filter(countedForWeight)
        .map((item) => ({ productId: item.product_id, color: item.color, size: item.size, quantity: item.quantity })),
      productWeights,
      variantWeights,
    );
    if (weightResult.missingQty > 0) {
      return bad("Berat sebagian produk belum diisi. Lengkapi berat produk dulu sebelum mengubah item.");
    }
    let newWeight = weightResult.grams;
    if (group === "open_order" && items.some((item) => isAddonItem(item) && !isStockedAddonLine(item))) {
      const { data: addonSetting } = await admin
        .from("store_settings")
        .select("open_order_addon_weight")
        .eq("id", 1)
        .maybeSingle();
      newWeight += resolveAddonWeight(addonSetting?.open_order_addon_weight);
    }
    const weightError = weightEditError(order.weight, newWeight);
    if (weightError) return bad(weightError);

    // Snapshot HPP dihitung SEBELUM RPC, lalu ditulis di transaksi yang sama. Index tetap
    // memakai posisi di `items` supaya pemasangan `line_index` di RPC tidak bergeser, tetapi
    // baris add-on dilewati (HPP-nya sudah tercakup kemasan — lihat `orderItemRows`).
    const hpp = await computeOrderHppForItems(
      admin,
      items
        .map((item, index) => ({
          line_index: index,
          product_id: item.product_id,
          product_name: item.product_name,
          color: item.color,
          size: item.size,
          quantity: item.quantity,
        }))
        .filter((row) => !isAddonItem(items[row.line_index])),
    );

    const rpcItems = items.map((item) => ({
      product_id: item.product_id,
      product_name: item.product_name,
      series: item.series,
      kain: item.kain,
      color: item.color,
      size: item.size,
      quantity: item.quantity,
      price: item.price,
      customer_price: item.customer_price ?? null,
      minimum_price: item.minimum_price ?? null,
      product_image: item.product_image ?? null,
    }));

    // Add-on format baru memegang stok varian katalog → dikirim terpisah supaya RPC menyimpan
    // warna/ukurannya dan ikut memotong/mengembalikan stok. Format lama tetap lewat
    // `p_addon_product_id` (varian dikosongkan, stok tidak disentuh).
    const stockedAddonPresent = items.some((item) => isStockedAddonLine(item));

    const manualHeader = isManual
      ? {
          customer_name: customerName,
          customer_whatsapp: customerWhatsapp,
          customer_id: customerId,
          source,
          shipping_address: shipping?.address ?? "",
          shipping_city: shipping ? shippingCityValue(shipping) : "",
          shipping_kecamatan: shipping?.kecamatan ?? "",
          shipping_province: shipping?.province ?? "",
          shipping_postal_code: shipping?.postal_code ?? "",
          shipping_notes: notes,
          shipping_cost: shippingCost,
          shipping_method: String(body?.shipping_method || "").trim() === "J&T HBO" ? "J&T HBO" : "",
          discount: finalDiscount,
          created_at: createdAt?.toISOString() ?? "",
        }
      : null;

    const { data: rpcResult, error: rpcError } = await admin.rpc("samaqu_edit_order_items", {
      p_order_id: order.id,
      p_actor: String((await opsIdentity(req))?.email || "ops"),
      p_items: rpcItems,
      p_hpp_items: hpp.items,
      p_hpp_goods: hpp.hpp_goods,
      p_new_weight: Math.round(newWeight),
      p_addon_product_id: group === "open_order" ? OPEN_ORDER_ADDON.id : "",
      p_addon_stocked_product_id:
        group === "open_order" && stockedAddonPresent ? OPEN_ORDER_ADDON_TARGET_ID : "",
      p_header: manualHeader,
      p_note: order.awb_no ? "Item diubah setelah resi terbit; label internal perlu dicetak ulang." : null,
    });
    if (rpcError) {
      console.error("[OPS] transaksi PATCH rpc:", rpcError.message);
      return bad(rpcError.message);
    }

    // Alamat baru (kalau admin menambahkannya) ikut masuk buku alamat pelanggan.
    if (isManual && body?.save_address) {
      await saveCustomerAddress(admin, customerId, customerName, customerWhatsapp, shipping!);
    }

    const warning =
      isManual && order.paid_at && Math.round(Number(order.total) || 0) !== total
        ? guard.warning
        : "";

    return NextResponse.json({
      order_number: order.order_number,
      total: Number((rpcResult as any)?.total ?? total),
      subtotal: Number((rpcResult as any)?.subtotal ?? subtotal),
      weight: Number((rpcResult as any)?.weight ?? newWeight),
      items_edited_after_resi: Boolean((rpcResult as any)?.items_edited_after_resi ?? order.awb_no),
      warning,
    });
  } catch (e) {
    console.error("[OPS] transaksi PATCH:", e);
    return NextResponse.json({ error: "Gagal menyimpan perubahan" }, { status: 500 });
  }
}

/**
 * Hapus transaksi manual dari menu Transaksi (ops) — dipakai untuk membuang data uji.
 *
 * Aturan aman:
 *  - Pesanan yang masih AKTIF dan sudah punya resi J&T TIDAK boleh dihapus di sini. Resinya akan
 *    tetap hidup di J&T (kurir tetap bisa menjemput) tanpa catatan lokal. Admin diarahkan
 *    "Batalkan" dulu karena jalur itulah yang mem-void resi di J&T.
 *    Pesanan yang SUDAH dibatalkan boleh dihapus walau `awb_no` masih tersimpan (jalur
 *    pembatalan tidak mengosongkan kolom itu) — resinya sudah di-void saat pembatalan.
 *  - Yang boleh dihapus hanya transaksi manual (bukan pesanan website yang sudah dibayar).
 *  - Stok dikembalikan DULU memakai RPC yang sama dengan pembatalan, hanya untuk pesanan yang
 *    stoknya benar-benar terpotong (`stock_reserved === true`) dan belum dibatalkan.
 *  - Urutan hapus: voucher_usages → order_items → orders (event tracking ikut terhapus lewat
 *    ON DELETE CASCADE pada `order_tracking_events`).
 */
export async function DELETE(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  try {
    const body = await req.json().catch(() => ({}));
    const orderNumber = String(body?.order_number || "").trim();
    if (!orderNumber) return bad("Nomor pesanan wajib diisi");

    const admin = getSupabaseAdmin();
    const { data: order, error } = await admin
      .from("orders")
      .select("id, order_number, status, source, awb_no, jnt_order_id, stock_reserved")
      .eq("order_number", orderNumber)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!order) return NextResponse.json({ error: "Pesanan tidak ditemukan" }, { status: 404 });

    if ((order.awb_no || order.jnt_order_id) && order.status !== "dibatalkan") {
      return bad(
        `Pesanan ini sudah punya resi J&T${order.awb_no ? ` (${order.awb_no})` : ""}. Batalkan dulu supaya resinya ikut dibatalkan di J&T.`,
      );
    }
    if (sourceKey(order.source) === "website") {
      return bad("Pesanan website tidak bisa dihapus dari menu Transaksi.");
    }

    const { data: items } = await admin
      .from("order_items")
      .select("product_id, color, size, quantity")
      .eq("order_id", order.id);

    // Stok dikembalikan hanya kalau memang pernah terpotong dan belum dikembalikan pembatalan.
    if (order.stock_reserved === true && order.status !== "dibatalkan") {
      for (const item of items || []) {
        if (!item?.product_id || !item?.color || !item?.size || !item?.quantity) continue;
        await admin.rpc("samaqu_restore_stock", {
          p_product_id: item.product_id,
          p_color: item.color,
          p_size: item.size,
          p_qty: item.quantity,
        });
      }
    }

    await admin.from("voucher_usages").delete().eq("order_id", order.id);

    const { error: itemsError } = await admin.from("order_items").delete().eq("order_id", order.id);
    if (itemsError) {
      console.error("[OPS] hapus item transaksi:", itemsError.message);
      return NextResponse.json({ error: "Gagal menghapus produk transaksi" }, { status: 500 });
    }

    const { error: orderError } = await admin.from("orders").delete().eq("id", order.id);
    if (orderError) {
      console.error("[OPS] hapus transaksi:", orderError.message);
      return NextResponse.json({ error: "Gagal menghapus transaksi" }, { status: 500 });
    }

    return NextResponse.json({ order_number: order.order_number, deleted: true });
  } catch (e) {
    console.error("[OPS] hapus transaksi:", e);
    return NextResponse.json({ error: "Gagal menghapus transaksi" }, { status: 500 });
  }
}
