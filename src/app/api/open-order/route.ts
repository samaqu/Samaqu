import { NextRequest, NextResponse, after } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { buildFbc, getClientIp, getMetaCookies, sendMetaPurchaseEvent } from "@/lib/meta-capi";
import { OPEN_ORDER_ADDON, resolveAddonWeight } from "@/lib/open-order-config";
import { readOpenOrderWindow } from "@/lib/open-order-settings";
import { resolveOpenOrderState } from "@/lib/open-order-window";
import {
  buildOpenOrderProducts,
  findOpenOrderProduct,
  openOrderVariantFor,
  DEFAULT_OPEN_ORDER_WEIGHT,
  type OpenOrderCatalogRow,
  type OpenOrderStockRow,
} from "@/lib/open-order-offering";
import { sumWeightGramsBySize, productWeightMapFromRows, variantWeightMapFromRows } from "@/lib/shipping-weight";
import { markLeadBoughtForOrder } from "@/lib/ops-lead-sync";
import {
  notifyAdminNewOrder,
  notifyCustomerOrderCreated,
  paymentInstructionFrom,
  type NewOrderNotificationItem,
} from "@/lib/fonnte";
import { sendOnce } from "@/lib/order-notify";
import { orderItemPhoto } from "@/lib/order-photo";
import { loadOrderPhotoLookup } from "@/lib/order-photo-data";
import { createOrderPaymentLink } from "@/lib/mayar";
import { formatProductLabel } from "@/lib/item-label";
import { resolveAttribution } from "@/lib/affiliate/referral";
import { recordCommissionForOrder } from "@/lib/affiliate/commission";
import { snapshotOrderHpp } from "@/lib/produksi-order-hpp";

/**
 * Pesanan dari alur Open Order Samaqu (halaman /open-order, 6 langkah).
 *
 * Sejak Open Order disamakan dengan pesanan biasa:
 * - **katalognya lintas kategori**: semua baris `products` yang `open_order_enabled` (kolom itu,
 *   default true) ikut, bukan cuma Thobe. Daftar "series yang dibuka" tidak dipakai lagi — admin
 *   memilih produk lewat sakelar di menu "Open Order" / form produk.
 * - **stok dipotong** seperti checkout website: stok dikurangi DULU secara atomik
 *   (`samaqu_decrement_stock`, satu per item). Kalau ada item yang gagal/stok kurang, semua
 *   decrement di-rollback dan pesanan ditolak. Stok ini stok yang sama dengan menu Produk, jadi
 *   otomatis sinkron. `orders.stock_reserved = true` menandai pesanan ini pernah memotong stok,
 *   supaya pembatalan (`src/lib/cancel-order.ts`) mengembalikannya dan pesanan CYO lama (yang
 *   belum pernah memotong) tidak ikut dikembalikan.
 * - `order_items.product_id` sekarang berisi **id baris `products` yang sebenarnya** (dulu kode
 *   kain), supaya stok & foto bisa dicocokkan.
 * - nomor pesanan tetap `CYO-`; resi J&T tetap dibuat admin setelah pembayaran diverifikasi.
 *
 * Ongkir dihitung di client lewat API J&T (`/api/shipping/jnt-cost`) dari kecamatan tujuan.
 * Harga produk/series tidak dipercaya dari client: baris katalog dibaca ulang di sini lewat
 * `buildOpenOrderProducts()` — sumber yang sama dengan wizard — lalu dipakai memvalidasi. Yang
 * datang dari client hanyalah harga pilihan customer (Create Your Price), di-clamp supaya tidak
 * pernah di bawah harga series terpilih.
 */

interface OpenOrderItemInput {
  productId?: string;
  series?: string;
  color?: string;
  size?: string;
  quantity?: number;
  /** Harga pilihan customer (Create Your Price). */
  price?: number;
}

interface ValidatedItem {
  /** id baris `products` asli — dipakai untuk stok & order_items. */
  productId: string;
  productName: string;
  color: string;
  size: string;
  series: string | null;
  kain: string | null;
  quantity: number;
  price: number;
  minimumPrice: number;
  cypEnabled: boolean;
}

