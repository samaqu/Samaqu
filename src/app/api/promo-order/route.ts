import { NextRequest, NextResponse, after } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

import {
  buildOpenOrderProducts,
  findOpenOrderProduct,
  openOrderVariantFor,
  type OpenOrderStockRow,
} from "@/lib/open-order-offering";
import {
  OPEN_ORDER_ADDON,
  OPEN_ORDER_ADDON_TARGET_ID,
  OPEN_ORDER_ADDON_VARIANT,
  resolveAddonWeightFromCatalog,
} from "@/lib/open-order-config";
import {
  sumWeightGramsBySize,
  productWeightMapFromRows,
  variantWeightMapFromRows,
} from "@/lib/shipping-weight";
import { verifyJntShipping } from "@/lib/shipping-verify";
import { markLeadBoughtForOrder } from "@/lib/ops-lead-sync";
import { notifyAdminNewOrder, notifyCustomerOrderCreated } from "@/lib/fonnte";
import { sendOnce } from "@/lib/order-notify";
import { orderItemPhoto } from "@/lib/order-photo";
import { loadOrderPhotoLookup } from "@/lib/order-photo-data";
import { snapshotOrderHpp } from "@/lib/produksi-order-hpp";
import { checkPurchaseEligibility } from "@/lib/affiliate/eligibility";
import { localPhone, waNumber } from "@/lib/whatsapp";
import {
  buildFbc,
  getClientIp,
  getMetaCookies,
  sendMetaPurchaseEvent,
} from "@/lib/meta-capi";
import { metaCatalogContents } from "@/lib/meta-catalog";
import { PROMO_FCH_SOURCE } from "@/lib/promo/free-cover-hanger";

/**
 * POST /api/promo-order — pesanan dari landing "Free Cover Hanger".
 *
 * Menyalin alur `/api/open-order` (validasi katalog → ongkir → potong stok → simpan →
 * notifikasi → CAPI), dengan tiga perbedaan yang menjadi inti promo:
 *
 * 1. **Harga tidak bisa ditawar.** `openOrderEffectivePrice()` dipakai apa adanya; nilai
 *    harga dari klien diabaikan. Create Your Price tidak berlaku di sini.
 * 2. **Bonus Cover Hanger otomatis.** Baris `cover-hanger` ditambahkan server-side dengan
 *    harga **Rp0** — hanya bila nomor WhatsApp belum pernah punya pesanan valid
 *    (`checkPurchaseEligibility`). Pelanggan lama tetap bisa memesan, hanya tanpa bonus.
 * 3. **Nomor pesanan `FCH-`**, supaya bisa difilter/dipisah dari `SMY-`/`CYO-`/`OPS-`.
 *
 * Tidak ada akun/login: promo terbuka untuk pengunjung baru (gerbang `StepAuth` dilewati),
 * jadi `customer_id` = akun yang ada untuk nomor itu bila ditemukan, selain itu null.
 */

const MAX_BODY_BYTES = 256 * 1024;

interface PromoItemInput {
  productId?: string;
  color?: string;
  size?: string;
  series?: string;
  quantity?: number;
}

interface ValidatedItem {
  productId: string;
  productName: string;
  color: string;
  size: string;
  series: string | null;
  kain: string | null;
  quantity: number;
  price: number;
  isBonus: boolean;
}

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** `FCH-YYYYMMDD-NNN` — WIB, sama pola dengan `SMY-`/`CYO-`. */
function generateOrderNumber(): string {
  const wib = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const ymd = wib.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = String(Math.floor(Math.random() * 900) + 100);
  return `FCH-${ymd}-${rand}`;
}

