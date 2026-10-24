import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { cancelOrderCompletely } from "@/lib/cancel-order";

/**
 * POST /api/orders/cancel — customer membatalkan pesanannya sendiri dari halaman
 * /akun/pesanan/<order>. Body: { orderNumber }.
 *
 * Pembatalannya memakai jalur bersama `cancelOrderCompletely()` (sama seperti admin dan cron
 * auto-cancel): resi di-void dulu di J&T, baru status pesanan jadi `dibatalkan` — kalau J&T
 * menolak, status tidak diubah supaya resi tidak menggantung. Bedanya: route ini memverifikasi
 * sesi customer dan memastikan pesanan itu memang miliknya.
 *
 * Stok dikembalikan hanya untuk pesanan yang MEMANG memotong stok — penandanya kolom
 * `orders.stock_reserved`, bukan awalan nomor pesanan. Checkout website (`SMQ-`) maupun
 * Open Order (`CYO-`) sama-sama memotong stok saat pesanan dibuat, jadi keduanya
 * mengembalikan stok saat dibatalkan; pesanan lama yang belum menandai kolom itu dilewati
 * supaya stoknya tidak bertambah tanpa pernah diambil (lihat src/lib/cancel-order.ts).
 */

/** Status yang masih boleh dibatalkan customer (belum diserahkan ke kurir). */
const CANCELLABLE_STATUS = ["pending", "diproses"];

export async function POST(request: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    const { data: authData, error: authError } = token
      ? await supabaseAdmin.auth.getUser(token)
      : { data: { user: null }, error: null };
    const customerId = authData?.user?.id ?? null;
    if (authError || !customerId) {
      return NextResponse.json({ error: "Silakan masuk dulu untuk membatalkan pesanan." }, { status: 401 });
    }

    const body = await request.json();
    const orderNumber = String(body.orderNumber ?? "").trim();
    if (!orderNumber) {
      return NextResponse.json({ error: "Nomor pesanan wajib diisi" }, { status: 400 });
    }

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, order_number, status, awb_no, jnt_order_id, customer_id, stock_reserved, customer_name, customer_whatsapp")
      .eq("order_number", orderNumber)
      .maybeSingle();

    // Pesanan milik orang lain dibalas 404, bukan 403 — supaya keberadaannya tidak bocor.
    if (!order || order.customer_id !== customerId) {
      return NextResponse.json({ error: "Pesanan tidak ditemukan" }, { status: 404 });
    }

    if (order.status === "dibatalkan") {
      return NextResponse.json({ error: "Pesanan ini sudah dibatalkan" }, { status: 400 });
    }

    if (!CANCELLABLE_STATUS.includes(order.status)) {
      return NextResponse.json(
        { error: "Pesanan sudah diserahkan ke kurir, jadi tidak bisa dibatalkan sendiri. Hubungi admin ya." },
        { status: 400 }
      );
    }

    // Jalur pembatalan bersama (src/lib/cancel-order.ts): void resi J&T dulu → stok website
    // dikembalikan → status `dibatalkan` + jam pembatalannya.
    const result = await cancelOrderCompletely(order, "Dibatalkan oleh customer");

    if (!result.success) {
      if (result.stage === "jnt") {
        return NextResponse.json({ error: "Gagal membatalkan pengiriman di J&T. Coba lagi ya." }, { status: 400 });
      }
      return NextResponse.json({ error: "Gagal memperbarui status pesanan" }, { status: 500 });
    }

    console.log("[ORDER-CANCEL] Cancelled by customer:", orderNumber);
    return NextResponse.json({ success: true, packagingWarning: Boolean(result.packagingWarning) });
  } catch (error) {
    console.error("[ORDER-CANCEL] Failed:", error);
    return NextResponse.json({ error: "Terjadi kesalahan server" }, { status: 500 });
  }
}
