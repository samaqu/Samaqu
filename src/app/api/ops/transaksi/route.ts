import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, opsIdentity, unauthorized } from "@/lib/ops-auth";
import { cancelOrderCompletely, type CancelableOrder } from "@/lib/cancel-order";
import { MANUAL_PRICE_MAX, MANUAL_PRICE_MIN, MANUAL_SOURCE_KEYS, RESELLER_SOURCE_KEY, hasManualPrice, itemSummary, manualPrice, orderSourceKey, orderSourceLabel, sourceKey, statusLabel } from "@/lib/transaksi";
import { localPhone } from "@/lib/whatsapp";
import { notifyCustomerInvoice, notifyCustomerPreorderCreated } from "@/lib/fonnte";
import { sendOnce } from "@/lib/order-notify";
import {
  PREORDER_MUST_BE_PAID_MESSAGE,
  isPreorder,
  isPreorderDpPending,
  isPreorderWaiting,
  normalizePreorderEstimate,
  parsePreorderCancelReason,
  parsePreorderDeadline,
  preorderBalanceDue,
  preorderDpFor,
  preorderDpLabel,
  preorderReadyLinesUnchanged,
  PREORDER_MIXED_READY_LOCKED_MESSAGE,
  PREORDER_NEEDS_PO_ITEM_MESSAGE,
} from "@/lib/preorder";
import { isLayananCategory } from "@/lib/layanan";
import { kotaFromShipping } from "@/lib/kota";
import { itemProductIds, loadOrderPhotoLookup } from "@/lib/order-photo-data";
import { resolveItemPhotos } from "@/lib/order-photo";
import { loadLenganTwinParents, lenganModelOf } from "@/lib/lengan-pendek";
import { changedRecipientFields, resiLockedMessage } from "@/lib/resi-lock";
import { cleanErrorMessage, recordAnomalyFromError, recordStockAnomaly, resolveFailureReason, restoreItemsStrict, stockFailureMessage } from "@/lib/stock-guard";
import { isGosend, normalizeOpsShippingMethod, shippingMethodForEdit } from "@/lib/gosend";
import {
  productWeightMapFromRows,
  resolveLineWeight,
  sumWeightGramsBySize,
  variantWeightMapFromRows,
  type VariantWeightMap,
  type WeightMap,
} from "@/lib/shipping-weight";
import { computeOrderHppForItems, snapshotOrderHpp } from "@/lib/produksi-order-hpp";
import { RESELLER_EDIT_NOTICE, orderEditGuard, weightEditError, type EditSourceGroup } from "@/lib/order-edit";
import {
  isOpenOrderAddonLine,
  isStockedAddonLine,
  OPEN_ORDER_ADDON,
  OPEN_ORDER_ADDON_TARGET_ID,
  OPEN_ORDER_ADDON_VARIANT,
  resolveAddonWeight,
} from "@/lib/open-order-config";
import { openOrderEffectivePrice } from "@/lib/open-order-offering";
import { syncLeadOnOrderSaved, syncLeadOnOrderEdited, revertLeadOnOrderCancelled } from "@/lib/ops-lead-sync";
import { attributionColumns, recordManualAttribution, resolveManualAttribution, type ManualAttribution } from "@/lib/affiliate/manual-attribution";
import {
  DUPLICATE_OPEN_STATUSES,
  POSSIBLE_DUPLICATE_CODE,
  duplicateMessage,
  duplicateSinceIso,
  findPossibleDuplicates,
} from "@/lib/duplicate-order";

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
  /** true = baris ini stok kosong (PO), menunggu "Stok sudah ready". Hanya berlaku saat pesanan Pre-Order. */
  is_preorder_item?: unknown;
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
  /** Kategori master produk; baris kategori "Jasa" tidak menyentuh stok. */
  category?: string | null;
  /** true = baris PO (stok kosong, menunggu ready); false = ready-stock, dipotong langsung. */
  is_preorder_item: boolean;
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
async function buildSnapshot(
  admin: Admin,
  input: ItemInput[],
  wantsPreorder: boolean,
): Promise<{ items?: Snapshot[]; error?: string }> {
  const cleaned = input
    .map((row) => ({
      product_id: String(row?.product_id || "").trim(),
      color: String(row?.color || "default").trim() || "default",
      size: String(row?.size || "").trim().toUpperCase(),
      quantity: Math.round(Number(row?.quantity) || 0),
      /** Harga manual ketikan admin; `undefined`/kosong = pakai harga katalog. */
      price: row?.price,
      // Bawaan: SEMUA baris PO saat mode Pre-Order dinyalakan (admin uncheck baris yang ready).
      // Pesanan reguler: selalu false, apa pun yang dikirim layar.
      is_preorder_item: wantsPreorder && row?.is_preorder_item !== false,
    }))
    .filter((row) => row.product_id);

  if (cleaned.length === 0) return { error: "Minimal satu produk harus diisi" };
  for (const row of cleaned) {
    if (!row.size) return { error: "Ukuran produk harus dipilih" };
    if (row.quantity < 1 || row.quantity > 99) return { error: "Jumlah produk harus antara 1 dan 99" };
  }

  const productIds = [...new Set(cleaned.map((row) => row.product_id))];
  const [{ data: products }, { data: variants }] = await Promise.all([
    admin.from("products").select("id, name, series, price, category, jenis_kain(name)").in("id", productIds),
    admin.from("product_variants").select("product_id, color, size").in("product_id", productIds),
  ]);

  const productById = new Map<string, any>((products || []).map((p: any) => [p.id, p]));
  const variantSet = new Set((variants || []).map((v: any) => `${v.product_id}||${v.color}||${String(v.size).toUpperCase()}`));
  // Produk yang menyebut warnanya di NAMA (mis. "Thobe Mint Karim") hanya punya satu baris
  // varian berwarna "default". Draft AI kadang mengirim warna dari nama produk ("Mint"),
  // jadi warna itu dipetakan ke "default" alih-alih ditolak. Produk yang benar-benar punya
  // beberapa warna tidak ikut dipetakan.
  const variantColors = new Map<string, Set<string>>();
  for (const v of variants || []) {
    const id = String((v as any).product_id);
    if (!variantColors.has(id)) variantColors.set(id, new Set());
    variantColors.get(id)!.add(String((v as any).color || "default"));
  }

  const items: Snapshot[] = [];
  for (const row of cleaned) {
    const product = productById.get(row.product_id);
    if (!product) return { error: `Produk tidak ditemukan (${row.product_id})` };
    if (!variantSet.has(`${row.product_id}||${row.color}||${row.size}`)) {
      const colors = variantColors.get(row.product_id);
      if (colors?.size === 1 && colors.has("default") && variantSet.has(`${row.product_id}||default||${row.size}`)) {
        row.color = "default";
      } else {
        return { error: `Ukuran ${row.size} tidak tersedia untuk ${product.name}` };
      }
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
      category: product.category ?? null,
      is_preorder_item: row.is_preorder_item,
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
  is_preorder_item: boolean;
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
  group: EditSourceGroup,
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
      is_preorder_item: Boolean(row?.is_preorder_item),
    }))
    .filter((row) => row.product_id);

  if (cleaned.length === 0) return { error: "Minimal satu produk harus diisi" };
  for (const row of cleaned) {
    // Baris add-on/bonus Cover & Hanger hanya dikenali di pesanan Open Order & Promo FCH.
    // Transaksi manual memakai produk `cover-hanger` sebagai produk BIASA (ukuran wajib,
    // bisa diubah/dihapus), jadi tidak ikut aturan add-on di sini.
    const openOrderAddon =
      (group === "open_order" || group === "promo_fch") && isOpenOrderAddonLine(row);
    if (!openOrderAddon && !row.size) return { error: "Ukuran produk harus dipilih" };
    if (row.quantity < 1 || row.quantity > 99) return { error: "Jumlah produk harus antara 1 dan 99" };
  }

  const productIds = [
    ...new Set(
      cleaned
        .filter((row) => !((group === "open_order" || group === "promo_fch") && isOpenOrderAddonLine(row)))
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
    if ((group === "open_order" || group === "promo_fch") && isOpenOrderAddonLine(row)) {
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
        // Add-on Open Order/Promo bukan konsep PO (PO hanya transaksi manual).
        is_preorder_item: false,
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
      is_preorder_item: row.is_preorder_item,
    });
  }

  return { items };
}
/**
 * Potong stok transaksi ops.
 *
 * `orderId` WAJIB dikirim: dipakai sebagai `ref_id` komponen (box kabak) di
 * stock_movements. Id ini dibuat sebelum pemotongan dan dipakai apa adanya saat insert
 * order, jadi ref tidak pernah berubah (retry hanya mengganti nomor order, bukan id).
 */
