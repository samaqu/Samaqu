import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";
import { notifyCustomerReturnBilling } from "@/lib/fonnte";

/**
 * Aksi tambahan untuk satu retur:
 *
 *   POST { return_number, action: "track" }   → lacak live AWB pengganti (baca-saja ke J&T)
 *   POST { return_number, action: "history" } → riwayat pemindaian tersimpan
 *   POST { return_number, action: "send_billing" } → kirim WA tagihan/refund (manual, sekali tekan)
 *
 * Dipisah dari `PATCH /api/ops/returns` supaya route inti tidak bertambah besar dan
 * aksi lama tetap persis sama.
 */

const ITEM_LABEL_MAX = 120;

function itemLabel(item: any): string {
  const parts = [item.product_name, item.color && item.color !== "default" ? item.color : null]
    .filter(Boolean)
    .join(" · ");
  return String(parts || "Produk").slice(0, ITEM_LABEL_MAX);
}

function replacementLabel(item: any, productName?: string | null): string {
  const name = productName || item.product_name || "Produk";
  const size = item.replacement_size ? ` ${item.replacement_size}` : "";
  return `${name}${size}`.slice(0, ITEM_LABEL_MAX);
}

export async function POST(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  const admin = getSupabaseAdmin();

  try {
    const body = await req.json().catch(() => ({}));
    const returnNumber = String(body?.return_number || "").trim();
    const action = String(body?.action || "").trim();
    if (!returnNumber) return NextResponse.json({ error: "Nomor retur wajib diisi" }, { status: 400 });

    const { data: record, error } = await admin
      .from("returns")
      .select("*")
      .eq("return_number", returnNumber)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!record) return NextResponse.json({ error: "Retur tidak ditemukan" }, { status: 404 });

    const { data: items } = await admin
      .from("return_items")
      .select("*")
      .eq("return_id", record.id)
      .order("created_at", { ascending: true });
    const itemRows = items || [];

    if (action === "track") {
      const awb = String(record.shipping_out_awb || "").trim();
      if (!awb) return NextResponse.json({ error: "Resi pengganti belum dibuat." }, { status: 400 });

      /**
       * Pakai endpoint lacak yang SAMA dengan drawer Transaksi (`/api/jnt/track`), bukan
       * `trackShipment()` mentah. Endpoint itu sudah menangani: cache, validasi format resi,
       * data kurir/penerima untuk admin, dan fallback ke riwayat tersimpan saat J&T menolak.
       * Memanggil J&T langsung dulu membuat pesan mentah J&T ("Tidak diizinkan") muncul
       * apa adanya tanpa penjelasan.
       */
      try {
        const trackUrl = new URL("/api/jnt/track", req.nextUrl.origin);
        trackUrl.searchParams.set("awb", awb);
        trackUrl.searchParams.set("refresh", "1");
        const trackRes = await fetch(trackUrl, {
          headers: { Authorization: req.headers.get("authorization") || "" },
          cache: "no-store",
        });
        const payload = await trackRes.json().catch(() => null);

        if (!payload) {
          return NextResponse.json({ error: "Gagal mengambil data J&T. Coba lagi." }, { status: 502 });
        }
        // `/api/jnt/track` membalas { success:false, error } (HTTP 200) saat J&T menolak.
        if (payload.success === false) {
          return NextResponse.json({
            awb,
            error: payload.error || "Data pelacakan tidak ditemukan.",
            history: [],
            detail: null,
            return_status: record.status,
          });
        }
        /**
         * Bentuk respons `/api/jnt/track` adalah `{ success: true, data: { detail, history } }`
         * — isinya dibungkus `data`, bukan di akar. Membaca `payload.history` langsung
         * membuat riwayat selalu kosong dan layar menulis "Belum ada pemindaian J&T."
         */
        const tracked = payload.data || {};
        return NextResponse.json({
          awb,
          detail: tracked.detail || null,
          history: tracked.history || [],
          return_status: record.status,
        });
      } catch (err) {
        console.error("[OPS] returns track:", err);
        return NextResponse.json({ awb, error: "Gagal menghubungi layanan J&T.", history: [] });
      }
    }

    if (action === "history") {
      const awb = String(record.shipping_out_awb || "").trim();
      const { data: events, error: eventError } = await admin
        .from("return_tracking_events")
        .select("code, description, city, occurred_at")
        .eq("return_id", record.id)
        .order("occurred_at", { ascending: false })
        .limit(100);
      if (eventError) {
        // Tabel belum ada -> jangan gagalkan halaman, cukup kosong.
        if (eventError.code === "42P01" || eventError.code === "42703") {
          return NextResponse.json({ awb, events: [] });
        }
        return NextResponse.json({ error: eventError.message }, { status: 500 });
      }
      return NextResponse.json({ awb, events: events || [] });
    }

    if (action === "send_billing") {
      if (record.billing_status === "lunas") {
        return NextResponse.json({ error: "Tagihan retur ini sudah ditandai lunas." }, { status: 400 });
      }
      const total = Number(record.total_tagihan) || 0;
      if (!total) {
        return NextResponse.json(
          { error: "Retur ini tidak punya tagihan (selisih harga dan ongkir 0)." },
          { status: 400 },
        );
      }
      const whatsapp = String(record.customer_whatsapp || "").trim();
      if (!whatsapp) {
        return NextResponse.json({ error: "Nomor WhatsApp pelanggan belum diisi." }, { status: 400 });
      }

      const first = itemRows[0];
      if (!first) return NextResponse.json({ error: "Retur tidak punya item." }, { status: 400 });

      // Nama produk pengganti (kalau tukar series) diambil sekali untuk label pesan.
      let replacementProductName: string | null = null;
      if (first.replacement_product_id) {
        const { data: product } = await admin
          .from("products")
          .select("name")
          .eq("id", first.replacement_product_id)
          .maybeSingle();
        replacementProductName = product?.name || null;
      }

      const originalItem = `${itemLabel(first)} ${first.size || ""}`.trim();
      const sent = await notifyCustomerReturnBilling({
        returnNumber: String(record.return_number),
        customerName: record.customer_name,
        customerWhatsapp: whatsapp,
        orderNumber: record.order_number,
        originalItem,
        replacementItem: replacementLabel(first, replacementProductName),
        priceDifference: Number(record.price_difference_total) || 0,
        shippingCost: Number(record.shipping_out_cost) || 0,
        total,
      });

      if (!sent) {
        return NextResponse.json({ error: "Gagal mengirim WhatsApp. Cek konfigurasi Fonnte." }, { status: 502 });
      }
      return NextResponse.json({ sent: true, total });
    }

    return NextResponse.json({ error: "Aksi retur tidak dikenal" }, { status: 400 });
  } catch (error) {
    console.error("[OPS] returns action:", error);
    return NextResponse.json({ error: "Gagal memproses aksi retur" }, { status: 500 });
  }
}
