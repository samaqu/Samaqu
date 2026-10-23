import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";
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
  variantWeightMapFromRows,
  type VariantWeightMap,
  type WeightMap,
} from "@/lib/shipping-weight";

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

type ItemInput = { product_id?: unknown; color?: unknown; size?: unknown; quantity?: unknown; price?: unknown };

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
  color: string;
  size: string;
  quantity: number;
  price: number;
  /** true = harga baris ini diketik admin (bukan harga katalog). */
  manual_price: boolean;
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

/** Potong stok satu per satu (atomik per baris); kembalikan baris yang sudah terpotong untuk rollback. */
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
      "id, order_number, created_at, customer_id, customer_name, customer_whatsapp, status, source, subtotal, discount, shipping_cost, shipping_method, total, shipping_notes, awb_no, jnt_order_id, shipping_status, shipping_address, shipping_city, shipping_province, shipping_kecamatan, shipping_postal_code, payment_method, payment_status, paid_at, payment_provider, payment_channel",
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

  const { data: lineItems } = await admin
    .from("order_items")
    .select(
      "order_id, product_id, product_name, series, kain, color, size, quantity, price, product_image, customer_price, minimum_price",
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
      // Pesanan website hanya dipantau dari sini (sumbernya read-only); yang boleh
      // diubah/dibatalkan dari menu ini cuma transaksi yang dicatat manual.
      can_edit: key !== "website" && status !== "dibatalkan",
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
      .select("id, order_number, status, source, awb_no, jnt_order_id, stock_reserved, customer_name, customer_whatsapp, customer_id")
      .eq("order_number", orderNumber)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!order) return bad("Pesanan tidak ditemukan");

    const manual = sourceKey(order.source) !== "website";

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
      return NextResponse.json({ order_number: order.order_number, cancelled: true });
    }

    if (action !== "update") return bad("Aksi tidak dikenal");
    if (!manual) return bad("Pesanan website tidak bisa diubah dari menu Transaksi");
    if (order.status === "dibatalkan") return bad("Transaksi yang sudah dibatalkan tidak bisa diubah");

    const customerName = String(body?.customer_name || "").trim();
    const customerWhatsapp = String(body?.customer_whatsapp || "").trim();
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

    const snapshot = await buildSnapshot(admin, inputItems);
    if (snapshot.error || !snapshot.items) return bad(snapshot.error || "Produk tidak valid");
    const items = snapshot.items;

    const { data: oldRows } = await admin
      .from("order_items")
      .select("product_id, color, size, quantity")
      .eq("order_id", order.id);

    // Selisih per (produk, warna, ukuran): yang bertambah dipotong, yang berkurang dikembalikan.
    // Baris yang tidak berubah tidak menyentuh stok sama sekali.
    const keyOf = (productId: string, color: string, size: string) =>
      `${productId}||${color}||${String(size).toUpperCase()}`;
    const delta = new Map<string, { product_id: string; color: string; size: string; qty: number }>();
    for (const row of oldRows || []) {
      const key = keyOf(row.product_id, row.color || "default", row.size);
      const entry = delta.get(key) || { product_id: row.product_id, color: row.color || "default", size: String(row.size).toUpperCase(), qty: 0 };
      entry.qty -= Number(row.quantity) || 0;
      delta.set(key, entry);
    }
    for (const item of items) {
      const key = keyOf(item.product_id, item.color, item.size);
      const entry = delta.get(key) || { product_id: item.product_id, color: item.color, size: item.size, qty: 0 };
      entry.qty += item.quantity;
      delta.set(key, entry);
    }

    const toDeduct = [...delta.values()].filter((d) => d.qty > 0);
    const toRestore = [...delta.values()].filter((d) => d.qty < 0);

    const deducted = await deductStock(
      admin,
      toDeduct.map((d) => ({
        product_id: d.product_id,
        product_name: d.product_id,
        series: null,
        kain: null,
        color: d.color,
        size: d.size,
        quantity: d.qty,
        price: 0,
        manual_price: false,
      })),
    );
    if (!deducted.ok) {
      await restoreStock(admin, deducted.done);
      return bad(deducted.message.replace(/^Stok /, "Stok tambahan "));
    }
    await restoreStock(
      admin,
      toRestore.map((d) => ({
        product_id: d.product_id,
        product_name: d.product_id,
        series: null,
        kain: null,
        color: d.color,
        size: d.size,
        quantity: Math.abs(d.qty),
        price: 0,
        manual_price: false,
      })),
    );

    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const finalDiscount = Math.min(discount, subtotal);
    const total = subtotal - finalDiscount + shippingCost;

    const { error: updateError } = await admin
      .from("orders")
      .update({
        customer_name: customerName,
        customer_whatsapp: customerWhatsapp,
        customer_id: String(body?.customer_id || "").trim() || order.customer_id || null,
        source,
        shipping_address: shipping.address,
        shipping_city: shippingCityValue(shipping),
        shipping_kecamatan: shipping.kecamatan,
        shipping_province: shipping.province,
        shipping_postal_code: shipping.postal_code,
        shipping_notes: notes || null,
        shipping_cost: shippingCost,
        ...(String(body?.shipping_method || "").trim() === "J&T HBO" ? { shipping_method: "J&T HBO" } : {}),
        discount: finalDiscount,
        subtotal,
        total,
        created_at: createdAt.toISOString(),
        updated_at: createdAt.toISOString(),
      })
      .eq("id", order.id);
    if (updateError) {
      console.error("[OPS] transaksi PATCH order:", updateError.message);
      return NextResponse.json({ error: "Gagal memperbarui transaksi" }, { status: 500 });
    }

    // Ganti daftar item: hapus lama, tulis ulang snapshot baru.
    const { error: deleteError } = await admin.from("order_items").delete().eq("order_id", order.id);
    if (deleteError) {
      console.error("[OPS] transaksi PATCH delete items:", deleteError.message);
      return NextResponse.json({ error: "Gagal memperbarui produk transaksi" }, { status: 500 });
    }

    const { error: insertError } = await admin.from("order_items").insert(
      items.map((item) => ({
        order_id: order.id,
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
    if (insertError) {
      console.error("[OPS] transaksi PATCH insert items:", insertError.message);
      return NextResponse.json({ error: "Gagal menyimpan produk transaksi" }, { status: 500 });
    }

    // Alamat baru (kalau admin menambahkannya) ikut masuk buku alamat pelanggan.
    if (body?.save_address) {
      await saveCustomerAddress(
        admin,
        String(body?.customer_id || "").trim() || order.customer_id || null,
        customerName,
        customerWhatsapp,
        shipping,
      );
    }

    return NextResponse.json({ order_number: order.order_number, total });
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