async function deductStock(admin: Admin, items: Snapshot[], orderId: string) {
  const done: Snapshot[] = [];
  for (const item of items) {
    // Baris layanan (mis. Jasa Potong Panjang) tidak punya stok.
    if (isLayananCategory(item.category)) continue;
    const { data, error } = await admin.rpc("samaqu_decrement_stock", {
      p_product_id: item.product_id,
      p_color: item.color,
      p_size: item.size,
      p_qty: item.quantity,
      p_ref_type: "component",
      p_ref_id: orderId,
    });
    if (error) return { ok: false as const, done, message: "Gagal memeriksa stok produk" };
    if (data === false) {
      // Pesan dibedakan: stok kurang, varian tidak ada, atau KOMPONENnya (Cover/Hanger) habis.
      const warna = item.color ?? "";
      const ukuran = item.size ?? "";
      const reason = await resolveFailureReason(admin, item.product_id, warna, ukuran);
      return {
        ok: false as const,
        done,
        message: stockFailureMessage(reason ?? "insufficient_stock", item.product_name, warna, ukuran),
      };
    }
    done.push(item);
  }
  return { ok: true as const, done };
}

/** Kembalikan stok yang sudah terpotong saat transaksi gagal — error dicatat, bukan diabaikan. */
async function restoreStock(admin: Admin, items: Snapshot[], orderId: string) {
  for (const item of items) {
    // Baris layanan tidak pernah dipotong, jadi tidak ada yang dikembalikan.
    if (isLayananCategory(item.category)) continue;
    const { error } = await admin.rpc("samaqu_restore_stock", {
      p_product_id: item.product_id,
      p_color: item.color,
      p_size: item.size,
      p_qty: item.quantity,
      p_ref_type: "component",
      p_ref_id: orderId,
    });
    if (error) {
      console.error("[OPS] Rollback stok gagal:", { orderId, item, message: error.message });
      await recordStockAnomaly(admin, {
        productId: item.product_id,
        color: item.color,
        size: item.size,
        qty: item.quantity,
        reason: "rollback_restore_failed",
        orderId,
        source: "ops-transaksi-rollback",
      });
    }
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
      "id, order_number, created_at, customer_id, customer_name, customer_whatsapp, status, source, stock_reserved, shipping_pending, created_by_admin, is_preorder, preorder_estimate, preorder_deadline, preorder_ready_at, preorder_dp_amount, preorder_settled_at, subtotal, discount, shipping_cost, shipping_cost_original, shipping_discount, shipping_promo_kind, shipping_method, total, shipping_notes, weight, awb_no, jnt_order_id, shipping_status, tracking_status_code, shipping_address, shipping_city, shipping_province, shipping_kecamatan, shipping_postal_code, payment_method, payment_status, paid_at, payment_provider, payment_channel, reseller_id, reseller_balance_deduction, reseller_shortfall_amount, reseller_shortfall_status, show_reseller_name_on_label, affiliate_id, referral_code",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  // Batas bulan dihitung dalam WIB supaya transaksi dini hari tidak salah bulan.
  if (start) query = query.gte("created_at", wibDayStart(start));
  if (end) query = query.lt("created_at", wibDayStart(shiftDay(end, 1)));

  // Opsional: satu pesanan menurut nomornya (dipakai menu Reseller untuk membuka Detail Transaksi
  // pesanan lama tanpa menunggu daftar bulan berjalan). Tanpa parameter ini perilaku lama tidak berubah.
  const orderNumberParam = String(sp.get("order_number") || "").trim();
  if (orderNumberParam) query = query.eq("order_number", orderNumberParam);

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

  // Pembayaran kekurangan reseller — dipakai drawer untuk menurunkan label metode bayar
  // ("Saldo Reseller", "Saldo Reseller + Transfer (BSI) · menunggu verifikasi", …).
  // Hanya pesanan reseller yang punya baris di sini; pesanan biasa tidak terpengaruh.
  const resellerPaymentByOrder = new Map<
    string,
    { amount: number; status: string; payment_method: string | null }
  >();
  const orderNumbersById = new Set<string>();
  for (const order of list as any[]) {
    if (order.reseller_id) orderNumbersById.add(String(order.id));
  }
  if (orderNumbersById.size > 0) {
    const { data: paymentRows } = await admin
      .from("reseller_order_payments")
      .select("order_id, amount, status, payment_method, created_at")
      .in("order_id", [...orderNumbersById])
      .order("created_at", { ascending: false });
    for (const row of paymentRows || []) {
      const key = String((row as any).order_id);
      if (resellerPaymentByOrder.has(key)) continue; // ambil yang terbaru saja
      resellerPaymentByOrder.set(key, {
        amount: Number((row as any).amount) || 0,
        status: String((row as any).status || ""),
        payment_method: ((row as any).payment_method as string | null) ?? null,
      });
    }
  }

  const { data: lineItems } = await admin
    .from("order_items")
    .select(
      "id, order_id, product_id, product_name, series, kain, color, size, quantity, price, product_image, customer_price, minimum_price, reseller_buy_price, reseller_sell_price, is_preorder_item",
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

  // Nama toko reseller untuk blok "Reseller" di drawer (badge baris sudah dihapus).
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

  // Model Koko (Lengan Panjang / Pendek) per item untuk chip di detail pesanan. Hanya bantuan
  // tampilan: gagal dibaca = tanpa chip Panjang, daftar pesanan tetap jalan.
  let lenganTwinParents = new Set<string>();
  try {
    lenganTwinParents = await loadLenganTwinParents(admin, productIds);
  } catch (error) {
    console.error("[OPS] model lengan gagal dibaca (dilewati):", error);
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
      lengan_model: lenganModelOf(item, lenganTwinParents),
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
      // Baris pembayaran kekurangan terbaru (null untuk pesanan non-reseller).
      reseller_payment: resellerPaymentByOrder.get(String(order.id)) || null,
      show_reseller_name_on_label: order.show_reseller_name_on_label === true,
      status,
      // PO yang baru DP tampil "DP 50%" (bukan "Lunas") sampai pelunasan dicatat.
      status_label: preorderDpLabel(order) ?? statusLabel(status),
      subtotal: Number(order.subtotal) || 0,
      discount: Number(order.discount) || 0,
      shipping_cost: Number(order.shipping_cost) || 0,
      // Promo ongkir (gratis ongkir / potongan) — sama untuk website & draft bot WA. Null/0 kalau
      // tidak ada promo yang dipakai, jadi drawer tidak menampilkan lencana apa pun (perilaku lama).
      shipping_cost_original: Number(order.shipping_cost_original) || 0,
      shipping_discount: Number(order.shipping_discount) || 0,
      shipping_promo_kind: order.shipping_promo_kind || null,
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
      edit_reason: editGuard.reason,
      edit_warning: editGuard.warning,
      weight: order.weight == null ? null : Number(order.weight) || 0,
      items_edited_at: null,
      items_edited_after_resi: editedAfterResi.get(String(order.id)) || false,
      can_cancel: status === "pending" || status === "diproses",
      // Pre-order: penanda dipakai tabel, kartu, dan drawer. Pesanan reguler selalu false/null.
      is_preorder: order.is_preorder === true,
      preorder_estimate: order.preorder_estimate || null,
      preorder_deadline: order.preorder_deadline || null,
      preorder_ready_at: order.preorder_ready_at || null,
      preorder_waiting: isPreorderWaiting(order),
      // DP pre-order: nominal DP, waktu pelunasan, dan sisa tagihan (0 kalau lunas/bukan PO ber-DP).
      preorder_dp_amount: Number(order.preorder_dp_amount) > 0 ? Number(order.preorder_dp_amount) : null,
      preorder_settled_at: order.preorder_settled_at || null,
      dp_pending: isPreorderDpPending(order),
      balance_due: preorderBalanceDue(order),
      // Pesanan reseller "ongkir menyusul" (tahap "Menunggu Ongkir") + admin yang membuatkannya.
      shipping_pending: order.shipping_pending === true,
      created_by_admin: order.created_by_admin || null,
      // Atribusi affiliate (kode yang sudah terpasang); form Ubah menampilkannya read-only.
      affiliate_id: order.affiliate_id || null,
      referral_code: order.referral_code || "",
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
    // Kurir yang boleh tersimpan: "J&T HBO", "GoSend SAMAQU", "GoSend Customer"; selain itu dikosongkan
    // (perilaku lama). GoSend: ongkir tidak dicatat (diurus di luar sistem), jadi dipaksa 0.
    const shippingMethod = normalizeOpsShippingMethod(body?.shipping_method);
    const shippingCost = isGosend(shippingMethod) ? 0 : Math.max(0, Math.round(Number(body?.shipping_cost) || 0));
    // Promo ongkir (draft bot yang disetujui): hanya dicatat kalau angkanya konsisten (asli − potongan = dibayar).
    // Tanpa field ini (form admin biasa) tidak ada yang berubah.
    const promoOriginal = Math.max(0, Math.round(Number(body?.shipping_cost_original) || 0));
    const promoDiscount = Math.max(0, Math.round(Number(body?.shipping_discount) || 0));
    const promoKind = String(body?.shipping_promo_kind || "");
    const promoOngkirValid =
      (promoKind === "jabo" || promoKind === "luar") &&
      promoDiscount > 0 &&
      promoOriginal - promoDiscount === shippingCost &&
      !isGosend(shippingMethod);
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

    // Kode affiliate (opsional): order yang masuk lewat chat WA tidak punya cookie link referral, jadi admin memasukkan kodenya.
    // Dicek SEBELUM stok dipotong, supaya kode yang salah tidak meninggalkan pesanan setengah jadi.
    const affiliateCode = String(body?.affiliate_code || "").trim();
    let attribution: Extract<ManualAttribution, { ok: true }> | null = null;
    if (affiliateCode) {
      const checked = await resolveManualAttribution(admin, affiliateCode, { phone: customerWhatsapp });
      if (!checked.ok) return bad(checked.error);
      attribution = checked;
    }
    const actorEmail = (await opsIdentity(req))?.email || "admin";

    // Dibutuhkan SEBELUM membangun snapshot: menentukan baris mana yang bawaannya PO (lihat
    // `buildSnapshot`). Pesanan reguler (wantsPreorder false): seluruh baris selalu ready.
    const wantsPreorder = body?.is_preorder === true;

    const snapshot = await buildSnapshot(admin, inputItems, wantsPreorder);
    if (snapshot.error || !snapshot.items) return bad(snapshot.error || "Produk tidak valid");

    const items = snapshot.items;
    // Pesanan campuran didukung: baris ready (`is_preorder_item` false) dipotong stoknya langsung;
    // baris PO (true) menunggu "Stok sudah ready". Mode Pre-Order tanpa satu pun baris PO tidak
    // bermakna (sama saja pesanan reguler) — admin diminta mematikan togglenya saja.
    if (wantsPreorder && !items.some((item) => item.is_preorder_item)) {
      return bad(PREORDER_NEEDS_PO_ITEM_MESSAGE);
    }
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const finalDiscount = Math.min(discount, subtotal);
    const total = subtotal - finalDiscount + shippingCost;

    // Pre-order: customer transfer dulu, ukuran boleh kosong untuk baris PO-nya, dan wajib Lunas.
    // Pesanan reguler: tidak berubah. (`wantsPreorder` sudah dihitung di atas, sebelum snapshot.)
    if (wantsPreorder && String(body?.payment_status || "paid").trim().toLowerCase() === "unpaid") {
      return bad(PREORDER_MUST_BE_PAID_MESSAGE);
    }
    // Deadline wajib diisi untuk PO baru — dipakai PDF "Export PDF Produksi" per pesanan.
    const deadlineResult = wantsPreorder ? parsePreorderDeadline(body?.preorder_deadline) : null;
    if (deadlineResult && !deadlineResult.ok) return bad(deadlineResult.error);
    // DP pre-order: nominalnya DIHITUNG SERVER (50% dari total), bukan angka dari browser. `preorder_dp`
    // hanya penanda "pilih DP". Hanya berlaku untuk pre-order; pesanan reguler mengabaikannya.
    const dpAmount = wantsPreorder && body?.preorder_dp === true ? preorderDpFor(total) : 0;
    if (wantsPreorder && body?.preorder_dp === true && dpAmount <= 0) {
      return bad("Total pesanan belum terisi, DP 50% belum bisa dihitung.");
    }

    // Pengaman order dobel: nomor HP / nama yang sama dengan pesanan yang masih terbuka (14 hari).
    // Hanya PERINGATAN (409) — admin boleh lanjut dengan `confirm_duplicate: true`. Diperiksa SEBELUM
    // stok dipotong, jadi penolakan di sini tidak menyentuh stok. Kegagalan pengecekan tidak boleh
    // menghalangi pencatatan (fail-open, hanya dicatat di log).
    if (body?.confirm_duplicate !== true) {
      try {
        const { data: openOrders, error: dupError } = await admin
          .from("orders")
          .select("order_number, customer_name, customer_whatsapp, status, total, created_at, is_preorder")
          .in("status", [...DUPLICATE_OPEN_STATUSES])
          .gte("created_at", duplicateSinceIso())
          .order("created_at", { ascending: false })
          .limit(2000);
        if (dupError) throw new Error(dupError.message);
        const matches = findPossibleDuplicates(openOrders || [], { phone: customerWhatsapp, name: customerName });
        if (matches.length) {
          return NextResponse.json(
            { error: duplicateMessage(matches), code: POSSIBLE_DUPLICATE_CODE, matches },
            { status: 409 },
          );
        }
      } catch (dupCheckError) {
        console.error("[OPS] cek order dobel gagal (dilewati):", dupCheckError);
      }
    }

    // Stok dipotong sebelum pesanan disimpan — kalau ada yang kurang, tidak ada yang tersimpan.
    // `orderId` dibuat DI SINI (sebelum potong) supaya bisa dipakai sebagai ref komponen.
    // Saat insert nanti hanya `order_number` yang boleh berubah karena bentrok; id tetap.
    const orderId = crypto.randomUUID();
    // Hanya baris READY (`is_preorder_item` false) yang dipotong stoknya sekarang — baris PO
    // menunggu "Stok sudah ready" seperti sebelumnya. Pesanan reguler: semua baris ready, jadi
    // perilakunya identik dengan sebelum ada pesanan campuran.
    const readyItems = items.filter((item) => !item.is_preorder_item);
    // Barang yang benar-benar terpotong stoknya di request ini — dasar rollback.
    const stockHeld: Snapshot[] = readyItems;
    if (readyItems.length > 0) {
      const deducted = await deductStock(admin, readyItems, orderId);
      if (!deducted.ok) {
        await restoreStock(admin, deducted.done, orderId);
        return bad(deducted.message);
      }
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
      ...(promoOngkirValid
        ? { shipping_cost_original: promoOriginal, shipping_discount: promoDiscount, shipping_promo_kind: promoKind }
        : {}),
      ...(shippingMethod ? { shipping_method: shippingMethod } : {}),
      payment_method: paymentMethod,
      payment_status: paid ? "paid" : "unpaid",
      paid_at: paid ? createdAt.toISOString() : null,
      subtotal,
      discount: finalDiscount,
      total,
      status: paid ? "diproses" : "pending",
      // true kalau ADA baris yang stoknya dipotong di atas (baris ready) → pembatalan wajib
      // mengembalikan baris itu. PO murni (semua baris PO, readyItems kosong): tetap false,
      // sama seperti sebelum ada pesanan campuran.
      stock_reserved: readyItems.length > 0,
      ...(wantsPreorder
        ? {
            is_preorder: true,
            preorder_estimate: normalizePreorderEstimate(body?.preorder_estimate),
            preorder_deadline: deadlineResult && deadlineResult.ok ? deadlineResult.value : null,
            ...(dpAmount > 0 ? { preorder_dp_amount: dpAmount } : {}),
          }
        : {}),
      source,
      created_at: createdAt.toISOString(),
      updated_at: createdAt.toISOString(),
      ...(attribution ? attributionColumns(attribution, new Date().toISOString()) : {}),
    };

    let order: { id: string; order_number: string } | null = null;
    let insertError: { message: string } | null = null;
    for (let attempt = 0; attempt < 5 && !order; attempt += 1) {
      // `id` HARUS tetap sama di setiap percobaan — ia sudah dipakai sebagai `ref_id`
      // komponen saat memotong stok. Retry hanya mengganti `order_number`.
      const candidate = { ...orderRow, id: orderId, order_number: newOrderNumber(createdAt) };
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
      await restoreStock(admin, stockHeld, orderId);
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
        is_preorder_item: item.is_preorder_item,
      })),
    );

    if (itemsError) {
      await admin.from("orders").delete().eq("id", order.id);
      await restoreStock(admin, stockHeld, order.id);
      console.error("[OPS] transaksi items:", itemsError.message);
      return bad("Gagal menyimpan produk transaksi. Coba lagi.");
    }

    // Snapshot HPP per baris. Kegagalan snapshot tidak boleh menggagalkan transaksi.
    try {
      await snapshotOrderHpp(admin, order.id);
    } catch (snapshotError) {
      console.error("[OPS] snapshot HPP order:", order.order_number, snapshotError);
    }

    // Komisi affiliate (kolom atribusi sudah ikut tersimpan di baris pesanan). Gagal mencatat komisi tidak membatalkan
    // pesanan; admin diberi peringatan supaya komisinya bisa dicek manual.
    let affiliateInfo: { code: string; name: string; commission: number | null } | null = null;
    if (attribution) {
      try {
        const commission = await recordManualAttribution(admin, {
          orderId: order.id,
          orderNumber: order.order_number,
          attribution,
          items: items.map((item) => ({ productId: String(item.product_id), price: Number(item.price) || 0, quantity: Number(item.quantity) || 0 })),
          actor: actorEmail,
        });
        affiliateInfo = { code: attribution.code, name: attribution.name, commission };
      } catch (affiliateError) {
        console.error("[OPS] transaksi komisi affiliate:", order.order_number, affiliateError);
        affiliateInfo = { code: attribution.code, name: attribution.name, commission: null };
      }
    }

    // Alamat baru (kalau admin menambahkannya) ikut masuk buku alamat pelanggan.
    if (body?.save_address) await saveCustomerAddress(admin, customerId, customerName, customerWhatsapp, shipping);

    // Sinkron ke lead: nomor HP yang sama + lead Belum Closing (maks. 60 hari sebelum order)
    // → otomatis Closing, nominal dari total, relasi disimpan di `leads.order_id`.
    // Kegagalan sync tidak boleh menggagalkan transaksi yang sudah tersimpan.
    try {
      await syncLeadOnOrderSaved(admin, {
        whatsapp: customerWhatsapp,
        orderId: order.id,
        orderNumber: order.order_number,
        total,
        orderCreatedAt: createdAt.toISOString(),
      });
    } catch (leadError) {
      console.error("[OPS] transaksi lead sync:", leadError);
    }

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

    // Pre-order dicatat → SATU WA ke pembeli (estimasi + "tidak dapat dibatalkan"). Klaim
    // `notify_created_at` membuatnya tidak pernah dobel; kegagalan kirim tidak membatalkan PO.
    if (wantsPreorder) {
      await sendOnce(order.id, "created", "WA pre-order dicatat", () =>
        notifyCustomerPreorderCreated({
          orderNumber: order!.order_number,
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
          estimate: normalizePreorderEstimate(body?.preorder_estimate),
          // DP: teks WA menyebut DP yang diterima dan sisa yang harus dibayar.
          ...(dpAmount > 0 ? { dp: { amount: dpAmount, balance: Math.max(0, total - dpAmount), total } } : {}),
        }),
      );
    }

    return NextResponse.json({
      order_number: order.order_number,
      total,
      ...(wantsPreorder ? { is_preorder: true } : {}),
      ...(dpAmount > 0 ? { preorder_dp_amount: dpAmount, balance_due: Math.max(0, total - dpAmount) } : {}),
      ...(affiliateInfo ? { affiliate: affiliateInfo } : {}),
    });
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
      .select("id, order_number, status, source, awb_no, jnt_order_id, stock_reserved, promo_bonus_given, customer_name, customer_whatsapp, customer_id, shipping_status, weight, subtotal, total, discount, shipping_cost, paid_at, reseller_id, shipping_method, is_preorder, preorder_ready_at, shipping_address, shipping_city, shipping_kecamatan, shipping_province, shipping_postal_code, affiliate_id, customer_email")
      .eq("order_number", orderNumber)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!order) return bad("Pesanan tidak ditemukan");

    // Pasang kode affiliate pada pesanan yang SUDAH tercatat (mis. order WA yang kodenya baru diketahui kemudian).
    // Hanya bila pesanan belum punya affiliate dan belum dibatalkan; item pesanan tidak disentuh.
    if (action === "set_affiliate") {
      if (order.affiliate_id) return bad("Pesanan ini sudah punya affiliate.");
      if (order.status === "dibatalkan") return bad("Pesanan yang dibatalkan tidak bisa dikreditkan ke affiliate");
      const attribution = await resolveManualAttribution(admin, body?.affiliate_code, { phone: order.customer_whatsapp, email: order.customer_email });
      if (!attribution.ok) return bad(attribution.error);
      const { data: itemRows, error: itemErr } = await admin.from("order_items").select("product_id, price, quantity").eq("order_id", order.id);
      if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 });
      const commission = await recordManualAttribution(admin, {
        orderId: order.id,
        orderNumber: order.order_number,
        attribution,
        items: (itemRows || []).map((row: any) => ({ productId: String(row.product_id), price: Number(row.price) || 0, quantity: Number(row.quantity) || 0 })),
        actor: (await opsIdentity(req))?.email || "admin",
        writeOrderColumns: true,
      });
      return NextResponse.json({ order_number: order.order_number, affiliate: { code: attribution.code, name: attribution.name, commission } });
    }

    if (action === "cancel") {
      // "Dibatalkan sebelum dikirim" — pesanan yang sudah jalan tidak bisa dibatalkan di sini.
      if (order.status !== "pending" && order.status !== "diproses") {
        return bad("Pesanan yang sudah dikirim atau sudah dibatalkan tidak bisa dibatalkan di sini");
      }
      // Pre-order tidak bisa dibatalkan ke customer; admin hanya boleh membatalkan dengan alasan
      // wajib, yang tersimpan di `orders.cancel_reason` (terbaca di riwayat). Reguler: tidak berubah.
      let cancelRemark = "Dibatalkan dari menu Transaksi";
      if (isPreorder(order)) {
        const reason = parsePreorderCancelReason({ reason: body?.reason, note: body?.reason_note });
        if (!reason.ok) return bad(reason.error);
        cancelRemark = reason.text;
      }
      const result = await cancelOrderCompletely(
        {
          id: order.id,
          order_number: order.order_number,
          status: order.status,
          awb_no: order.awb_no,
          jnt_order_id: order.jnt_order_id,
          stock_reserved: order.stock_reserved,
          promo_bonus_given: order.promo_bonus_given,
          customer_name: order.customer_name,
          customer_whatsapp: order.customer_whatsapp,
          is_preorder: order.is_preorder === true,
        } as CancelableOrder,
        cancelRemark,
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
    // Pre-order yang menunggu stok: diedit lewat fungsi khusus yang TIDAK menyentuh stok.
    const isPoEdit = guard.preorder === true;

    const inputItems: ItemInput[] = Array.isArray(body?.items) ? body.items : [];
    if (inputItems.length === 0) return bad("Minimal satu produk harus diisi");

    const { data: oldRows, error: oldError } = await admin
      .from("order_items")
      .select("id, product_id, product_name, series, kain, color, size, quantity, price, customer_price, minimum_price, product_image, is_preorder_item")
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
      is_preorder_item: row.is_preorder_item === true,
    }));
    if (oldItems.length === 0) return bad("Pesanan ini tidak punya item untuk diubah");

    // Pesanan reseller: HANYA ukuran/warna. Qty, produk/series, harga, jumlah baris,
    // total, saldo, dan kekurangan tidak boleh berubah. RPC khusus memperbarui baris
    // yang ada (kolom reseller_buy_price/reseller_sell_price tetap utuh).
    if (group === "reseller") {
      if (!order.reseller_id) return bad("Pesanan ini bukan pesanan reseller.");
      if (inputItems.length !== oldItems.length) return bad(RESELLER_EDIT_NOTICE);

      const oldById = new Map(oldItems.map((item) => [item.id, item]));
      const seen = new Set<string>();
      const updates: { id: string; color: string; size: string }[] = [];

      for (const row of inputItems) {
        const id = String(row?.source_item_id || "").trim();
        const old = oldById.get(id);
        if (!id || !old || seen.has(id)) return bad(RESELLER_EDIT_NOTICE);
        seen.add(id);

        if (String(row?.product_id || "").trim() !== old.product_id) return bad(RESELLER_EDIT_NOTICE);
        const quantity = Math.round(Number(row?.quantity) || 0);
        if (quantity !== old.quantity) return bad(RESELLER_EDIT_NOTICE);
        if (row?.price !== undefined && row?.price !== null && String(row.price).trim() !== "") {
          const price = Math.round(Number(row.price));
          if (!Number.isFinite(price) || price !== old.price) return bad(RESELLER_EDIT_NOTICE);
        }

        const color = String(row?.color || "default").trim() || "default";
        const size = String(row?.size || "").trim().toUpperCase();
        if (!size) return bad("Ukuran produk harus dipilih");
        updates.push({ id, color, size });
      }
      if (seen.size !== oldItems.length) return bad(RESELLER_EDIT_NOTICE);

      const productIds = [...new Set(oldItems.map((item) => item.product_id).filter(Boolean))];
      const { data: variantRows, error: variantError } = await admin
        .from("product_variants")
        .select("product_id, color, size")
        .in("product_id", productIds);
      if (variantError) return NextResponse.json({ error: variantError.message }, { status: 500 });
      const variantSet = new Set(
        (variantRows || []).map(
          (variant: any) =>
            `${variant.product_id}||${variant.color || "default"}||${String(variant.size || "").toUpperCase()}`,
        ),
      );
      for (const update of updates) {
        const old = oldById.get(update.id)!;
        const unchanged =
          update.color === (old.color || "default") &&
          update.size === String(old.size || "").toUpperCase();
        if (unchanged) continue;
        if (!variantSet.has(`${old.product_id}||${update.color}||${update.size}`)) {
          return bad(`Ukuran ${update.size} / warna ${update.color} tidak tersedia untuk produk ini.`);
        }
      }

      const { data: rpcResult, error: rpcError } = await admin.rpc("samaqu_edit_reseller_order_items", {
        p_order_id: order.id,
        p_actor: String((await opsIdentity(req))?.email || "ops"),
        p_items: updates,
        p_note: order.awb_no
          ? "Ukuran/warna item diubah setelah resi terbit; label internal perlu dicetak ulang."
          : null,
      });
      if (rpcError) {
        console.error("[OPS] transaksi PATCH reseller rpc:", rpcError.message);
        // Transaksi SQL sudah rollback → catat anomali dari penanda STOCK_ANOMALY di luar transaksi.
        await recordAnomalyFromError(admin, rpcError.message || "", "ops-edit-reseller-order", order.order_number);
        return bad(cleanErrorMessage(rpcError.message || "") || "Gagal menyimpan perubahan item");
      }

      return NextResponse.json({
        order_number: order.order_number,
        total: Number(order.total) || 0,
        subtotal: Number(order.subtotal) || 0,
        weight: Number(order.weight) || 0,
        items_edited_after_resi: Boolean((rpcResult as any)?.items_edited_after_resi ?? order.awb_no),
        warning: "",
      });
    }

    // Add-on/bonus Cover & Hanger tidak boleh berubah: jumlah baris, qty, dan harga harus sama.
    // Pengenalannya lewat satu helper — format lama (`addon-cover-hanger`) dan format baru
    // (`cover-hanger` + varian add-on) sama-sama dipatok.
    // Berlaku untuk Open Order DAN Promo Free Cover Hanger (bonus promo memakai baris yang sama).
    if (group === "open_order" || group === "promo_fch") {
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
    // Catatan admin: dibaca untuk SEMUA jenis transaksi (manual, Open Order/CYO, website, dst),
    // bukan cuma manual — form Ubah menampilkan kotak Catatan tanpa pembeda sumber, jadi server
    // tidak boleh diam-diam membuangnya untuk pesanan non-manual.
    let notes = String(body?.notes || "").trim();
    let shippingCost = Number(order.shipping_cost) || 0;
    let discount = Number(order.discount) || 0;
    let createdAt: Date | null = null;
    let shipping: Shipping | null = null;

    if (isManual) {
      customerName = String(body?.customer_name || "").trim();
      customerWhatsapp = String(body?.customer_whatsapp || "").trim();
      customerId = String(body?.customer_id || "").trim() || order.customer_id || null;
      source = String(body?.source || "").trim().toLowerCase();
      // GoSend: ongkir tidak dicatat → 0, berapa pun yang dikirim form.
      shippingCost = isGosend(normalizeOpsShippingMethod(body?.shipping_method))
        ? 0
        : Math.max(0, Math.round(Number(body?.shipping_cost) || 0));
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

      // Resi J&T sudah terbit: penerima dan alamat TIDAK boleh berubah (resi di J&T tidak ikut berubah). Dicek SEBELUM
      // ada yang disimpan, jadi penolakan tidak meninggalkan perubahan setengah jalan.
      if ((order.awb_no || order.jnt_order_id) && order.status !== "dibatalkan") {
        const changed = changedRecipientFields(
          {
            name: order.customer_name,
            whatsapp: order.customer_whatsapp,
            address: order.shipping_address,
            city: order.shipping_city,
            kecamatan: order.shipping_kecamatan,
            province: order.shipping_province,
            postal: order.shipping_postal_code,
          },
          {
            name: customerName,
            whatsapp: customerWhatsapp,
            address: shipping.address,
            city: shippingCityValue(shipping),
            kecamatan: shipping.kecamatan,
            province: shipping.province,
            postal: shipping.postal_code,
          },
        );
        if (changed.length > 0) return bad(resiLockedMessage(order.awb_no, changed));
      }
    }

    const snapshot = await buildEditSnapshot(admin, inputItems, oldItems, group);
    if (snapshot.error || !snapshot.items) return bad(snapshot.error || "Produk tidak valid");
    const items = snapshot.items;

    // Pesanan campuran (ada baris ready DAN baris PO): baris ready SUDAH kepotong stoknya saat
    // dicatat, tapi `samaqu_edit_preorder_items` tidak menyentuh stok sama sekali — jadi baris
    // ready harus persis sama sebelum/sesudah (produk/warna/ukuran/qty), supaya stok yang sudah
    // terpotong tidak diam-diam berubah. Baris PO dan field pesanan lain tetap bebas diubah.
    if (isPoEdit) {
      const oldReady = oldItems.filter((it) => it.is_preorder_item === false);
      const newReady = items.filter((it) => !it.is_preorder_item);
      if (!preorderReadyLinesUnchanged(oldReady, newReady)) {
        return bad(PREORDER_MIXED_READY_LOCKED_MESSAGE);
      }
    }

    const allSubtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    // Baris bonus/add-on dipisah dari subtotal untuk Open Order & promo (harganya Rp 0).
    const withAddon = group === "open_order" || group === "promo_fch";
    const addonTotal =
      withAddon
        ? items
            .filter((item) => isOpenOrderAddonLine(item))
            .reduce((sum, item) => sum + item.price * item.quantity, 0)
        : 0;
    const subtotal = withAddon ? allSubtotal - addonTotal : allSubtotal;

    let finalDiscount = 0;
    let total = 0;
    if (isManual) {
      finalDiscount = Math.min(discount, subtotal);
      total = subtotal + addonTotal + shippingCost - finalDiscount;
    } else if (withAddon) {
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
    const isAddonItem = (item: Snapshot) => withAddon && isOpenOrderAddonLine(item);
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
    if (withAddon && items.some((item) => isAddonItem(item) && !isStockedAddonLine(item))) {
      const { data: addonSetting } = await admin
        .from("store_settings")
        .select("open_order_addon_weight")
        .eq("id", 1)
        .maybeSingle();
      newWeight += resolveAddonWeight(addonSetting?.open_order_addon_weight);
    }
    // PO menunggu stok belum punya resi, jadi berat boleh bertambah (batas berat hanya untuk pesanan
    // yang resinya mungkin sudah terbit).
    const weightError = isPoEdit ? "" : weightEditError(order.weight, newWeight);
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
      // Dibaca hanya oleh `samaqu_edit_preorder_items` (RPC reguler mengabaikan field tak dikenal).
      is_preorder_item: item.is_preorder_item,
    }));

    // Add-on format baru memegang stok varian katalog → dikirim terpisah supaya RPC menyimpan
    // warna/ukurannya dan ikut memotong/mengembalikan stok. Format lama tetap lewat
    // `p_addon_product_id` (varian dikosongkan, stok tidak disentuh).
    const stockedAddonPresent = items.some((item) => isStockedAddonLine(item));

    // Deadline PO wajib ada di setiap simpanan, termasuk saat mengedit item PO lama yang belum
    // punya deadline (migrasi aditif: PO lama kolomnya NULL sampai admin isi lewat form edit ini).
    const editDeadlineResult = isPoEdit ? parsePreorderDeadline(body?.preorder_deadline) : null;
    if (editDeadlineResult && !editDeadlineResult.ok) return bad(editDeadlineResult.error);

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
          // Fungsi DB hanya menimpa kolom ini kalau nilainya TIDAK kosong; pindah dari GoSend ke J&T
          // harus kirim nilai eksplisit ("reguler"), kalau tidak GoSend tetap menempel.
          shipping_method: shippingMethodForEdit(body?.shipping_method, order.shipping_method),
          discount: finalDiscount,
          created_at: createdAt?.toISOString() ?? "",
          // Estimasi PO hanya ikut kalau form mengirimnya (tidak menimpa estimasi khusus tanpa sengaja).
          ...(isPoEdit && body?.preorder_estimate !== undefined
            ? { preorder_estimate: normalizePreorderEstimate(body.preorder_estimate) }
            : {}),
          // Deadline PO: sudah divalidasi wajib ada di atas (`editDeadlineResult`) sebelum sampai sini.
          ...(isPoEdit && editDeadlineResult?.ok ? { preorder_deadline: editDeadlineResult.value } : {}),
        }
      : // Non-manual (Open Order/CYO, website, reseller, promo): identitas/alamat/total tetap
        // terkunci (checkout yang menentukan), tapi Catatan tetap boleh diisi admin — RPC
        // `samaqu_edit_order_items` sekarang ikut membaca `shipping_notes` di luar grup manual.
        body?.notes !== undefined
        ? { shipping_notes: notes }
        : null;

    const { data: rpcResult, error: rpcError } = isPoEdit
      ? await admin.rpc("samaqu_edit_preorder_items", {
          p_order_id: order.id,
          p_actor: String((await opsIdentity(req))?.email || "ops"),
          p_items: rpcItems,
          p_hpp_items: hpp.items,
          p_hpp_goods: hpp.hpp_goods,
          p_new_weight: Math.round(newWeight),
          p_header: manualHeader,
          p_note: "Item pre-order diubah (stok belum dipotong).",
        })
      : await admin.rpc("samaqu_edit_order_items", {
          p_order_id: order.id,
          p_actor: String((await opsIdentity(req))?.email || "ops"),
          p_items: rpcItems,
          p_hpp_items: hpp.items,
          p_hpp_goods: hpp.hpp_goods,
          p_new_weight: Math.round(newWeight),
          p_addon_product_id: withAddon ? OPEN_ORDER_ADDON.id : "",
          p_addon_stocked_product_id:
            withAddon && stockedAddonPresent ? OPEN_ORDER_ADDON_TARGET_ID : "",
          p_header: manualHeader,
          p_note: order.awb_no ? "Item diubah setelah resi terbit; label internal perlu dicetak ulang." : null,
        });
    if (rpcError) {
      console.error("[OPS] transaksi PATCH rpc:", rpcError.message);
      // Transaksi SQL sudah rollback → catat anomali dari penanda STOCK_ANOMALY di luar transaksi.
      await recordAnomalyFromError(admin, rpcError.message || "", "ops-edit-order", order.order_number);
      return bad(cleanErrorMessage(rpcError.message || "") || "Gagal menyimpan perubahan item");
    }

    // Nominal lead yang tertaut ikut diperbarui (harga produk saja, tanpa ongkir). Gagal di sini
    // TIDAK membatalkan perubahan pesanan yang sudah tersimpan.
    try {
      await syncLeadOnOrderEdited(admin, order.id);
    } catch (leadError) {
      console.error("[OPS] transaksi PATCH: sinkron lead gagal:", leadError);
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
      .select("id, order_number, status, source, awb_no, jnt_order_id, stock_reserved, is_preorder, preorder_ready_at")
      .eq("order_number", orderNumber)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!order) return NextResponse.json({ error: "Pesanan tidak ditemukan" }, { status: 404 });

    // Pre-order tidak bisa dibuang diam-diam: hapus butuh alasan, sama seperti batal. Barisnya hilang,
    // jadi alasannya dicatat di log server (pembatalan menyimpan alasan di `orders.cancel_reason`).
    if (isPreorder(order)) {
      const reason = parsePreorderCancelReason({ reason: body?.reason, note: body?.reason_note });
      if (!reason.ok) return bad(reason.error);
      console.warn("[PREORDER] hapus:", order.order_number, "|", reason.text, "|", String((await opsIdentity(req))?.email || "ops"));
    }

    if ((order.awb_no || order.jnt_order_id) && order.status !== "dibatalkan") {
      return bad(
        `Pesanan ini sudah punya resi J&T${order.awb_no ? ` (${order.awb_no})` : ""}. Batalkan dulu supaya resinya ikut dibatalkan di J&T.`,
      );
    }
    if (sourceKey(order.source) === "website") {
      return bad("Pesanan website tidak bisa dihapus dari menu Transaksi.");
    }
    // Pesanan reseller punya jurnal saldo (reseller_ledger) + pembayaran kekurangan. Menghapus
    // barisnya di sini akan meninggalkan mutasi saldo yang menggantung, jadi tidak diizinkan —
    // jalurnya "Batalkan" (stok & saldo dikembalikan lewat `cancelOrderCompletely`).
    if (orderSourceKey(order) === RESELLER_SOURCE_KEY) {
      return bad("Pesanan reseller tidak bisa dihapus dari menu Transaksi. Gunakan Batalkan supaya saldo reseller ikut dikembalikan.");
    }

    const { data: items } = await admin
      .from("order_items")
      .select("product_id, color, size, quantity, is_preorder_item")
      .eq("order_id", order.id);

    // Stok dikembalikan hanya kalau memang pernah terpotong dan belum dikembalikan pembatalan.
    // Pesanan campuran (ready + PO) yang masih menunggu: baris PO (`is_preorder_item = true`)
    // BELUM pernah dipotong stoknya, jadi tidak ikut "dikembalikan" — sama seperti `cancel-order.ts`.
    // Hasil pengembalian DIPERIKSA: kalau ada yang gagal, transaksi tidak boleh terhapus diam-diam sementara
    // stoknya hilang. Yang gagal tercatat di Anomali Stok.
    if (order.stock_reserved === true && order.status !== "dibatalkan") {
      const restorableItems = (items || []).filter(
        (item) => item.is_preorder_item !== true || order.preorder_ready_at != null,
      );
      const { restored, failed } = await restoreItemsStrict(admin, restorableItems, order.id, "ops-transaksi-hapus");
      if (failed.length > 0) {
        if (restored.length > 0) {
          // Sebagian sudah kembali: tandai stok tidak lagi tertahan supaya percobaan Hapus berikutnya tidak
          // mengembalikan item yang sama dua kali. Sisanya dikoreksi manual lewat Anomali Stok.
          await admin.from("orders").update({ stock_reserved: false }).eq("id", order.id);
          return NextResponse.json(
            {
              error: `Sebagian stok sudah dikembalikan, tetapi ini gagal: ${failed.join(", ")}. Transaksi belum dihapus. Yang gagal tercatat di Anomali Stok, koreksi manual lalu hapus lagi (stok yang sudah kembali tidak dikembalikan dua kali).`,
            },
            { status: 500 },
          );
        }
        return NextResponse.json(
          { error: `Stok gagal dikembalikan, jadi transaksi TIDAK dihapus. Tidak ada yang berubah, coba lagi sebentar lagi. (${failed.join(", ")})` },
          { status: 500 },
        );
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

    // Lead yang closing dari transaksi ini ditandai Batal (nominal 0), supaya tidak menggantung
    // menunjuk pesanan yang sudah tidak ada. Gagal di sini TIDAK membatalkan penghapusan.
    try {
      await revertLeadOnOrderCancelled(admin, order.id);
    } catch (leadError) {
      console.error("[OPS] hapus transaksi: sinkron lead gagal:", leadError);
    }

    return NextResponse.json({ order_number: order.order_number, deleted: true });
  } catch (e) {
    console.error("[OPS] hapus transaksi:", e);
    return NextResponse.json({ error: "Gagal menghapus transaksi" }, { status: 500 });
  }
}
