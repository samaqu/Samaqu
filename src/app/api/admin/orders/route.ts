import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { createJntOrderForOrder } from "@/lib/jnt/order-from-order";
import { trackShipment } from "@/lib/jnt/track";
import { applyTrackingToOrder } from "@/lib/jnt/tracking-sync";
import { cancelOrderCompletely } from "@/lib/cancel-order";
import { notifyCustomerOrderPaid, notifyCustomerOrderShipped } from "@/lib/fonnte";
import { claimOrderNotification, recordShippedNotifyStatus, sendOnce } from "@/lib/order-notify";
import { isCodOrderPayment } from "@/lib/payment-methods";
import { isOpsAdmin, opsIdentity, unauthorized } from "@/lib/ops-auth";
import { syncCommissionStatus } from "@/lib/affiliate/commission";
import { computeOrderPackaging, packagingItemsForRpc } from "@/lib/produksi-order-hpp";

/**
 * Notifikasi "pesanan dikirim" untuk resi yang disimpan manual (HBO) — memakai klaim atomik
 * `orders.shipped_notified_at` yang sama dengan jalur tracking, jadi menyimpan ulang nomor resi
 * atau menekan "Tandai Dikirim" berulang tidak pernah mengirim pesan dobel.
 */
async function notifyShippedOnce(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  order: {
    id: string;
    order_number?: string | null;
    customer_name?: string | null;
    customer_whatsapp?: string | null;
    awb_no: string;
  }
) {
  if (!(await claimOrderNotification(order.id, "shipped"))) return;
  let sent = false;
  try {
    sent = await notifyCustomerOrderShipped({
      orderNumber: order.order_number || "",
      customerName: order.customer_name || "",
      customerWhatsapp: order.customer_whatsapp || "",
      awbNo: order.awb_no,
    });
  } catch (e) {
    console.error("[ADMIN] Notifikasi 'dikirim' error:", order.order_number, e);
  }
  await recordShippedNotifyStatus(order.id, sent);
}

/** Penyelarasan komisi affiliate — kegagalan tidak boleh menggagalkan aksi resi. */
async function syncCommissionStatusSafe(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  orderId: string
) {
  try {
    await syncCommissionStatus(supabaseAdmin, orderId, { actor: "admin-manual-resi" });
  } catch (e) {
    console.error("[ADMIN] Gagal menyelaraskan komisi affiliate:", e);
  }
}

async function packOrderForResi(
  admin: ReturnType<typeof getSupabaseAdmin>,
  orderId: string,
  packaging: any,
  actor: string,
) {
  const computed = await computeOrderPackaging(admin, orderId);
  const items = packagingItemsForRpc(computed.items, packaging?.items);
  if (items.length === 0) return { packed: false, warning: false };

  const { data, error } = await admin.rpc("production_pack_order", {
    p_order_id: orderId,
    p_items: items,
    // Cover & Hanger kini produk berstok sendiri; tidak ada komponen opsional
    // yang dipotong dari pesanan.
    p_use_cover_hanger: false,
    p_request_id: `pack:${orderId}`,
    p_actor: actor,
  });
  if (error) throw new Error(error.message);

  return {
    packed: !Boolean(data?.already),
    warning: Boolean(data?.warning),
  };
}