interface OrderItemRow {
  order_id: string;
  product_id: string;
  product_name: string;
  /** Snapshot foto produk saat pesanan dibuat (null = tidak ada foto di katalog). */
  product_image: string | null;
  color: string | null;
  size: string | null;
  quantity: number;
  price: number;
  series: string | null;
  kain: string | null;
  customer_price: number | null;
  minimum_price: number | null;
}

function generateOrderNumber(): string {
  const d = new Date();
  return `CYO-${d.toISOString().slice(0, 10).replace(/-/g, "")}-${String(Math.floor(Math.random() * 900) + 100)}`;
}

interface PaymentRow {
  id: string;
  label?: string | null;
  method_type?: string | null;
  bank_name?: string | null;
  account_name?: string | null;
  account_number?: string | null;
  account_info?: string | null;
  instructions?: string | null;
}

/**
 * Baris `payment_methods` (dikelola dari dashboard admin) → instruksi pembayaran untuk pesan WA.
 * Dipakai bersama dengan checkout website lewat `paymentInstructionFrom` di `src/lib/fonnte.ts`.
 */

export async function POST(request: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    // Checkout Open Order hanya untuk customer yang sudah masuk/daftar (gerbang `StepAuth` di
    // wizard). Token sesi diverifikasi di sini supaya request langsung tanpa login ikut ditolak,
    // dan `customer_id` diambil dari token — bukan dari body — sehingga pesanan selalu menempel
    // ke akun pemilik sesi dan muncul di menu "Pesanan".
    const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    const { data: authData, error: authError } = token
      ? await supabaseAdmin.auth.getUser(token)
      : { data: { user: null }, error: null };
    const customerId = authData?.user?.id ?? null;
    if (authError || !customerId) {
      return NextResponse.json({ error: "Silakan masuk atau daftar dulu untuk menyelesaikan pesanan." }, { status: 401 });
    }

    // Sesi harus milik akun pelanggan (baris di tabel `customers`) — sama seperti yang dicek
    // `loginCustomer` di klien, dan `orders.customer_id` memang ber-FK ke tabel itu.
    const { data: customerRow } = await supabaseAdmin.from("customers").select("id").eq("id", customerId).maybeSingle();
    if (!customerRow) {
      return NextResponse.json({ error: "Akun ini bukan akun pelanggan. Silakan masuk dengan akun pelanggan." }, { status: 403 });
    }

    const body = await request.json();
    const rawCustomer = body.customer ?? {};
    const rawItems: OpenOrderItemInput[] = Array.isArray(body.items) ? body.items : [];

    // Meta CAPI: identifier browser dari klien, fallback ke cookie request.
    const metaBody = body?.meta && typeof body.meta === "object" ? body.meta : {};
    const metaCookies = getMetaCookies(request);
    const metaFbp = typeof metaBody.fbp === "string" ? metaBody.fbp : metaCookies.fbp;
    const metaFbc =
      typeof metaBody.fbc === "string"
        ? metaBody.fbc
        : metaCookies.fbc || buildFbc(typeof metaBody.fbclid === "string" ? metaBody.fbclid : undefined);
    const metaEventSourceUrl =
      typeof metaBody.eventSourceUrl === "string" ? metaBody.eventSourceUrl : request.headers.get("referer");
    const metaClientIp = getClientIp(request);
    const metaUserAgent = request.headers.get("user-agent") || undefined;

    // ── Gerbang jendela Open Order ──
    // Tombol "Tambah ke Pesanan" di wizard dimatikan kalau periode belum dibuka, tapi itu hanya
    // sisi klien — jadi server juga wajib menolak. Tanpa ini pesanan bisa dibuat dengan
    // POST langsung meskipun jendela belum dibuka / sudah lewat tanggal tutup.
    const windowSetting = await readOpenOrderWindow(supabaseAdmin);
    const windowState = resolveOpenOrderState(windowSetting);
    if (windowState === "before") {
      return NextResponse.json(
        { error: "Open Order belum dibuka. Pesanan hanya bisa dibuat saat periode sudah dimulai." },
        { status: 403 },
      );
    }
    if (windowState === "closed") {
      return NextResponse.json(
        { error: "Periode Open Order sudah berakhir. Nantikan periode berikutnya ya." },
        { status: 403 },
      );
    }

    const name = String(rawCustomer.name ?? "").trim();
    const instagram = String(rawCustomer.instagram ?? "").trim().replace(/^@/, "");
    const whatsapp = String(rawCustomer.whatsapp ?? "").trim();
    const city = String(rawCustomer.city ?? "").trim();
    const district = String(rawCustomer.district ?? "").trim();
    const address = String(rawCustomer.address ?? "").trim();
    const postalCode = String(rawCustomer.postalCode ?? "").trim();
    const note = String(rawCustomer.notes ?? "").trim();

    if (!name || !whatsapp || !city || !district || !address) {
      return NextResponse.json({ error: "Data pemesan belum lengkap" }, { status: 400 });
    }

    if (rawItems.length === 0) {
      return NextResponse.json({ error: "Pesanan masih kosong" }, { status: 400 });
    }

    // Katalog + varian dibaca ulang (sumber yang sama dengan wizard). Baris yang dimatikan admin
    // (`open_order_enabled = false`) otomatis tersaring di `buildOpenOrderProducts`.
    // Urutan `created_at` menaik sama seperti `getProducts()` supaya id produk grup-nya identik
    // dengan yang dikirim client.
    const { data: catalogRows, error: catalogError } = await supabaseAdmin
      .from("products")
      .select("*, jenis_kain(*)")
      .eq("is_published", true)
      .order("created_at", { ascending: true });

    if (catalogError) {
      console.error("[OPEN-ORDER] Catalog fetch error:", catalogError);
      return NextResponse.json({ error: "Gagal membaca katalog" }, { status: 500 });
    }

    const { data: stockRows } = await supabaseAdmin
      .from("product_variants")
      .select("product_id, color, size, stock, weight");

    const products = buildOpenOrderProducts(
      (catalogRows ?? []) as OpenOrderCatalogRow[],
      (stockRows ?? []) as OpenOrderStockRow[]
    );
    if (products.length === 0) {
      return NextResponse.json({ error: "Katalog Open Order belum tersedia" }, { status: 400 });
    }

    const validatedItems: ValidatedItem[] = [];

    for (const item of rawItems) {
      const product = findOpenOrderProduct(products, String(item.productId ?? ""));
      if (!product) {
        return NextResponse.json({ error: "Produk tidak valid" }, { status: 400 });
      }

      const color = String(item.color ?? "");
      const size = String(item.size ?? "");
      const quantity = Number(item.quantity);

      if (product.colors.length > 0 && !product.colors.includes(color)) {
        return NextResponse.json({ error: `Warna untuk ${product.name} tidak valid` }, { status: 400 });
      }

      // Series opsional: wajib cocok kalau produknya punya series, wajib kosong kalau tidak.
      const requestedSeries = String(item.series ?? "").trim();
      if (product.series.length > 0) {
        if (!product.series.some((option) => option.name === requestedSeries)) {
          return NextResponse.json({ error: `Series untuk ${product.name} tidak valid` }, { status: 400 });
        }
      } else if (requestedSeries) {
        return NextResponse.json({ error: `Series untuk ${product.name} tidak valid` }, { status: 400 });
      }

      const variant = openOrderVariantFor(product, color, requestedSeries);
      if (!variant && product.colors.length > 0) {
        return NextResponse.json({ error: `Varian untuk ${product.name} tidak ditemukan` }, { status: 400 });
      }
      if (variant && variant.sizes.length > 0 && !variant.sizes.includes(size)) {
        return NextResponse.json({ error: `Ukuran untuk ${product.name} tidak tersedia` }, { status: 400 });
      }
      if (!size) {
        return NextResponse.json({ error: `Ukuran untuk ${product.name} tidak valid` }, { status: 400 });
      }
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        return NextResponse.json({ error: `Jumlah untuk ${product.name} tidak valid` }, { status: 400 });
      }

      // Harga: bila Create Your Price aktif → pakai harga pilihan customer (minimal harga series
      // terpilih); bila tidak → harga katalog, harga dari client diabaikan.
      const seriesOption = product.series.find((option) => option.name === requestedSeries) ?? null;
      const minimumPrice = seriesOption?.price ?? product.minimumPrice;
      const requested = Math.round(Number(item.price));
      const price = product.cypEnabled
        ? Number.isFinite(requested) && requested > minimumPrice
          ? requested
          : minimumPrice
        : minimumPrice;

      validatedItems.push({
        productId: variant?.productId ?? product.id,
        productName: seriesOption ? `${product.name} — ${seriesOption.name}` : product.name,
        color,
        size,
        series: seriesOption ? seriesOption.name : null,
        kain: product.kain || null,
        quantity,
        price,
        minimumPrice,
        cypEnabled: product.cypEnabled,
      });
    }

    const extraCover = body.extraCover === true;
    // Berat add-on Cover & Hanger diatur admin (menu "Open Order" → `store_settings`). Nilai
    // dari client tidak dipercaya — selalu dibaca ulang di server, sama seperti harganya.
    const { data: addonSetting } = await supabaseAdmin
      .from("store_settings")
      .select("open_order_addon_weight")
      .eq("id", 1)
      .maybeSingle();
    const addonWeight = resolveAddonWeight(addonSetting?.open_order_addon_weight);
    const subtotal = validatedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const addonTotal = extraCover ? OPEN_ORDER_ADDON.price : 0;

    // Ongkir J&T sudah dihitung di client dari kecamatan tujuan (API key tidak pernah sampai
    // ke browser) — sama seperti /api/orders, nilainya tidak diverifikasi ulang di sini.
    // Kalau kosong (kecamatan belum diisi / hitungan gagal), pesanan tetap masuk sebagai
    // "manual" dan admin menghitung ongkir menyusul.
    const rawShipping = body.shipping ?? {};
    const shippingCost = Math.max(0, Math.round(Number(rawShipping.cost) || 0));
    const shippingMethod = String(rawShipping.method ?? "").trim() || "manual";

    // Metode pembayaran: daftar resminya diatur admin di dashboard (tabel `payment_methods`).
    // Pilihan customer divalidasi di sini; kalau admin belum punya metode aktif sama sekali,
    // pesanan jatuh ke nilai lama `bank` supaya alur tidak putus.
    const { data: activePayments } = await supabaseAdmin
      .from("payment_methods")
      .select("id, label, method_type, bank_name, account_name, account_number, account_info, instructions")
      .eq("is_active", true)
      .order("display_order");

    const paymentOptions = (activePayments ?? []) as PaymentRow[];
    const requestedPayment = String(body.paymentMethod ?? "").trim();
    const paymentRow = paymentOptions.find((row) => row.id === requestedPayment) ?? null;

    if (paymentOptions.length > 0 && !paymentRow) {
      return NextResponse.json({ error: "Pilih metode pembayaran dulu ya." }, { status: 400 });
    }

    const shippingNotes = [instagram ? `IG @${instagram}` : "", note].filter(Boolean).join(" · ");

    const total = subtotal + addonTotal + shippingCost;
    const orderNumber = generateOrderNumber();

    // ── Potong stok (atomik, rollback kalau ada yang gagal) ──
    // Sama seperti checkout website: stok dikurangi DULU, baru pesanan disimpan. Stok ini stok
    // yang sama dengan menu Produk, jadi otomatis sinkron.
    const decremented: Array<{ productId: string; color: string; size: string; quantity: number }> = [];

    async function rollbackStock() {
      for (const item of decremented) {
        await supabaseAdmin.rpc("samaqu_restore_stock", {
          p_product_id: item.productId,
          p_color: item.color,
          p_size: item.size,
          p_qty: item.quantity,
        });
      }
      decremented.length = 0;
    }

    for (const item of validatedItems) {
      // Produk tanpa varian (tanpa warna/ukuran) → stok tidak dikelola, lewati.
      if (!item.color || !item.size || item.color === "-") continue;

      const { data: stockOk, error: stockError } = await supabaseAdmin.rpc("samaqu_decrement_stock", {
        p_product_id: item.productId,
        p_color: item.color,
        p_size: item.size,
        p_qty: item.quantity,
      });

      if (stockError) {
        console.error("[OPEN-ORDER] Stock RPC error:", stockError);
        await rollbackStock();
        return NextResponse.json({ error: "Gagal memvalidasi stok. Silakan coba lagi." }, { status: 500 });
      }
      if (!stockOk) {
        console.error("[OPEN-ORDER] Stock INSUFFICIENT:", item);
        await rollbackStock();
        return NextResponse.json(
          {
            error: `Stok "${item.productName}" (${item.color} / ${item.size}) tidak mencukupi. Silakan kurangi jumlah atau pilih varian lain.`,
          },
          { status: 400 }
        );
      }

      decremented.push({ productId: item.productId, color: item.color, size: item.size, quantity: item.quantity });
      console.log("[OPEN-ORDER] Stock decremented:", {
        name: item.productName,
        color: item.color,
        size: item.size,
        qty: item.quantity,
      });
    }

    // ── Berat kirim (gram): FUNGSI PUSAT yang sama dengan wizard (berat varian → produk). ──
    // Add-on Extra Cover & Hanger +300 g dan minimum 300 g sama persis dengan wizard, supaya
    // berat untuk ongkir = yang disimpan = yang dipakai resi.
    const weightIds = Array.from(new Set(validatedItems.map((i) => i.productId).filter(Boolean)));
    let productWeights: Record<string, number> = {};
    let variantWeights: Record<string, number> = {};
    if (weightIds.length > 0) {
      const [{ data: pRows }, { data: vRows }] = await Promise.all([
        supabaseAdmin.from("products").select("id, weight").in("id", weightIds),
        supabaseAdmin.from("product_variants").select("product_id, color, size, weight").in("product_id", weightIds),
      ]);
      productWeights = productWeightMapFromRows(pRows);
      variantWeights = variantWeightMapFromRows(vRows);
    }
    const { grams: itemsWeight, missingQty: itemsWeightMissing } = sumWeightGramsBySize(
      validatedItems.map((i) => ({ productId: i.productId, color: i.color, size: i.size, quantity: i.quantity })),
      productWeights,
      variantWeights
    );
    const weightGrams = Math.max(
      300,
      itemsWeight + itemsWeightMissing * DEFAULT_OPEN_ORDER_WEIGHT + (extraCover ? addonWeight : 0)
    );

    // ── Atribusi referral (server-side, sama seperti /api/orders) ──
    const referral = await resolveAttribution(supabaseAdmin, request, {
      email: authData?.user?.email ?? rawCustomer.email ?? null,
      whatsapp,
    });

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .insert({
        order_number: orderNumber,
        customer_id: customerId,
        customer_name: name,
        customer_email: authData?.user?.email ?? null,
        customer_whatsapp: whatsapp,
        shipping_address: address,
        shipping_city: [district, city].filter(Boolean).join(", "),
        // Kecamatan (dan provinsi bila dikirim wizard) disimpan terpisah juga — sama dengan
        // /api/orders, supaya form/dashboard ops bisa membacanya langsung.
        shipping_kecamatan: district || null,
        shipping_province: String(rawCustomer.province || "").trim() || null,
        shipping_postal_code: postalCode || null,
        shipping_method: shippingMethod,
        shipping_cost: shippingCost,
        payment_method: paymentRow?.id ?? "bank",
        subtotal,
        discount: 0,
        total,
        status: "pending",
        weight: weightGrams,
        // Pesanan ini sudah memotong stok → pembatalan wajib mengembalikannya.
        stock_reserved: true,
        shipping_notes: shippingNotes,
        // Atribusi affiliate (nullable — pesanan tanpa referral tetap normal).
        affiliate_id: referral?.affiliateId ?? null,
        referral_code: referral?.code ?? null,
        referral_link_id: referral?.linkId ?? null,
        referral_attributed_at: referral ? new Date().toISOString() : null,
      })
      .select("id, order_number")
      .single();

    if (orderError || !order) {
      console.error("[OPEN-ORDER] Order insert error:", orderError);
      await rollbackStock();
      return NextResponse.json({ error: "Gagal menyimpan pesanan" }, { status: 500 });
    }

    // Foto item diambil dari katalog SEKARANG lalu disimpan sebagai snapshot di baris pesanan,
    // supaya riwayat pesanan tidak ikut berubah kalau foto produk diganti nanti. Aturan fotonya
    // sama dengan yang tampil di katalog & dashboard (src/lib/order-photo.ts).
    const photoLookup = await loadOrderPhotoLookup(validatedItems.map((item) => item.productId));

    const orderItems: OrderItemRow[] = validatedItems.map((item) => ({
      order_id: order.id,
      product_id: item.productId,
      product_name: item.productName,
      color: item.color,
      size: item.size,
      quantity: item.quantity,
      price: item.price,
      series: item.series,
      kain: item.kain,
      product_image:
        orderItemPhoto(
          {
            product_id: item.productId,
            product_name: item.productName,
            color: item.color,
            kain: item.kain,
            series: item.series,
          },
          photoLookup
        ) || null,
      customer_price: item.cypEnabled ? item.price : null,
      minimum_price: item.cypEnabled ? item.minimumPrice : null,
    }));

    if (extraCover) {
      orderItems.push({
        order_id: order.id,
        product_id: OPEN_ORDER_ADDON.id,
        product_name: OPEN_ORDER_ADDON.name,
        color: null,
        size: null,
        quantity: 1,
        price: OPEN_ORDER_ADDON.price,
        series: null,
        kain: null,
        // Add-on belum tentu punya foto di katalog — kalau tidak ada, tampilannya memakai
        // placeholder netral (bukan foto produk lain).
        product_image:
          orderItemPhoto({ product_id: OPEN_ORDER_ADDON.id, product_name: OPEN_ORDER_ADDON.name }, photoLookup) ||
          null,
        customer_price: null,
        minimum_price: null,
      });
    }

    const { error: itemsError } = await supabaseAdmin.from("order_items").insert(orderItems);

    if (itemsError) {
      console.error("[OPEN-ORDER] Order items insert error:", itemsError);
      await supabaseAdmin.from("orders").delete().eq("id", order.id);
      await rollbackStock();
      return NextResponse.json({ error: "Gagal menyimpan detail pesanan" }, { status: 500 });
    }

    // Snapshot HPP per baris. Kegagalan snapshot tidak boleh menggagalkan pesanan.
    try {
      await snapshotOrderHpp(supabaseAdmin, order.id);
    } catch (snapshotError) {
      console.error("[OPEN-ORDER] snapshot HPP:", orderNumber, snapshotError);
    }

    // Catat komisi affiliate (idempoten — order_id UNIQUE di tabel komisi).
    if (referral) {
      const commission = await recordCommissionForOrder(supabaseAdmin, {
        orderId: order.id,
        orderNumber,
        affiliateId: referral.affiliateId,
        linkId: referral.linkId,
        items: validatedItems.map((item) => ({
          productId: item.productId,
          price: item.price,
          quantity: item.quantity,
        })),
      });
      if (commission) {
        await supabaseAdmin
          .from("orders")
          .update({ affiliate_commission_amount: commission.amount })
          .eq("id", order.id);
      }
    }

    // Resi J&T tidak dibuat di sini — admin menekan "Atur Pesanan" setelah pembayaran
    // diverifikasi (PATCH /api/admin/orders action=createJnt).

    // Sinkron ke lead: kalau nomor ini cocok dengan lead yang masih aktif, tandai Closing/Beli
    // (order tidak membuat lead baru). Kegagalan sync tidak menggagalkan pesanan.
    try {
      await markLeadBoughtForOrder(supabaseAdmin, { whatsapp, orderNumber, total });
    } catch (e) {
      console.error("[OPEN-ORDER] Lead sync gagal:", e);
    }

    // Notifikasi WhatsApp (Fonnte, best effort — gagal kirim tidak menggagalkan pesanan):
    // - ke admin: ringkasan lengkap supaya bisa langsung verifikasi,
    // - ke customer: konfirmasi + instruksi pembayaran metode yang dipilihnya, jadi admin tidak
    //   perlu membalas satu-satu.
    const notificationItems: NewOrderNotificationItem[] = validatedItems.map((item) => ({
      name: item.productName,
      series: item.series,
      kain: item.kain,
      color: item.color,
      size: item.size,
      quantity: item.quantity,
      price: item.price,
    }));
    if (extraCover) {
      notificationItems.push({
        name: OPEN_ORDER_ADDON.name,
        color: null,
        size: null,
        quantity: 1,
        price: OPEN_ORDER_ADDON.price,
      });
    }
    const paymentInstruction = paymentRow ? paymentInstructionFrom(paymentRow) : null;
    const invoiceItemLines = [
      ...validatedItems.map((item) => ({
        // Format sama dengan notifikasi WA: nama · series · warna · kain · size.
        label: formatProductLabel({
          name: item.productName,
          series: item.series,
          kain: item.kain,
          color: item.color,
          size: item.size,
          quantity: item.quantity,
        }),
        quantity: item.quantity || 1,
      })),
      ...(extraCover ? [{ label: OPEN_ORDER_ADDON.name, quantity: 1 }] : []),
    ];

    console.log("[OPEN-ORDER] Created:", { orderNumber, items: orderItems.length, total });

    // Pembayaran online (Mayar): invoice dibuat DULU (di server) supaya link-nya bisa ikut dikirim
    // di pesan customer dan pelanggan tamu (tanpa sesi) tetap bisa diarahkan ke halaman bayar.
    // Gagal → null: pesanan tetap tersimpan dan pesan dikirim TANPA link (tidak ada link karangan).
    let paymentUrl: string | null = null;
    if (paymentRow?.method_type === "mayar") {
      paymentUrl = await createOrderPaymentLink({
        orderId: order.id,
        orderNumber,
        customerName: name,
        customerEmail: authData?.user?.email ?? null,
        customerWhatsapp: whatsapp,
        total,
        items: invoiceItemLines,
      });
    }

    // Notifikasi customer (token Fonnte Customer) & admin (token Fonnte Admin) dikirim bersamaan
    // dan saling terpisah: kegagalan salah satu tidak memengaruhi yang lain maupun pesanan yang
    // sudah tersimpan. Klaim `notify_created_at` memastikan pesan checkout hanya terkirim sekali.
    await Promise.allSettled([
      sendOnce(order.id, "created", "WA pesanan dibuat (Open Order)", () =>
        notifyCustomerOrderCreated({
          orderNumber,
          customerName: name,
          customerWhatsapp: whatsapp,
          items: notificationItems,
          total,
          paymentMethod: paymentInstruction,
          isOpenOrder: true,
          paymentUrl,
        })
      ),
      notifyAdminNewOrder({
        orderNumber,
        customerName: name,
        customerWhatsapp: whatsapp,
        total,
        paymentType: paymentInstruction?.label ?? "Transfer Bank",
        items: notificationItems,
        shippingCity: [district, city].filter(Boolean).join(", "),
        notes: shippingNotes || null,
        source: "Open Order (Create Your Price)",
      }),
    ]);

    // Meta CAPI: Purchase sekali di server setelah order + item tersimpan.
    // event_id = nomor pesanan, sama dengan eventID Purchase di browser Pixel.
    after(async () => {
      try {
        await sendMetaPurchaseEvent({
          orderNumber,
          // Ketentuan: subtotal produk saja — ongkir tidak dihitung.
          value: subtotal,
          contents: validatedItems.map((item) => ({
            id: item.productId,
            quantity: item.quantity || 1,
            item_price: item.price,
          })),
          eventSourceUrl: metaEventSourceUrl,
          user: {
            name,
            email: authData?.user?.email ?? null,
            phone: whatsapp,
            city,
            externalId: customerId,
          },
          fbp: metaFbp,
          fbc: metaFbc,
          clientIp: metaClientIp,
          clientUserAgent: metaUserAgent,
        });
      } catch (error) {
        console.warn("[Meta CAPI] Purchase dilewati:", error instanceof Error ? error.message : "unknown");
      }
    });

    return NextResponse.json({ success: true, orderNumber, total, productTotal: subtotal + addonTotal, awbNo: null, paymentUrl });
  } catch (error) {
    console.error("[OPEN-ORDER] Failed:", error);
    return NextResponse.json({ error: "Terjadi kesalahan server" }, { status: 500 });
  }
}
