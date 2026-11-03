import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";
import { createJntOrderForOrder } from "@/lib/jnt/order-from-order";

/**
 * Buat resi pengganti (SAMAQU → customer) untuk Tukar Size.
 *
 * Hanya setelah barang lama diterima (`barang_diterima`) supaya stok pengganti sudah
 * terpotong dan tidak ada resi yang terbit untuk paket yang stoknya belum tersedia.
 * Resi memakai jalur J&T yang sama dengan pesanan (`createJntOrderForOrder`), tapi
 * nomor ordernya memakai nomor retur supaya tidak menabrak pesanan asli.
 */
export async function POST(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  const admin = getSupabaseAdmin();

  try {
    const body = await req.json().catch(() => ({}));
    const returnNumber = String(body?.return_number || "").trim();
    if (!returnNumber) return NextResponse.json({ error: "Nomor retur wajib diisi" }, { status: 400 });

    const { data: record, error } = await admin
      .from("returns")
      .select("*")
      .eq("return_number", returnNumber)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!record) return NextResponse.json({ error: "Retur tidak ditemukan" }, { status: 404 });

    if (record.type !== "tukar_size") {
      return NextResponse.json({ error: "Resi pengganti hanya untuk Tukar Size" }, { status: 400 });
    }
    if (record.status === "dibatalkan" || record.status === "ditolak") {
      return NextResponse.json({ error: "Retur sudah final" }, { status: 400 });
    }
    if (record.shipping_out_awb) {
      return NextResponse.json({ error: `Resi pengganti sudah dibuat (${record.shipping_out_awb})` }, { status: 400 });
    }
    if (record.status !== "barang_diterima") {
      return NextResponse.json(
        { error: "Tandai barang lama diterima dulu (stok pengganti ikut dipotong saat itu)" },
        { status: 400 },
      );
    }

    const { data: items, error: itemError } = await admin
      .from("return_items")
      .select("*")
      .eq("return_id", record.id);
    if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 });
    if (!items || items.length === 0) {
      return NextResponse.json({ error: "Retur tidak punya item" }, { status: 400 });
    }

    const { data: order, error: orderError } = await admin
      .from("orders")
      .select(
        "order_number, customer_name, customer_whatsapp, shipping_address, shipping_city, shipping_kecamatan, shipping_postal_code",
      )
      .eq("order_number", record.order_number)
      .maybeSingle();
    if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 });

    // Retur manual tidak punya baris `orders`; alamat disimpan di record retur.
    const recipient = order || {
      customer_name: record.customer_name,
      customer_whatsapp: record.customer_whatsapp,
      shipping_address: record.shipping_address,
      shipping_city: record.shipping_city,
      shipping_kecamatan: record.shipping_kecamatan,
      shipping_postal_code: record.shipping_postal_code,
    };
    if (!recipient.shipping_address) {
      return NextResponse.json(
        { error: "Alamat pengganti belum diisi. Untuk retur manual, lengkapi alamat saat mengajukan." },
        { status: 400 },
      );
    }

    /**
     * Resi yang dicetak/discan adalah barang PENGGANTI. Kalau tukar series, produknya
     * berbeda dari produk asal — memakai `item.product_id` akan mencetak produk yang salah
     * di label. Kosong = tukar ukuran (perilaku lama, produk sama).
     */
    const replacementProductIds = [
      ...new Set(
        items
          .map((item: any) => String(item.replacement_product_id || "").trim())
          .filter(Boolean),
      ),
    ];
    const replacementProductNames = new Map<string, string>();
    if (replacementProductIds.length > 0) {
      const { data: productRows } = await admin
        .from("products")
        .select("id, name")
        .in("id", replacementProductIds);
      for (const row of productRows || []) {
        replacementProductNames.set(String(row.id), String(row.name || ""));
      }
    }

    const jntItems = items.map((item: any) => {
      const replacementProductId = String(item.replacement_product_id || "").trim();
      return {
        product_id: replacementProductId || item.product_id,
        product_name:
          (replacementProductId ? replacementProductNames.get(replacementProductId) : null) ||
          item.product_name,
        color: (replacementProductId ? item.replacement_color : item.color) || "default",
        size: item.replacement_size,
        quantity: Number(item.qty) || 1,
      };
    });
    if (jntItems.some((item) => !item.size)) {
      return NextResponse.json({ error: "Ukuran pengganti belum lengkap" }, { status: 400 });
    }

    const result = await createJntOrderForOrder({
      order_number: record.return_number,
      customer_name: recipient.customer_name,
      customer_whatsapp: recipient.customer_whatsapp,
      shipping_address: recipient.shipping_address,
      shipping_city: recipient.shipping_city,
      shipping_kecamatan: recipient.shipping_kecamatan,
      shipping_postal_code: recipient.shipping_postal_code,
      // Nilai barang untuk payload J&T (bukan tagihan ke customer).
      total: items.reduce((sum: number, item: any) => sum + (Number(item.price) || 0) * (Number(item.qty) || 0), 0),
      weight: null,
      // Bukan COD: pengganti tidak menagih apa pun ke customer.
      payment_method: "bank",
      shipping_cost: Number(record.shipping_out_cost) || 0,
      order_items: jntItems,
    });

    if (!result.success || !result.awbNo) {
      return NextResponse.json({ error: result.error || "J&T menolak pembuatan resi" }, { status: 400 });
    }

    const { data: updated, error: updateError } = await admin
      .from("returns")
      .update({
        shipping_out_awb: result.awbNo,
        jnt_order_id: record.return_number,
        status: "pengganti_dikirim",
        updated_at: new Date().toISOString(),
      })
      .eq("id", record.id)
      .select("*")
      .single();
    if (updateError) {
      return NextResponse.json(
        { error: `Resi terbit (${result.awbNo}) tetapi gagal disimpan. Coba cek J&T dulu.` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      item: { ...updated, items },
      awbNo: result.awbNo,
      weightGrams: result.weightGrams,
    });
  } catch (error) {
    console.error("[OPS] returns resi:", error);
    return NextResponse.json({ error: "Gagal membuat resi pengganti" }, { status: 500 });
  }
}
