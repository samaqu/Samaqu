import { NextRequest, NextResponse, after } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { buildFbc, getClientIp, getMetaCookies, sendMetaPurchaseEvent } from "@/lib/meta-capi";
import { isPaymentMethodId, legacyPaymentType } from "@/lib/payment-methods";
import {
  notifyAdminNewOrder,
  notifyCustomerOrderCreated,
  paymentInstructionFrom,
  type PaymentInstruction,
} from "@/lib/fonnte";
import { sendOnce } from "@/lib/order-notify";
import { orderItemPhoto } from "@/lib/order-photo";
import { loadOrderPhotoLookup } from "@/lib/order-photo-data";
import { createOrderPaymentLink } from "@/lib/mayar";
import { markLeadBoughtForOrder } from "@/lib/ops-lead-sync";
import { sumWeightGramsBySize, productWeightMapFromRows, variantWeightMapFromRows } from "@/lib/shipping-weight";
import { orderLookupToken } from "@/lib/order-token";
import { formatProductLabel } from "@/lib/item-label";
import { resolveAttribution } from "@/lib/affiliate/referral";
import { recordCommissionForOrder } from "@/lib/affiliate/commission";

/**
 * Semua baca/tulis pesanan di route ini memakai service role (server-side), supaya policy RLS
 * `orders`/`order_items` bisa ditutup dari anon: browser tidak lagi menyentuh tabel pesanan
 * langsung, hanya lewat API (checkout POST, halaman admin via /api/ops/orders, customer lewat
 * policy `auth.uid() = customer_id`).
 */
const supabase = getSupabaseAdmin();

function generateOrderNumber(): string {
  const d = new Date();
  return `SMQ-${d.toISOString().slice(0, 10).replace(/-/g, "")}-${String(Math.floor(Math.random() * 900) + 100)}`;
}