export async function PATCH(request: NextRequest) {
  if (!(await isOpsAdmin(request))) return unauthorized();
  try {
    const { orderId, orderNumber, status, action, awbNo, shipped, packaging } = await request.json();
    const identity = await opsIdentity(request);
    const actor = identity?.email || "admin";
    const identifier = orderNumber || orderId;
    console.log("[ADMIN] PATCH request:", { identifier, status, action });

    if (!identifier) {
      return NextResponse.json({ error: "Order ID wajib diisi" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Cancel J&T order before updating status
    if (action === "cancelJnt") {
      const { data: order, error: fetchError } = await supabaseAdmin
        .from("orders")
        .select("id, order_number, status, awb_no, jnt_order_id, stock_reserved, customer_name, customer_whatsapp")
        .eq("order_number", identifier)
        .single();

      if (fetchError || !order) {
        return NextResponse.json({ error: "Pesanan tidak ditemukan" }, { status: 404 });
      }

      if (!order.awb_no && !order.jnt_order_id) {
        return NextResponse.json({ error: "Pesanan ini belum memiliki AWB J&T" }, { status: 400 });
      }

      // Void resi di J&T dulu, stok website dikembalikan, baru status `dibatalkan` — satu jalur
      // bersama dengan chip status & cron auto-cancel (lihat src/lib/cancel-order.ts).
      const result = await cancelOrderCompletely(order, "Dibatalkan oleh admin");
      if (!result.success) {
        return result.stage === "jnt"
          ? NextResponse.json({ error: `Gagal batalkan J&T: ${result.message}` }, { status: 400 })
          : NextResponse.json({ error: "J&T dibatalkan tapi gagal update status" }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: "Berhasil membatalkan pesanan di J&T",
        packagingWarning: Boolean(result.packagingWarning),
      });
    }

    // ── "Atur Pesanan": buat resi J&T setelah pembayaran diverifikasi ──
    // Dulu resi terbit otomatis saat customer checkout; sekarang admin yang memicunya (ala
    // Shopee Seller Centre). Sukses → pesanan langsung berstatus `diproses`.
    if (action === "createJnt") {
      const { data: order, error: fetchError } = await supabaseAdmin
        .from("orders")
        .select(
          "id, order_number, customer_name, customer_whatsapp, shipping_address, shipping_city, shipping_kecamatan, shipping_postal_code, total, shipping_cost, weight, payment_method, awb_no, status, shipping_method, order_items(product_id, product_name, color, size, quantity)"
        )
        .eq("order_number", identifier)
        .single();

      if (fetchError || !order) {
        return NextResponse.json({ error: "Pesanan tidak ditemukan" }, { status: 404 });
      }

      if (order.awb_no) {
        return NextResponse.json(
          { error: `Pesanan ini sudah punya nomor resi J&T (${order.awb_no}).` },
          { status: 400 }
        );
      }

      if (order.status === "dibatalkan") {
        return NextResponse.json({ error: "Pesanan sudah dibatalkan, resi tidak bisa dibuat." }, { status: 400 });
      }

      let packResult: { packed: boolean; warning: boolean } = { packed: false, warning: false };
      try {
        packResult = await packOrderForResi(supabaseAdmin, order.id, packaging, actor);
      } catch (packError) {
        console.error("[ADMIN] packaging gagal, resi tetap lanjut:", identifier, packError);
        packResult = { packed: false, warning: true };
      }

      const result = await createJntOrderForOrder({
        order_number: order.order_number,
        customer_name: order.customer_name,
        customer_whatsapp: order.customer_whatsapp,
        shipping_address: order.shipping_address,
        shipping_city: order.shipping_city,
        shipping_kecamatan: order.shipping_kecamatan,
        shipping_postal_code: order.shipping_postal_code,
        total: order.total,
        // Ongkir tersimpan dipakai mencocokkan layanan (EZ/ECO) supaya resinya sama dengan
        // layanan yang ditagih ke pembeli.
        shipping_cost: order.shipping_cost,
        weight: order.weight,
        payment_method: order.payment_method,
        shipping_method: order.shipping_method,
        order_items: order.order_items ?? [],
      });

      if (!result.success || !result.awbNo) {
        if (packResult.packed) {
          try {
            await supabaseAdmin.rpc("production_return_order_packaging", {
              p_order_id: order.id,
              p_reason: "Resi J&T gagal dibuat",
              p_actor: actor,
            });
          } catch (returnError) {
            console.error("[ADMIN] retur kemasan saat resi gagal:", identifier, returnError);
          }
        }
        console.error("[ADMIN] J&T order create failed:", identifier, result.error);
        return NextResponse.json({ error: `Gagal membuat resi J&T: ${result.error}` }, { status: 400 });
      }

      // PENTING: resi terbit ≠ paket sudah dikirim. Status pesanan tetap `diproses`
      // (masih "Perlu Dikirim") dan status pengiriman jadi `menunggu_pickup`. Baru naik ke
      // `dikirim` setelah J&T melaporkan pemindaian (lihat src/lib/jnt/tracking-sync.ts).
      const { error: updateError } = await supabaseAdmin
        .from("orders")
        .update({
          awb_no: result.awbNo,
          jnt_order_id: order.order_number,
          status: "diproses",
          shipping_status: "menunggu_pickup",
          // Berat yang benar-benar dipakai resi (dihitung ulang dari berat per ukuran). Pesanan ini
          // belum punya resi, jadi aman diselaraskan — bukan penulisan ulang massal.
          ...(result.weightGrams && result.weightGrams !== order.weight ? { weight: result.weightGrams } : {}),
          // Layanan J&T yang benar-benar dipakai resi — dipakai badge "Service EZ/ECO"
          // di detail pesanan & label pengiriman.
          ...(result.serviceCode ? { shipping_method: `J&T ${result.serviceCode}` } : {}),
        })
        .eq("id", order.id);

      if (updateError) {
        if (packResult.packed) {
          try {
            await supabaseAdmin.rpc("production_return_order_packaging", {
              p_order_id: order.id,
              p_reason: "Gagal menyimpan resi J&T",
              p_actor: actor,
            });
          } catch (returnError) {
            console.error("[ADMIN] retur kemasan saat simpan resi gagal:", identifier, returnError);
          }
        }
        console.error("[ADMIN] Failed to save J&T AWB:", updateError);
        return NextResponse.json({ error: "Resi J&T terbit tapi gagal disimpan. Coba lagi." }, { status: 500 });
      }

      console.log("[ADMIN] J&T AWB created:", identifier, result.awbNo);
      return NextResponse.json({
        success: true,
        awbNo: result.awbNo,
        status: "diproses",
        shippingStatus: "menunggu_pickup",
        serviceCode: result.serviceCode,
        packagingWarning: packResult.warning,
      });
    }

    // ── "Buat Resi" manual untuk pesanan HBO ──
    // Pesanan HBO dibuat admin langsung di J&T VIP (di luar sistem), jadi resinya bukan dari
    // API J&T: admin mengetik nomor resinya di sini. Alur statusnya SAMA dengan resi EZ/ECO
    // (menunggu_pickup → dikirim), termasuk notifikasi "dikirim" lewat klaim atomik yang sama,
    // sehingga nomor resi/status yang sama tidak pernah memicu pesan dobel.
    if (action === "manualResi") {
      const { data: order, error: fetchError } = await supabaseAdmin
        .from("orders")
        .select(
          "id, order_number, status, awb_no, shipping_status, shipping_method, customer_name, customer_whatsapp"
        )
        .eq("order_number", identifier)
        .single();

      if (fetchError || !order) {
        return NextResponse.json({ error: "Pesanan tidak ditemukan" }, { status: 404 });
      }

      if (order.status === "dibatalkan") {
        return NextResponse.json({ error: "Pesanan sudah dibatalkan, resi tidak bisa disimpan." }, { status: 400 });
      }

      // Paket sudah diterima → resi bersifat final. Jangan izinkan ganti/input resi manual,
      // supaya pesanan selesai tidak berubah jadi "HBO" karena salah klik.
      if (order.status === "selesai" || order.shipping_status === "selesai") {
        return NextResponse.json(
          { error: "Pesanan sudah selesai. Nomor resi tidak bisa diubah lagi." },
          { status: 400 }
        );
      }

      const resi = String(awbNo || "").trim();
      if (!resi) {
        return NextResponse.json({ error: "Nomor resi wajib diisi." }, { status: 400 });
      }

      // Nomor resi tidak boleh dipakai pesanan lain (data tersimpan = sumber kebenaran).
      const { data: dipakai } = await supabaseAdmin
        .from("orders")
        .select("order_number")
        .eq("awb_no", resi)
        .neq("id", order.id)
        .limit(1)
        .maybeSingle();
      if (dipakai?.order_number) {
        return NextResponse.json(
          { error: `Nomor resi sudah dipakai pesanan lain (${dipakai.order_number}).` },
          { status: 400 }
        );
      }

      const sudahDikirim = shipped === true;
      // "Sudah dikirim" → status kirim naik sekarang (notif keluar). "Belum dijemput" → hanya
      // resi + penanda menunggu pickup; status pesanan tidak dipaksa maju (mis. masih pending).
      // Resi yang sudah pernah dikirim tidak pernah dimundurkan saat nomornya diedit.
      const sudahJalan = order.status === "dikirim" || order.status === "selesai";
      const nextStatus = sudahDikirim ? (order.status === "selesai" ? "selesai" : "dikirim") : order.status;
      const nextShip = sudahDikirim
        ? "dikirim"
        : sudahJalan || order.shipping_status === "dikirim" || order.shipping_status === "selesai"
          ? order.shipping_status || "dikirim"
          : "menunggu_pickup";

      let packResult: { packed: boolean; warning: boolean } = { packed: false, warning: false };
      try {
        packResult = await packOrderForResi(supabaseAdmin, order.id, packaging, actor);
      } catch (packError) {
        console.error("[ADMIN] packaging manual gagal, resi tetap lanjut:", identifier, packError);
        packResult = { packed: false, warning: true };
      }

      const { error: updateError } = await supabaseAdmin
        .from("orders")
        .update({
          awb_no: resi,
          shipping_method: "J&T HBO",
          status: nextStatus,
          shipping_status: nextShip,
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);

      if (updateError) {
        if (packResult.packed) {
          try {
            await supabaseAdmin.rpc("production_return_order_packaging", {
              p_order_id: order.id,
              p_reason: "Gagal menyimpan resi manual",
              p_actor: actor,
            });
          } catch (returnError) {
            console.error("[ADMIN] retur kemasan saat simpan resi manual gagal:", identifier, returnError);
          }
        }
        console.error("[ADMIN] Gagal simpan resi manual HBO:", identifier, updateError);
        return NextResponse.json({ error: "Gagal menyimpan nomor resi. Coba lagi." }, { status: 500 });
      }

      const justShipped = sudahDikirim && order.status !== "dikirim" && order.status !== "selesai";
      if (justShipped) {
        await notifyShippedOnce(supabaseAdmin, {
          id: order.id,
          order_number: order.order_number,
          customer_name: order.customer_name,
          customer_whatsapp: order.customer_whatsapp,
          awb_no: resi,
        });
        await syncCommissionStatusSafe(supabaseAdmin, order.id);
      }

      console.log("[ADMIN] Resi HBO disimpan:", identifier, resi, sudahDikirim ? "(dikirim)" : "(menunggu pickup)");
      return NextResponse.json({
        success: true,
        awbNo: resi,
        status: nextStatus,
        shippingStatus: nextShip,
        serviceCode: "HBO",
        packagingWarning: packResult.warning,
      });
    }

    // ── "Tandai Dikirim" untuk resi HBO yang sebelumnya "belum dijemput" ──
    if (action === "markShipped") {
      const { data: order, error: fetchError } = await supabaseAdmin
        .from("orders")
        .select("id, order_number, status, awb_no, shipping_status, customer_name, customer_whatsapp")
        .eq("order_number", identifier)
        .single();

      if (fetchError || !order) {
        return NextResponse.json({ error: "Pesanan tidak ditemukan" }, { status: 404 });
      }
      if (!order.awb_no) {
        return NextResponse.json({ error: "Pesanan ini belum punya nomor resi." }, { status: 400 });
      }
      if (order.status === "dibatalkan") {
        return NextResponse.json({ error: "Pesanan sudah dibatalkan." }, { status: 400 });
      }

      const nextStatus = order.status === "selesai" ? "selesai" : "dikirim";
      const { error: updateError } = await supabaseAdmin
        .from("orders")
        .update({
          status: nextStatus,
          shipping_status: "dikirim",
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);

      if (updateError) {
        console.error("[ADMIN] Gagal menandai dikirim:", identifier, updateError);
        return NextResponse.json({ error: "Gagal menandai pesanan dikirim. Coba lagi." }, { status: 500 });
      }

      if (order.status !== "dikirim" && order.status !== "selesai") {
        await notifyShippedOnce(supabaseAdmin, {
          id: order.id,
          order_number: order.order_number,
          customer_name: order.customer_name,
          customer_whatsapp: order.customer_whatsapp,
          awb_no: order.awb_no,
        });
        await syncCommissionStatusSafe(supabaseAdmin, order.id);
      }

      return NextResponse.json({
        success: true,
        awbNo: order.awb_no,
        status: nextStatus,
        shippingStatus: "dikirim",
      });
    }

    // ── Sinkronkan status pengiriman dari tracking J&T (dipicu admin saat "Lacak Paket") ──
    // Logika transisinya sama dengan cron; ini cuma mempercepat saat admin sedang melihat pesanan.
    if (action === "syncTracking") {
      const { data: order, error: fetchError } = await supabaseAdmin
        .from("orders")
        .select(
          "id, order_number, status, shipping_status, awb_no, customer_name, customer_whatsapp, shipped_notified_at"
        )
        .eq("order_number", identifier)
        .single();

      if (fetchError || !order) {
        return NextResponse.json({ error: "Pesanan tidak ditemukan" }, { status: 404 });
      }
      if (!order.awb_no) {
        return NextResponse.json({ error: "Pesanan ini belum punya nomor resi J&T." }, { status: 400 });
      }

      const track = await trackShipment(order.awb_no);
      const result = await applyTrackingToOrder(supabaseAdmin, order, track);
      return NextResponse.json({
        success: true,
        ...result,
        track: track.success ? track.data : null,
        trackError: track.success ? null : track.error || null,
      });
    }

    // Normal status update
    if (!status) {
      return NextResponse.json({ error: "Status wajib diisi" }, { status: 400 });
    }

    // Chip "Ubah Status" di drawer admin: `dibatalkan` harus lewat jalur void resi yang sama,
    // dan pesanan yang sudah punya resi J&T tidak boleh dikembalikan ke `pending` — kombinasi
    // itulah yang dulu meninggalkan pesanan `pending` dengan resi yang masih hidup.
    if (status === "dibatalkan" || status === "pending") {
      const { data: order } = await supabaseAdmin
        .from("orders")
        .select("id, order_number, status, awb_no, jnt_order_id, stock_reserved, customer_name, customer_whatsapp")
        .eq("order_number", identifier)
        .maybeSingle();

      const resi = order?.awb_no || order?.jnt_order_id;

      if (status === "pending" && resi) {
        return NextResponse.json(
          { error: `Pesanan ini sudah punya resi J&T (${resi}). Status tidak bisa dikembalikan ke pending.` },
          { status: 400 }
        );
      }

      if (status === "dibatalkan" && order) {
        const result = await cancelOrderCompletely(order, "Dibatalkan oleh admin");
        if (!result.success) {
          return result.stage === "jnt"
            ? NextResponse.json({ error: `Gagal batalkan J&T: ${result.message}` }, { status: 400 })
            : NextResponse.json({ error: "Gagal memperbarui status pesanan" }, { status: 500 });
        }
        return NextResponse.json({ success: true });
      }
    }

    // Dipakai untuk notifikasi "pembayaran diterima" (pending → diproses): butuh status SEBELUM
    // diubah + kontak customer + total, jadi dibaca dulu.
    const previous = status === "diproses"
      ? (
          await supabaseAdmin
            .from("orders")
            .select("id, status, order_number, customer_name, customer_whatsapp, total, payment_method")
            .eq("order_number", identifier)
            .maybeSingle()
        ).data
      : null;

    const { error } = await supabaseAdmin
      .from("orders")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("order_number", identifier);

    if (error) {
      console.error("[ADMIN] Failed to update order status:", JSON.stringify(error));
      return NextResponse.json({ error: "Gagal memperbarui status pesanan", detail: error.message, code: error.code }, { status: 500 });
    }

    // Pembayaran manual diverifikasi (pending → diproses) → catat lunas + kabari customer.
    // COD dilewati: pembayarannya saat paket diterima, jadi tidak ada "pembayaran diterima".
    // `paid_at is null` di WHERE membuat jalur ini aman walau webhook Mayar berjalan bersamaan.
    if (previous && previous.status === "pending" && !(await isCodOrderPayment(previous.payment_method))) {
      const { data: paidRows } = await supabaseAdmin
        .from("orders")
        .update({ payment_status: "paid", paid_at: new Date().toISOString() })
        .eq("id", previous.id)
        .is("paid_at", null)
        .select("id");

      if (paidRows && paidRows.length > 0 && previous.customer_whatsapp) {
        await sendOnce(previous.id, "paid", "WA pembayaran diterima (verifikasi admin)", () =>
          notifyCustomerOrderPaid({
            orderNumber: previous.order_number || identifier,
            customerName: previous.customer_name || "",
            customerWhatsapp: previous.customer_whatsapp as string,
            total: Number(previous.total) || 0,
          })
        );
      }
    }

    // Komisi affiliate diselaraskan dengan status pesanan (mis. "diproses" = pembayaran
    // terverifikasi). Kegagalan sinkronisasi tidak boleh menggagalkan update status.
    try {
      const { data: affected } = await supabaseAdmin
        .from("orders")
        .select("id")
        .eq("order_number", identifier)
        .maybeSingle();
      if (affected) {
        await syncCommissionStatus(supabaseAdmin, (affected as { id: string }).id, { actor: "admin-status" });
      }
    } catch (e) {
      console.error("[ADMIN] Gagal menyelaraskan komisi affiliate:", e);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[ADMIN] Update order status error:", error?.message, error?.stack);
    return NextResponse.json({ error: "Terjadi kesalahan server", detail: error?.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await isOpsAdmin(request))) return unauthorized();
  try {
    const { orderId, orderNumber } = await request.json();
    const identifier = orderNumber || orderId;
    console.log("[ADMIN] Delete order request:", identifier);

    if (!identifier) {
      return NextResponse.json({ error: "Order ID wajib diisi" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Lookup UUID id from order_number
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("order_number", identifier)
      .single();

    if (!order) {
      return NextResponse.json({ error: "Pesanan tidak ditemukan" }, { status: 404 });
    }

    const uuidId = order.id;

    // Fetch order status + items before deletion for stock restoration
    const { data: fullOrder } = await supabaseAdmin
      .from("orders")
      .select("status, stock_reserved")
      .eq("id", uuidId)
      .single();

    const { data: orderItems } = await supabaseAdmin
      .from("order_items")
      .select("product_id, color, size, quantity")
      .eq("order_id", uuidId);

    // Restore stock for pending orders whose stock was actually decremented. `stock_reserved`
    // memastikan pesanan Open Order (`CYO-`) LAMA — yang dibuat sebelum Open Order ikut memotong
    // stok — tidak ikut dikembalikan (stok hantu). Pesanan `dibatalkan` tidak disentuh di sini:
    // stoknya sudah dikembalikan `cancelOrderCompletely()` saat pembatalan.
    if (orderItems && orderItems.length > 0 && fullOrder?.status === "pending" && fullOrder?.stock_reserved === true) {
      for (const item of orderItems) {
        if (item.product_id && item.color && item.size && item.quantity) {
          await supabaseAdmin.rpc("samaqu_restore_stock", {
            p_product_id: item.product_id,
            p_color: item.color,
            p_size: item.size,
            p_qty: item.quantity,
          });
        }
      }
      console.log("[ADMIN] Stock restored for deleted order:", identifier, "items:", orderItems.length);
    }

    // Delete voucher usages first (foreign key reference)
    const { data: deletedVouchers, error: voucherError } = await supabaseAdmin
      .from("voucher_usages")
      .delete()
      .eq("order_id", uuidId)
      .select();

    console.log("[ADMIN] Voucher usages delete result:", { deleted: deletedVouchers?.length ?? 0, error: voucherError?.message });

    if (voucherError) {
      console.error("[ADMIN] Failed to delete voucher usages:", voucherError);
      return NextResponse.json({ error: "Gagal menghapus data voucher", detail: voucherError.message }, { status: 500 });
    }

    // Delete order items
    const { error: itemsError } = await supabaseAdmin
      .from("order_items")
      .delete()
      .eq("order_id", uuidId);

    if (itemsError) {
      console.error("[ADMIN] Failed to delete order items:", itemsError);
      return NextResponse.json({ error: "Gagal menghapus item pesanan", detail: itemsError.message }, { status: 500 });
    }

    // Delete the order
    const { error: orderError } = await supabaseAdmin
      .from("orders")
      .delete()
      .eq("id", uuidId);

    if (orderError) {
      console.error("[ADMIN] Failed to delete order:", orderError);
      return NextResponse.json({ error: "Gagal menghapus pesanan", detail: orderError.message }, { status: 500 });
    }

    console.log("[ADMIN] Order deleted successfully:", identifier);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[ADMIN] Delete order error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan server", detail: error.message }, { status: 500 });
  }
}
