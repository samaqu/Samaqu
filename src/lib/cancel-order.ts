import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { cancelOrder } from "@/lib/jnt";
import { notifyAdminOrderCancelled, notifyCustomerOrderCancelled } from "@/lib/fonnte";
import { claimOrderNotification } from "@/lib/order-notify";
import { syncCommissionStatus } from "@/lib/affiliate/commission";

/**
 * Satu jalur pembatalan pesanan untuk semua pemanggil: customer (`/api/orders/cancel`),
 * admin (tombol "Batalkan di J&T" dan chip status `dibatalkan` di `/api/admin/orders`),
 * serta cron auto-cancel (`/api/cron/auto-cancel`).
 *
 * Urutannya sengaja begini: resi di-void dulu di J&T, baru status pesanan jadi `dibatalkan`.
 * Kalau J&T menolak, status tidak diubah supaya resi aktif tidak tertinggal di belakang
 * pesanan yang sudah dianggap batal.
 */

export interface CancelableOrder {
  id: string;
  order_number: string;
  status: string;
  awb_no: string | null;
  jnt_order_id: string | null;
  /** Kolom `orders.stock_reserved` — true kalau pesanan ini sudah memotong stok. */
  stock_reserved?: boolean | null;
  /** Dipakai notifikasi pembatalan (WhatsApp customer + admin). */
  customer_name?: string | null;
  customer_whatsapp?: string | null;
}

export type CancelOrderResult =
  | { success: true; voidedJnt: boolean }
  | { success: false; stage: "jnt" | "status"; message: string };

/**
 * Stok dikembalikan hanya untuk pesanan yang MEMANG memotong stok. Penandanya kolom
 * `orders.stock_reserved` — diisi `true` saat checkout website maupun Open Order membuat
 * pesanannya. Dulu penandanya cuma awalan nomor pesanan (`SMQ-`), dan itu tidak lagi cukup
 * sekarang Open Order (`CYO-`) juga memotong stok: pesanan CYO LAMA (dibuat sebelum perubahan
 * ini) tidak pernah memotong stok, jadi kalau dibatalkan stoknya jangan sampai bertambah.
 */
const hasStockReservation = (order: CancelableOrder) => order.stock_reserved === true;