export async function POST(request: NextRequest) {
  try {
    // Checkout wajib akun: tolak pesanan tanpa sesi customer yang sah.
    const bearer = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    const { data: authData } = bearer ? await supabase.auth.getUser(bearer) : { data: { user: null } };
    if (!authData?.user?.id) {
      return NextResponse.json({ error: "Masuk dulu untuk melanjutkan checkout" }, { status: 401 });
    }

    const body = await request.json();
    const { customer, shipping, items } = body;

    // Meta CAPI: identifier browser dikirim dari klien (fbp/fbc), fallback ke cookie request.
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

    console.log("[ORDERS] === NEW ORDER REQUEST ===");
    console.log("[ORDERS] Customer:", { name: customer?.name, whatsapp: customer?.whatsapp?.slice(0, 6) + "***" });
    console.log("[ORDERS] Shipping:", {
      address: shipping?.address?.slice(0, 30) + "...",
      city: shipping?.city,
      district: shipping?.district,
      postalCode: shipping?.postalCode,
      method: shipping?.method,
      clientCost: shipping?.cost,
      originDistrictId: shipping?.originDistrictId,
      destinationDistrictId: shipping?.destinationDistrictId,
      weight: shipping?.weight,
    });
    console.log("[ORDERS] Items count:", items?.length);
    console.log("[ORDERS] Payment:", body.paymentMethod, "Discount:", body.discount);

    if (!customer?.name || !customer?.whatsapp || !shipping?.address || !shipping?.city) {
      console.log("[ORDERS] ERROR: Data wajib tidak lengkap");
      return NextResponse.json({ error: "Data wajib tidak lengkap" }, { status: 400 });
    }

    // ── Payment method: id metode dari admin (bank / QRIS / e-wallet / COD) ──
    const rawPayment = typeof body.paymentMethod === "string" ? body.paymentMethod : "";
    let paymentValue = "";
    let paymentType = "";
    let paymentInstruction: PaymentInstruction | null = null;

    if (isPaymentMethodId(rawPayment)) {
      const { data: pm } = await supabase
        .from("payment_methods")
        .select(
          "id, label, method_type, is_active, bank_name, account_name, account_number, account_info, instructions"
        )
        .eq("id", rawPayment)
        .maybeSingle();

      if (!pm || pm.is_active === false) {
        console.log("[ORDERS] ERROR: Metode pembayaran tidak tersedia:", rawPayment);
        return NextResponse.json({ error: "Metode pembayaran tidak tersedia" }, { status: 400 });
      }
      paymentValue = pm.id as string;
      paymentType = (pm.method_type as string) || "bank";
      paymentInstruction = paymentInstructionFrom(pm);
      console.log("[ORDERS] Payment method from DB:", paymentType, paymentValue);
    } else if (legacyPaymentType(rawPayment)) {
      // pesanan lama (client versi lama) masih kirim 'bank' / 'qris' / 'cod'
      paymentValue = rawPayment;
      paymentType = rawPayment;
    } else {
      console.log("[ORDERS] ERROR: Metode pembayaran tidak valid:", body.paymentMethod);
      return NextResponse.json({ error: "Pilih metode pembayaran terlebih dahulu" }, { status: 400 });
    }

    // ── Shipping cost validation ──
    // Trust the client-provided shipping cost (already verified via /api/shipping/cost).
    // This avoids a second RajaOngkir API call per order (saves quota on 100 hit/day limit).
    let verifiedShippingCost = 0;
    let verifiedShippingMethod = shipping.method || "manual";

    if (shipping.method && typeof shipping.cost === "number" && shipping.cost >= 0) {
      verifiedShippingCost = shipping.cost;
      verifiedShippingMethod = shipping.method;
      console.log("[ORDERS] Using client shipping cost:", verifiedShippingCost, "method:", verifiedShippingMethod);
    } else {
      console.log("[ORDERS] No valid shipping info, cost defaults to 0");
    }

    // ── Server-side CYP price validation ──
    // For CYP items: verify customer_price >= minimum_price from DB
    // For fixed items: use price as-is
    console.log("[ORDERS] Validating item prices...");
    const validatedItems: Array<{ productId: string; name: string; image?: string; color?: string; size?: string; series?: string; kain?: string; quantity: number; price: number; customer_price: number | null; minimum_price: number | null; create_your_price_enabled: boolean }> = [];

    for (const item of items) {
      if (item.create_your_price_enabled) {
        // CYP item: fetch minimum_price from DB (never trust client)
        const { data: product, error: productError } = await supabase
          .from("products")
          .select("minimum_price, create_your_price_enabled")
          .eq("id", item.productId)
          .single();

        if (productError || !product) {
          console.error("[ORDERS] CYP validation: product not found:", item.productId);
          return NextResponse.json({ error: "Produk tidak ditemukan" }, { status: 400 });
        }

        if (!product.create_your_price_enabled || !product.minimum_price) {
          console.error("[ORDERS] CYP validation: product not CYP enabled:", item.productId);
          return NextResponse.json({ error: "Produk ini tidak mendukung Create Your Price" }, { status: 400 });
        }

        const dbMinimumPrice = product.minimum_price;
        const clientCustomerPrice = item.customer_price || item.price;

        if (clientCustomerPrice < dbMinimumPrice) {
          console.error("[ORDERS] CYP validation FAILED:", { productId: item.productId, clientPrice: clientCustomerPrice, dbMinimum: dbMinimumPrice });
          return NextResponse.json({
            error: `Harga untuk "${item.name}" di bawah minimum. Minimum: Rp ${dbMinimumPrice.toLocaleString("id-ID")}`,
          }, { status: 400 });
        }

        console.log("[ORDERS] CYP validated:", { name: item.name, customerPrice: clientCustomerPrice, minimumPrice: dbMinimumPrice });
        validatedItems.push({
          ...item,
          price: clientCustomerPrice,
          customer_price: clientCustomerPrice,
          minimum_price: dbMinimumPrice,
          create_your_price_enabled: true,
        });
      } else {
        // Fixed price item: use as-is
        validatedItems.push({
          ...item,
          customer_price: null,
          minimum_price: null,
          create_your_price_enabled: false,
        });
      }
    }

    const orderNumber = generateOrderNumber();
    const subtotal = validatedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const discount = body.discount || 0;
    const total = subtotal - discount + verifiedShippingCost;

    // ── Server-side stock validation + atomic decrement ──
    // Stok dikurangi DULU secara atomik (RPC samaqu_decrement_stock, row lock FOR UPDATE
    // + guard stock >= qty). Kalau ada item gagal, semua decrement di-rollback & order ditolak.
    // Race condition 2 pembeli checkout stok terakhir: hanya 1 yang dapat decrement.
    const decremented: Array<{ productId: string; color?: string; size?: string; quantity: number }> = [];

    async function rollbackStock() {
      for (const d of decremented) {
        await supabase.rpc("samaqu_restore_stock", {
          p_product_id: d.productId,
          p_color: d.color || "",
          p_size: d.size || "",
          p_qty: d.quantity,
        });
      }
      decremented.length = 0;
    }

    for (const item of validatedItems) {
      if (!item.quantity || item.quantity < 1) {
        console.error("[ORDERS] Stock validation: quantity invalid:", item);
        await rollbackStock();
        return NextResponse.json({ error: `Jumlah untuk "${item.name}" tidak valid` }, { status: 400 });
      }

      // Produk tanpa varian (tidak ada warna/ukuran) → stok tidak dikelola, lewati
      if (!item.color || !item.size || item.color === "-") {
        console.log("[ORDERS] Stock validation: skip (tanpa varian):", item.name);
        continue;
      }

      const { data: stockOk, error: stockError } = await supabase.rpc("samaqu_decrement_stock", {
        p_product_id: item.productId,
        p_color: item.color,
        p_size: item.size,
        p_qty: item.quantity,
      });

      if (stockError) {
        console.error("[ORDERS] Stock RPC error:", stockError);
        await rollbackStock();
        return NextResponse.json({ error: "Gagal memvalidasi stok. Silakan coba lagi." }, { status: 500 });
      }

      if (!stockOk) {
        console.error("[ORDERS] Stock INSUFFICIENT:", { name: item.name, color: item.color, size: item.size, qty: item.quantity });
        await rollbackStock();
        return NextResponse.json({
          error: `Stok "${item.name}" (${item.color} / ${item.size}) tidak mencukupi. Silakan kurangi jumlah atau pilih varian lain.`,
        }, { status: 400 });
      }

      console.log("[ORDERS] Stock decremented:", { name: item.name, color: item.color, size: item.size, qty: item.quantity });
      decremented.push({ productId: item.productId, color: item.color, size: item.size, quantity: item.quantity });
    }

    console.log("[ORDERS] Final order:", { orderNumber, subtotal, shippingCost: verifiedShippingCost, discount, total });

    // ── Berat kirim (gram): berat VARIAN (per produk+warna+ukuran) → berat produk → nilai klien. ──
    // Dihitung ULANG dari DATABASE memakai fungsi pusat yang sama dengan checkout saat meminta
    // ongkir (`sumWeightGramsBySize`), jadi berat untuk ongkir = yang disimpan = yang dikirim ke resi.
    const weightIds = Array.from(new Set(validatedItems.map((i) => i.productId).filter(Boolean)));
    let productWeights: Record<string, number> = {};
    let variantWeights: Record<string, number> = {};
    if (weightIds.length > 0) {
      const [{ data: pRows }, { data: vRows }] = await Promise.all([
        supabase.from("products").select("id, weight").in("id", weightIds),
        supabase.from("product_variants").select("product_id, color, size, weight").in("product_id", weightIds),
      ]);
      productWeights = productWeightMapFromRows(pRows);
      variantWeights = variantWeightMapFromRows(vRows);
    }
    const { grams: serverWeight, missingQty: weightMissing } = sumWeightGramsBySize(
      validatedItems.map((i) => ({ productId: i.productId, color: i.color, size: i.size, quantity: i.quantity })),
      productWeights,
      variantWeights
    );
    const weightGrams = weightMissing === 0 && serverWeight > 0
      ? serverWeight
      : (Number(shipping.weight) || serverWeight || 0);
    // Konsistensi tiga angka: berat yang dipakai client saat meminta ongkir harus sama dengan
    // hitungan server (yang disimpan ke `orders.weight` dan dipakai untuk resi).
    const clientWeight = Number(shipping.weight) || 0;
    if (clientWeight > 0 && clientWeight !== weightGrams) {
      console.warn("[ORDERS] ⚠️ Berat client ≠ berat server:", {
        orderNumber,
        client: clientWeight,
        server: weightGrams,
      });
    }

    // Insert order
    // Pesanan wajib terikat ke akun yang checkout. Id-nya berasal dari token sesi yang sudah
    // diverifikasi di atas (bukan dari payload), dan hanya dipakai kalau baris `customers`-nya
    // ada — kolom `orders.customer_id` ber-FK ke tabel itu.
    const { data: linkedCustomer } = await supabase
      .from("customers")
      .select("id")
      .eq("id", authData.user.id)
      .maybeSingle();
    const linkedCustomerId = linkedCustomer?.id || null;

    // ── Atribusi referral (server-side) ──
    // Kode referral diambil dari cookie `sq_ref` yang diset route /r/[code], lalu divalidasi
    // ULANG ke database di sini. Nilai dari browser tidak pernah dipercaya apa adanya, dan
    // self-referral (email/WA sama dengan affiliate) dibuang.
    const referral = await resolveAttribution(supabase, request, {
      email: customer.email,
      whatsapp: customer.whatsapp,
    });

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        order_number: orderNumber,
        customer_id: linkedCustomerId,
        customer_name: customer.name,
        customer_email: customer.email || null,
        customer_whatsapp: customer.whatsapp,
        shipping_address: shipping.address,
        // Kecamatan + kota disimpan sekaligus (format yang sama dengan /api/open-order): dipakai
        // saat admin membuat resi J&T ("Atur Pesanan"), karena kode area J&T butuh kecamatan.
        shipping_city: [shipping.district, shipping.city].filter(Boolean).join(", "),
        // Kecamatan & provinsi juga disimpan TERPISAH di kolomnya sendiri (bukan cuma digabung
        // di `shipping_city`), supaya dashboard ops & form transaksi bisa MEMBACA datanya —
        // tanpa perlu menebak dari teks alamat.
        shipping_kecamatan: String(shipping.district || "").trim() || null,
        shipping_province: String(shipping.province || "").trim() || null,
        shipping_postal_code: shipping.postalCode || null,
        shipping_notes: shipping.notes || null,
        shipping_method: verifiedShippingMethod,
        shipping_cost: verifiedShippingCost,
        payment_method: paymentValue,
        subtotal,
        discount,
        total,
        status: "pending",
        // Stok sudah dipotong di atas → pembatalan wajib mengembalikannya (lihat src/lib/cancel-order.ts).
        stock_reserved: true,
        weight: weightGrams || null,
        // Atribusi affiliate (nullable — pesanan tanpa referral tetap normal).
        affiliate_id: referral?.affiliateId ?? null,
        referral_code: referral?.code ?? null,
        referral_link_id: referral?.linkId ?? null,
        referral_attributed_at: referral ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (orderError) {
      console.error("[ORDERS] Order insert error:", orderError);
      await rollbackStock();
      return NextResponse.json({ error: "Gagal menyimpan pesanan" }, { status: 500 });
    }

    console.log("[ORDERS] Order created:", order.id, orderNumber);

    // Insert order items (with CYP fields)
    // Foto item disimpan sebagai snapshot supaya riwayat pesanan tidak berubah kalau foto produk
    // diganti. Foto dari keranjang dipakai lebih dulu; kalau kosong, diambil dari katalog dengan
    // aturan yang sama seperti tampilan (src/lib/order-photo.ts).
    const photoLookup = await loadOrderPhotoLookup(validatedItems.map((item) => item.productId));

    const orderItems = validatedItems.map((item) => ({
      order_id: order.id,
      product_id: item.productId,
      product_name: item.name,
      product_image:
        item.image ||
        orderItemPhoto(
          {
            product_id: item.productId,
            product_name: item.name,
            color: item.color,
            kain: item.kain,
            series: item.series,
          },
          photoLookup
        ) ||
        null,
      color: item.color || null,
      size: item.size || null,
      series: item.series || null,
      kain: item.kain || null,
      quantity: item.quantity || 1,
      price: item.price,
      customer_price: item.customer_price,
      minimum_price: item.minimum_price,
    }));

    const { error: itemsError } = await supabase.from("order_items").insert(orderItems);

    if (itemsError) {
      console.error("[ORDERS] Order items insert error:", itemsError);
      // Rollback: hapus order + kembalikan stok supaya tidak ada data menggantung
      await supabase.from("orders").delete().eq("id", order.id);
      await rollbackStock();
      return NextResponse.json({ error: "Gagal menyimpan detail pesanan" }, { status: 500 });
    }

    // Catat komisi affiliate (idempoten: `orders.affiliate_commissions.order_id` UNIQUE).
    // Komisi BELUM otomatis tersedia — statusnya "menunggu" sampai pesanan selesai &
    // masa validasi habis (lihat src/lib/affiliate/commission.ts).
    if (referral) {
      const commission = await recordCommissionForOrder(supabase, {
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
        await supabase
          .from("orders")
          .update({ affiliate_commission_amount: commission.amount })
          .eq("id", order.id);
      }
    }

    // Increment voucher used_count + save usage
    if (body.voucherCode) {
      const { data: vData } = await supabase.from("vouchers").select("used_count").eq("code", body.voucherCode).single();
      if (vData) {
        await supabase.from("vouchers").update({ used_count: vData.used_count + 1 }).eq("code", body.voucherCode);
      }
      if (body.voucherId) {
        await supabase.from("voucher_usages").insert({
          voucher_id: body.voucherId,
          whatsapp_number: customer.whatsapp.replace(/[^0-9]/g, ""),
          order_id: order.id,
        });
      }
    }

    // Resi J&T tidak lagi dibuat di sini: pembuatan resi dipicu admin lewat "Atur Pesanan"
    // (PATCH /api/admin/orders action=createJnt) setelah pembayaran diverifikasi.

    // Sinkron ke lead: kalau nomor ini cocok dengan lead yang MASIH AKTIF, tandai Closing/Beli
    // (order tidak membuat lead baru). Pakai service role (tabel `leads` tanpa policy RLS).
    // Kegagalan sync tidak boleh menggagalkan pesanan yang sudah tersimpan.
    try {
      await markLeadBoughtForOrder(getSupabaseAdmin(), { whatsapp: customer.whatsapp, orderNumber, total });
    } catch (e) {
      console.error("[ORDERS] Lead sync gagal:", e);
    }

    console.log("[ORDERS] === ORDER SUCCESS ===", orderNumber);

    // Pembayaran online (Mayar): invoice dibuat DULU (di server) supaya link-nya bisa ikut dikirim
    // di pesan WA customer dan pelanggan tamu (tanpa sesi) tetap diarahkan ke halaman bayar.
    // Gagal → null: pesanan tetap tersimpan dan pesan dikirim TANPA link (tidak ada link karangan).
    let paymentUrl: string | null = null;
    if (paymentType === "mayar") {
      paymentUrl = await createOrderPaymentLink({
        orderId: order.id,
        orderNumber,
        customerName: customer.name,
        customerEmail: customer.email || null,
        customerWhatsapp: customer.whatsapp,
        total,
        items: validatedItems.map((item) => ({
          // Format sama dengan notifikasi WA: nama · series · warna · kain · size.
          label: formatProductLabel(item),
          quantity: item.quantity || 1,
        })),
      });
    }

    // Notifikasi customer (token Fonnte Customer) & admin (token Fonnte Admin) dikirim bersamaan,
    // saling terpisah: kegagalan salah satu tidak memengaruhi yang lain maupun pesanan yang sudah
    // tersimpan. Klaim `notify_created_at` memastikan pesan checkout tidak pernah dobel.
    await Promise.allSettled([
      sendOnce(order.id, "created", "WA pesanan dibuat (checkout website)", () =>
        notifyCustomerOrderCreated({
          orderNumber,
          customerName: customer.name,
          customerWhatsapp: customer.whatsapp,
          items: validatedItems.map((item) => ({
            name: item.name,
            series: item.series || null,
            kain: item.kain || null,
            color: item.color,
            size: item.size,
            quantity: item.quantity,
            price: item.price,
          })),
          total,
          paymentMethod: paymentInstruction,
          paymentUrl,
        })
      ),
      notifyAdminNewOrder({
        orderNumber,
        customerName: customer.name,
        customerWhatsapp: customer.whatsapp,
        total,
        paymentType: paymentInstruction?.label || paymentType,
        items: validatedItems.map((item) => ({
          name: item.name,
          series: item.series || null,
          kain: item.kain || null,
          color: item.color,
          size: item.size,
          quantity: item.quantity,
          price: item.price,
        })),
        shippingCity: [shipping.district, shipping.city].filter(Boolean).join(", "),
        notes: shipping.notes || null,
      }),
    ]);

    // Meta CAPI: Purchase dikirim SEKALI di server setelah order + item tersimpan.
    // `after` = jalan setelah response terkirim, jadi tidak menahan/menggagalkan checkout.
    // event_id = nomor pesanan (sama dengan eventID Purchase di browser Pixel).
    after(async () => {
      try {
        await sendMetaPurchaseEvent({
          orderNumber,
          // Sesuai ketentuan: subtotal produk saja, ongkir & diskon tidak ikut.
          value: subtotal,
          contents: validatedItems.map((item) => ({
            id: item.productId,
            quantity: item.quantity || 1,
            item_price: item.price,
          })),
          eventSourceUrl: metaEventSourceUrl,
          user: {
            name: customer.name,
            email: customer.email,
            phone: customer.whatsapp,
            city: shipping.city,
            externalId: linkedCustomerId,
          },
          fbp: metaFbp,
          fbc: metaFbc,
          clientIp: metaClientIp,
          clientUserAgent: metaUserAgent,
        });
      } catch (error) {
        // CAPI tidak boleh mengganggu order.
        console.warn("[Meta CAPI] Purchase dilewati:", error instanceof Error ? error.message : "unknown");
      }
    });

    return NextResponse.json({
      success: true,
      orderNumber,
      orderId: order.id,
      total,
      awbNo: null,
      paymentUrl,
      // Token untuk halaman sukses (`/checkout/success?order=…&t=…`) — dipakai supaya pesanan
      // tetap bisa dilihat setelah policy RLS `orders` ditutup dari anon, tanpa membuka
      // pesanan orang lain.
      orderToken: orderLookupToken(orderNumber),
    });
  } catch (error) {
    console.error("[ORDERS] === ORDER FAILED ===", error);
    return NextResponse.json({ error: "Terjadi kesalahan server" }, { status: 500 });
  }
}

// GET publik dihapus: dulu mengembalikan pesanan SEMUA pelanggan (`select("*, order_items(*)")`)
// tanpa autentikasi. Daftar pesanan sekarang dibaca lewat GET /api/ops/orders (ber-guard admin),
// dan customer membaca pesanannya sendiri lewat policy RLS `auth.uid() = customer_id`.