export async function POST(request: NextRequest) {
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_BODY_BYTES) return bad("Payload terlalu besar", 413);

    const supabaseAdmin = getSupabaseAdmin();

    const body = await request.json();
    const rawCustomer = body.customer ?? {};
    const rawItems: PromoItemInput[] = Array.isArray(body.items) ? body.items : [];

    // ── Data pemesan (tanpa Instagram; promo tidak memintanya) ──
    const name = String(rawCustomer.name ?? "").trim();
    const whatsapp = String(rawCustomer.whatsapp ?? "").trim();
    const city = String(rawCustomer.city ?? "").trim();
    const district = String(rawCustomer.district ?? "").trim();
    const address = String(rawCustomer.address ?? "").trim();
    const postalCode = String(rawCustomer.postalCode ?? "").trim();
    const note = String(rawCustomer.notes ?? "").trim();

    if (!name || !whatsapp || !city || !district || !address) {
      return bad("Data pemesan belum lengkap");
    }
    if (rawItems.length === 0) return bad("Pesanan masih kosong");

    // ── Katalog dibaca ulang di server (klien tidak dipercaya) ──
    // Memakai baris MENTAH dari Supabase, sama seperti `/api/open-order`: `getProducts()`
    // mengubah bentuk datanya dan menghilangkan kolom yang dibutuhkan
    // `buildOpenOrderProducts` (mis. `series`, `open_order_enabled`).
    const { data: catalogRows, error: catalogError } = await supabaseAdmin
      .from("products")
      .select("*, jenis_kain(*)")
      .eq("is_published", true)
      .order("created_at", { ascending: true });
    if (catalogError) {
      console.error("[PROMO-ORDER] Catalog fetch error:", catalogError);
      return bad("Gagal membaca katalog", 500);
    }

    const { data: stockData } = await supabaseAdmin
      .from("product_variants")
      // `promo_fch_enabled` = sakelar promo PER UKURAN. Varian yang dimatikan dibuang di sini
      // supaya tidak bisa dipesan lewat request manual (UI & server memakai aturan yang sama).
      .select("product_id, color, size, stock, weight, promo_fch_enabled");

    const stockRows = ((stockData ?? []) as (OpenOrderStockRow & { promo_fch_enabled?: boolean | null })[])
      .filter((row) => row.promo_fch_enabled !== false)
      .map(({ product_id, color, size, stock, weight }) => ({ product_id, color, size, stock, weight }));

    /*
     * Dua sakelar berbeda, JANGAN dicampur:
     *  - `products.promo_fch_enabled` → produk mana yang ikut promo Free Cover Hanger,
     *  - `products.open_order_enabled` → produk mana yang ikut program Open Order.
     *
     * `buildOpenOrderProducts` menyaring dengan `open_order_enabled`, jadi nilainya
     * dinormalkan ke `true` — penyaringan promo dilakukan lewat `promo_fch_enabled` di bawah.
     */
    const promoRows = (catalogRows ?? []).map((row) => {
      const value = (row as Record<string, unknown>).promo_fch_enabled;
      return {
        ...(row as Record<string, unknown>),
        open_order_enabled: true,
        // Kolom belum dibuat (migrasi belum jalan) → `undefined` → produk tetap ikut.
        _promo_enabled: value !== false,
      };
    });

    const filtered = promoRows.filter((row) => row._promo_enabled !== false);
    const products = buildOpenOrderProducts(filtered as never, stockRows);
    if (products.length === 0) return bad("Katalog promo belum tersedia");

    // ── Validasi item: produk, varian, ukuran, jumlah, harga dari katalog ──
    const validatedItems: ValidatedItem[] = [];

    for (const raw of rawItems) {
      const product = findOpenOrderProduct(products, String(raw.productId ?? ""));
      if (!product) return bad("Produk tidak valid");

      const color = String(raw.color ?? "").trim();
      const series = String(raw.series ?? "").trim();
      const size = String(raw.size ?? "").trim().toUpperCase();
      const quantity = Math.max(1, Math.floor(Number(raw.quantity) || 1));

      const seriesOption = product.series.find((option) => option.name === series) ?? null;
      const variant = openOrderVariantFor(product, color, seriesOption?.name ?? null);
      if (!variant) return bad(`Varian untuk ${product.name} tidak ditemukan`);
      if (!variant.sizes.includes(size)) return bad(`Ukuran untuk ${product.name} tidak tersedia`);

      // Harga SELALU dari katalog — bukan dari klien (promo tidak memakai Create Your Price).
      const price = seriesOption?.price ?? product.price;

      validatedItems.push({
        productId: variant.productId,
        productName: seriesOption ? `${product.name} — ${seriesOption.name}` : product.name,
        color,
        size,
        series: seriesOption ? seriesOption.name : null,
        kain: product.kain || null,
        quantity,
        price,
        isBonus: false,
      });
    }

    // ── Bonus Cover Hanger: hanya untuk nomor WhatsApp yang belum pernah beli ──
    const eligibility = await checkPurchaseEligibility(supabaseAdmin, {
      email: rawCustomer.email ?? null,
      phone: whatsapp,
    });
    const bonusEligible = eligibility.status !== "eligible";

    /**
     * Tautkan pesanan ke akun customer (kalau nomor WhatsApp-nya terdaftar).
     *
     * Promo sengaja bisa dipesan TANPA login, jadi dulu `customer_id` selalu null dan
     * pesanannya tidak pernah muncul di dashboard customer. Nomor WhatsApp tetap
     * dicocokkan ke tabel `customers`; kalau ketemu, pesanan ikut masuk riwayat akun.
     * Gagal mencocokkan → tetap null, alur pesanan tidak terpengaruh.
     */
    let linkedCustomerId: string | null = null;
    if (whatsapp) {
      // Dua bentuk yang mungkin tersimpan di `customers.whatsapp`: 08… (lokal) atau 62… .
      const local = localPhone(whatsapp);
      const international = waNumber(whatsapp);
      if (local || international) {
        const { data: matched } = await supabaseAdmin
          .from("customers")
          .select("id")
          .or(`whatsapp.eq.${local},whatsapp.eq.${international}`)
          .limit(1)
          .maybeSingle();
        if (matched?.id) linkedCustomerId = String(matched.id);
      }
    }

    // Berat & harga add-on dari katalog, fallback ke setting admin.
    const { data: addonProduct } = await supabaseAdmin
      .from("products")
      .select("id, weight, price, name")
      .eq("id", OPEN_ORDER_ADDON_TARGET_ID)
      .maybeSingle();
    const { data: addonVariant } = await supabaseAdmin
      .from("product_variants")
      .select("product_id, color, size, stock, weight")
      .eq("product_id", OPEN_ORDER_ADDON_TARGET_ID)
      .eq("color", OPEN_ORDER_ADDON_VARIANT.color)
      .eq("size", OPEN_ORDER_ADDON_VARIANT.size)
      .maybeSingle();
    const { data: addonSetting } = await supabaseAdmin
      .from("store_settings")
      .select("open_order_addon_weight, promo_fch_active, promo_fch_quota_left, promo_fch_quota_total, promo_fch_start_date, promo_fch_end_date")
      .eq("id", 1)
      .maybeSingle();

    // Stok bonus: bila habis, bonus dilewati — pesanan tetap jalan.
    const bonusStock = typeof addonVariant?.stock === "number" ? addonVariant.stock : 0;

    /**
     * Syarat bonus: pelanggan baru + produk/varian bonus ada + stok bonus + **kuota promo**
     * + promo aktif + masih dalam periode (kalau periodenya diisi).
     *
     * Kuota dikunci (sisa > 0) DULU di sini hanya sebagai pratinjau; pengambilan yang benar-benar
     * atomik terjadi setelah stok dipotong (lihat `samaqu_consume_promo_quota`).
     */
    const promoActive = (addonSetting as { promo_fch_active?: boolean } | null)?.promo_fch_active !== false;
    const quotaLeft = Number((addonSetting as { promo_fch_quota_left?: number } | null)?.promo_fch_quota_left ?? 0);
    const promoStart = (addonSetting as { promo_fch_start_date?: string | null } | null)?.promo_fch_start_date ?? null;
    const promoEnd = (addonSetting as { promo_fch_end_date?: string | null } | null)?.promo_fch_end_date ?? null;
    // Tanggal WIB — disamakan dengan tanggal yang diisi admin (YYYY-MM-DD).
    const todayWib = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
    const inPeriod = (!promoStart || todayWib >= promoStart) && (!promoEnd || todayWib <= promoEnd);

    const quotaAvailable = quotaLeft > 0;
    const giveBonus =
      bonusEligible && promoActive && inPeriod && quotaAvailable && Boolean(addonProduct) && Boolean(addonVariant) && bonusStock > 0;

    const addonWeight = resolveAddonWeightFromCatalog(
      addonVariant?.weight,
      addonProduct?.weight,
      addonSetting?.open_order_addon_weight,
    );

    if (giveBonus) {
      validatedItems.push({
        productId: OPEN_ORDER_ADDON_TARGET_ID,
        productName: OPEN_ORDER_ADDON.name,
        color: OPEN_ORDER_ADDON_VARIANT.color,
        size: OPEN_ORDER_ADDON_VARIANT.size,
        // `series` diisi penanda agar mudah dikenali di order_items.
        series: null,
        kain: null,
        quantity: 1,
        // Harga Rp0 — ini bonus, bukan add-on berbayar.
        price: 0,
        isBonus: true,
      });
    }

    // ── Berat: barang + bonus (bonus memakai berat katalog, fallback setting admin) ──
    const { data: productWeightRows } = await supabaseAdmin
      .from("products")
      .select("id, weight")
      .in("id", Array.from(new Set(validatedItems.map((item) => item.productId))));
    const { data: variantWeightRows } = await supabaseAdmin
      .from("product_variants")
      .select("product_id, color, size, weight")
      .in("product_id", Array.from(new Set(validatedItems.map((item) => item.productId))));

    const productWeights = productWeightMapFromRows(productWeightRows as never);
    const variantWeights = variantWeightMapFromRows(variantWeightRows as never);

    // Baris bonus TIDAK ikut `sumWeightGramsBySize`: produk `cover-hanger` tidak punya berat
    // di katalog, sehingga fungsi itu memakai fallback 1.200 g dan total berat melonjak.
    const { grams, missingQty } = sumWeightGramsBySize(
      validatedItems
        .filter((item) => !item.isBonus)
        .map((item) => ({
          productId: item.productId,
          color: item.color,
          size: item.size,
          quantity: item.quantity,
        })),
      productWeights,
      variantWeights,
    );
    const itemsWeight = grams + missingQty * 1200;
    const totalWeight = Math.max(300, itemsWeight + (giveBonus ? addonWeight : 0));

    // ── Ongkir: diverifikasi server lewat API J&T (fungsi yang sama dengan Open Order) ──
    const shippingMethod = String(rawCustomer.shippingMethod ?? "").trim();
    const shipping = await verifyJntShipping({
      city,
      district,
      weightGrams: totalWeight,
      method: shippingMethod || "EZ",
      cost: Number(rawCustomer.shippingCost) || 0,
      allowManual: false,
    });
    if (!shipping.ok) {
      return bad(shipping.error, shipping.status ?? 400);
    }
    const shippingCost = shipping.cost;
    const shippingService = String(shipping.method ?? shippingMethod ?? "EZ").replace(/^J&T\s*/i, "").toUpperCase() || "EZ";

    const subtotal = validatedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const total = subtotal + shippingCost;
    const orderNumber = generateOrderNumber();

    // ── Potong stok (atomik, rollback kalau ada yang gagal) ──
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
      if (!item.color || !item.size || item.color === "-") continue;

      const { data: stockOk, error: stockError } = await supabaseAdmin.rpc("samaqu_decrement_stock", {
        p_product_id: item.productId,
        p_color: item.color,
        p_size: item.size,
        p_qty: item.quantity,
      });

      if (stockError) {
        console.error("[PROMO-ORDER] Stock RPC error:", stockError);
        await rollbackStock();
        return bad("Gagal memvalidasi stok. Silakan coba lagi.", 500);
      }
      if (!stockOk) {
        await rollbackStock();
        return bad(`Stok "${item.productName}" (${item.color} / ${item.size}) tidak mencukupi.`);
      }

      decremented.push({ productId: item.productId, color: item.color, size: item.size, quantity: item.quantity });
    }

    // ── Ambil kuota bonus (atomik) ──
    // Dicek SETELAH stok dipotong karena RPC mengurangi kuota hanya bila sisa > 0 — kalau dua
    // checkout berbarengan, yang kalah balapan tidak akan mendapat bonus dan stoknya dikembalikan.
    // `bonusGranted` = bonus yang benar-benar diberikan (bukan sekadar niat dari pratinjau).
    let bonusGranted = false;
    let bonusReason: string | null = null;

    if (giveBonus) {
      const { data: quotaOk, error: quotaError } = await supabaseAdmin.rpc("samaqu_consume_promo_quota");

      if (quotaError) {
        console.error("[PROMO-ORDER] Quota RPC error:", quotaError);
        await rollbackStock();
        return bad("Gagal memvalidasi kuota bonus. Silakan coba lagi.", 500);
      }

      if (quotaOk === true) {
        bonusGranted = true;
        // Stok bonus ikut dipotong: bonus sudah masuk `validatedItems` dan didekrementasi di loop
        // di atas, jadi tidak perlu potong ulang. Longgarkan hanya bila ternyata tidak dipotong
        // (varian tak dikelola) supaya kuota tidak berkurang tanpa stok bergerak.
        const addonDecremented = decremented.some((row) => row.productId === OPEN_ORDER_ADDON_TARGET_ID);
        if (!addonDecremented) {
          await supabaseAdmin.rpc("samaqu_restore_promo_quota");
          bonusGranted = false;
          bonusReason = "out-of-stock";
        }
      } else {
        // Kuota habis tepat saat checkout (kalah balapan dengan pembeli lain).
        bonusGranted = false;
        bonusReason = "quota-exhausted";
      }
    }

    // Bonus batal diberikan → buang barisnya supaya tidak ikut tersimpan/terkirim.
    if (giveBonus && !bonusGranted) {
      const addonIndex = validatedItems.findIndex((item) => item.isBonus);
      if (addonIndex >= 0) validatedItems.splice(addonIndex, 1);
    }

    // ── Simpan pesanan ──
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .insert({
        order_number: orderNumber,
        customer_id: linkedCustomerId,
        customer_name: name,
        customer_email: String(rawCustomer.email ?? "").trim() || null,
        customer_whatsapp: whatsapp,
        shipping_address: address,
        shipping_city: [district, city].filter(Boolean).join(", "),
        shipping_kecamatan: district || null,
        shipping_province: String(rawCustomer.province ?? "").trim() || null,
        shipping_postal_code: postalCode || null,
        shipping_method: `J&T ${shippingService}`,
        shipping_cost: shippingCost,
        payment_method: String(body.paymentMethod ?? "").trim() || "bank",
        subtotal,
        discount: 0,
        total,
        status: "pending",
        weight: totalWeight,
        stock_reserved: true,
        shipping_notes: note,
        // Penanda bonus: dipakai pembatalan untuk mengembalikan kuota + stok tepat sekali.
        promo_bonus_given: bonusGranted,
        // Penanda sumber: dipakai filter & laporan di menu Transaksi.
        source: PROMO_FCH_SOURCE,
      })
      .select("id, order_number")
      .single();

    if (orderError || !order) {
      console.error("[PROMO-ORDER] Order insert error:", orderError);
      await rollbackStock();
      // Kuota sudah diambil tapi pesanan gagal → kembalikan supaya tidak hangus.
      if (bonusGranted) await supabaseAdmin.rpc("samaqu_restore_promo_quota");
      return bad("Gagal menyimpan pesanan", 500);
    }

    // ── Baris pesanan (snapshot foto, sama seperti Open Order) ──
    const photoLookup = await loadOrderPhotoLookup(validatedItems.map((item) => item.productId));

    const orderItems = validatedItems.map((item) => ({
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
          photoLookup,
        ) || null,
      customer_price: null,
      minimum_price: null,
    }));

    const { error: itemsError } = await supabaseAdmin.from("order_items").insert(orderItems);
    if (itemsError) {
      console.error("[PROMO-ORDER] Order items insert error:", itemsError);
      await supabaseAdmin.from("orders").delete().eq("id", order.id);
      await rollbackStock();
      if (bonusGranted) await supabaseAdmin.rpc("samaqu_restore_promo_quota");
      return bad("Gagal menyimpan detail pesanan", 500);
    }

    try {
      await snapshotOrderHpp(supabaseAdmin, order.id);
    } catch (snapshotError) {
      console.error("[PROMO-ORDER] snapshot HPP:", orderNumber, snapshotError);
    }

    try {
      await markLeadBoughtForOrder(supabaseAdmin, { whatsapp, orderNumber, total });
    } catch (e) {
      console.error("[PROMO-ORDER] Lead sync gagal:", e);
    }

    // ── Notifikasi (best effort) ──
    const notificationItems = validatedItems.map((item) => ({
      name: item.productName,
      series: item.series,
      kain: item.kain,
      color: item.color,
      size: item.size,
      quantity: item.quantity,
      price: item.price,
    }));

    await Promise.allSettled([
      sendOnce(order.id, "created", "WA pesanan dibuat (Promo FCH)", () =>
        notifyCustomerOrderCreated({
          orderNumber,
          customerName: name,
          customerWhatsapp: whatsapp,
          items: notificationItems,
          total,
          paymentMethod: null,
          isOpenOrder: false,
          paymentUrl: null,
        }),
      ),
      notifyAdminNewOrder({
        orderNumber,
        customerName: name,
        customerWhatsapp: whatsapp,
        total,
        paymentType: "Sesuai pilihan customer",
        items: notificationItems,
        shippingCity: [district, city].filter(Boolean).join(", "),
        notes: note || null,
        source: bonusGranted ? "Promo Free Cover Hanger (+bonus)" : "Promo Free Cover Hanger",
      }),
    ]);

    // ── Meta CAPI Purchase (event_id = nomor pesanan, sama dengan browser) ──
    const metaBody = body?.meta && typeof body.meta === "object" ? body.meta : {};
    const metaCookies = getMetaCookies(request);
    after(async () => {
      try {
        await sendMetaPurchaseEvent({
          orderNumber,
          value: subtotal,
          contents: metaCatalogContents(
            validatedItems
              .filter((item) => !item.isBonus)
              .map((item) => ({
                id: item.productId,
                series: item.series,
                size: item.size,
                quantity: item.quantity,
                itemPrice: item.price,
              })),
          ),
          eventSourceUrl:
            typeof metaBody.eventSourceUrl === "string" ? metaBody.eventSourceUrl : request.headers.get("referer"),
          user: { name, phone: whatsapp, city },
          fbp: typeof metaBody.fbp === "string" ? metaBody.fbp : metaCookies.fbp,
          fbc:
            typeof metaBody.fbc === "string"
              ? metaBody.fbc
              : metaCookies.fbc || buildFbc(typeof metaBody.fbclid === "string" ? metaBody.fbclid : undefined),
          clientIp: getClientIp(request),
          clientUserAgent: request.headers.get("user-agent") || undefined,
        });
      } catch (error) {
        console.warn("[PROMO-ORDER] CAPI Purchase dilewati:", error instanceof Error ? error.message : "unknown");
      }
    });

    return NextResponse.json({
      success: true,
      orderNumber,
      total,
      productTotal: subtotal,
      weight: totalWeight,
      // Status bonus yang BENAR-BENAR diberikan (bukan niat awal) — lihat `samaqu_consume_promo_quota`.
      bonus: bonusGranted,
      bonusReason:
        bonusGranted
          ? null
          : bonusReason ??
            (!bonusEligible
              ? "not-new-customer"
              : !promoActive
                ? "promo-inactive"
                : !inPeriod
                  ? "out-of-period"
                  : !quotaAvailable
                    ? "quota-exhausted"
                    : "out-of-stock"),
    });
  } catch (error) {
    console.error("[PROMO-ORDER] Failed:", error);
    return bad("Terjadi kesalahan server", 500);
  }
}