export async function cancelOrderCompletely(
  order: CancelableOrder,
  remark: string
): Promise<CancelOrderResult> {
  const supabase = getSupabaseAdmin();
  const cancelId = order.jnt_order_id || order.awb_no;

  if (cancelId) {
    const result = await cancelOrder({ orderId: cancelId, remark });
    if (!result.success) {
      console.error("[CANCEL] J&T void failed:", order.order_number, result.raw);
      // `desc` J&T cuma berbunyi "Request berhasil" walau ditolaknya di `detail[].reason`,
      // jadi alasan aslinya yang dipakai sebagai pesan error.
      return {
        success: false,
        stage: "jnt",
        message:
          result.raw?.detail?.[0]?.reason ||
          result.raw?.desc ||
          "Gagal membatalkan pengiriman di J&T",
      };
    }
    console.log("[CANCEL] J&T voided:", order.order_number, cancelId);
  }

  if (hasStockReservation(order)) {
    const { data: items } = await supabase
      .from("order_items")
      .select("product_id, product_name, color, size, quantity")
      .eq("order_id", order.id);

    const restored = (items ?? []).filter(
      (item) => item.product_id && item.color && item.size && Number(item.quantity) > 0
    );

    for (const item of restored) {
      await supabase.rpc("samaqu_restore_stock", {
        p_product_id: item.product_id,
        p_color: item.color,
        p_size: item.size,
        p_qty: item.quantity,
      });
    }

    // Pengembalian stok DICATAT sebagai baris "Barang Masuk" (menu Produk → tab Barang Masuk)
    // supaya pergerakan stok terlihat, bukan cuma berubah diam-diam. `source = "batal"`
    // membedakannya dari penerimaan produksi/manual dan `notes` menyebut nomor pesanannya.
    // Kalau pencatatan gagal, pembatalan TETAP dianggap sukses (stok sudah kembali) — hanya
    // dicatat di log server, tidak menggagalkan aksi yang sudah tersimpan.
    if (restored.length > 0) {
      const ids = [...new Set(restored.map((r) => String(r.product_id)))];
      const { data: products } = await supabase.from("products").select("id, name, sku").in("id", ids);
      const byId = new Map((products ?? []).map((p) => [String(p.id), p]));
      // Tanggal WIB (bukan UTC) supaya barisnya tidak jatuh ke tanggal sebelumnya.
      const tanggalWib = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
      const { error: stockInError } = await supabase.from("stock_in").insert(
        restored.map((r) => ({
          date: tanggalWib,
          product_id: r.product_id,
          product_name: byId.get(String(r.product_id))?.name || r.product_name || "",
          sku: byId.get(String(r.product_id))?.sku || "",
          variant_color: r.color,
          variant_size: r.size,
          qty: Number(r.quantity),
          cost_per_unit: 0,
          notes: `Pengembalian stok — pesanan ${order.order_number} dibatalkan`,
          source: "batal",
        }))
      );
      if (stockInError) console.error("[CANCEL] gagal mencatat barang masuk:", order.order_number, stockInError);
    }
  }

  // Packaging hanya dikembalikan kalau pesanan belum dikirim. Setelah dikirim,
  // kemasan dianggap sudah terpakai dan tidak ada retur otomatis.
  if (order.status !== "dikirim" && order.status !== "selesai") {
    try {
      await supabase.rpc("production_return_order_packaging", {
        p_order_id: order.id,
        p_reason: remark,
        p_actor: "cancel-order",
      });
    } catch (e) {
      console.error("[CANCEL] Gagal retur packaging:", order.order_number, e);
    }
  }

  // Tabel `orders` tidak punya trigger yang mengisi jam pembatalan, jadi jamnya ditulis sendiri:
  // linimasa "Pesanan dibatalkan" (strukSteps) membacanya. Dua kolom ditulis — `cancelled_at`
  // (jam batal yang sebenarnya, akurat) dan `updated_at` (dipakai baris lama, lihat `waktuBatal`
  // di src/lib/akun-format.ts).
  //
  // Kolom `cancelled_at` datang dari `supabase/migrations/20261011_order_cancelled_at.sql` yang
  // dijalankan manual di SQL Editor Supabase. Selama SQL itu belum dijalankan, update diulang
  // tanpa kolom tersebut supaya pembatalan tetap jalan — jam batalnya jatuh ke `updated_at`.
  const cancelledAt = new Date().toISOString();
  // Penanda void hanya ditulis kalau resi benar-benar di-void (`cancelId` ada). `awb_no` sengaja
  // TIDAK dikosongkan: nomornya tetap jejak audit, dan yang membedakan resi mati dari resi aktif
  // adalah kolom ini (dipakai guard label di /admin/label/<no-pesanan>).
  type CancelUpdate = {
    status: string;
    updated_at: string;
    cancelled_at?: string;
    jnt_void_status?: string;
    jnt_voided_at?: string;
  };
  const payload: CancelUpdate = {
    status: "dibatalkan",
    updated_at: cancelledAt,
    cancelled_at: cancelledAt,
    ...(cancelId ? { jnt_void_status: "voided", jnt_voided_at: cancelledAt } : {}),
  };

  let { error } = await supabase.from("orders").update(payload).eq("id", order.id);

  // Kolom-kolom baru datang dari SQL yang dijalankan manual di Supabase. Selama belum ada,
  // PostgREST menolak SELURUH update — buang kolom yang disebut pesannya lalu ulangi, supaya
  // pembatalan tetap jalan dan hanya penandanya yang belum tersimpan.
  while (error) {
    const missing = (["jnt_void_status", "jnt_voided_at", "cancelled_at"] as const).find((k) =>
      error!.message.includes(k)
    );
    if (!missing) break;
    console.warn(
      `[CANCEL] orders.${missing} belum ada (SQL-nya belum dijalankan), mengulang tanpa kolom itu:`,
      error.message
    );
    delete payload[missing];
    ({ error } = await supabase.from("orders").update(payload).eq("id", order.id));
  }

  if (error) {
    console.error("[CANCEL] Status update error:", order.order_number, error);
    return { success: false, stage: "status", message: "Gagal memperbarui status pesanan" };
  }

  console.log("[CANCEL] Order cancelled:", order.order_number);

  // Komisi affiliate: pesanan batal → komisi dibatalkan/reversal (audit trail tetap tersimpan).
  // Status pesanan tidak diubah oleh modul ini — hanya baris komisi yang diselaraskan.
  try {
    await syncCommissionStatus(supabase, order.id, { actor: "cancel-order" });
  } catch (e) {
    console.error("[CANCEL] Gagal menyelaraskan komisi affiliate:", e);
  }

  // Notifikasi pembatalan: customer (token Fonnte Customer) dan admin (token Fonnte Admin)
  // dikirim bersamaan dan saling terpisah. Klaim `cancelled_notified_at` memastikan hanya sekali
  // per pesanan, dan kegagalan WhatsApp tidak pernah menggagalkan pembatalan yang sudah tersimpan.
  // Refund tidak dijanjikan di pesan karena status dana tidak tersedia di data pesanan.
  if (await claimOrderNotification(order.id, "cancelled")) {
    await Promise.allSettled([
      notifyCustomerOrderCancelled({
        orderNumber: order.order_number,
        customerName: order.customer_name || "",
        customerWhatsapp: order.customer_whatsapp || "",
        reason: remark,
      }),
      notifyAdminOrderCancelled({
        orderNumber: order.order_number,
        customerName: order.customer_name ?? null,
        reason: remark,
      }),
    ]);
  }

  return { success: true, voidedJnt: !!cancelId };
}
