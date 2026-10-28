import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, opsActorEmail, unauthorized } from "@/lib/ops-auth";

/**
 * Retur & Tukar Size.
 *
 *   GET  /api/ops/returns                        → daftar (filter type/status/q)
 *   GET  /api/ops/returns?return_number=TKR-…    → satu retur + item
 *   POST /api/ops/returns                        → ajukan retur
 *   PATCH /api/ops/returns                       → approve/reject/receive/complete/cancel/update
 *
 * Stok TIDAK disentuh saat pengajuan. Pergerakan stok baru terjadi saat aksi `receive`
 * lewat RPC `samaqu_apply_return_stock` (atomik + idempoten), dan dibalik lewat
 * `samaqu_reverse_return_stock` saat dibatalkan.
 */

const TYPE = ["tukar_size", "return"];
const STATUSES = ["diajukan", "disetujui", "barang_diterima", "pengganti_dikirim", "selesai", "ditolak", "dibatalkan"];

type Admin = ReturnType<typeof getSupabaseAdmin>;

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function wibDateKey() {
  const d = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

async function newReturnNumber(admin: Admin) {
  const prefix = `RTS-${wibDateKey()}-`;
  const { data } = await admin
    .from("returns")
    .select("return_number")
    .like("return_number", `${prefix}%`)
    .order("return_number", { ascending: false })
    .limit(1);
  const last = String(data?.[0]?.return_number || "");
  const lastSeq = Number(last.slice(prefix.length)) || 0;
  return `${prefix}${String(lastSeq + 1).padStart(4, "0")}`;
}

async function itemsOf(admin: Admin, ids: string[]) {
  if (ids.length === 0) return {} as Record<string, any[]>;
  const { data } = await admin
    .from("return_items")
    .select("*")
    .in("return_id", ids)
    .order("created_at", { ascending: true });
  const grouped: Record<string, any[]> = {};
  for (const item of data || []) {
    (grouped[item.return_id] ||= []).push(item);
  }
  return grouped;
}

async function detail(admin: Admin, returnNumber: string) {
  const { data: record, error } = await admin
    .from("returns")
    .select("*")
    .eq("return_number", returnNumber)
    .maybeSingle();
  if (error) return { error: error.message, status: 500 as const };
  if (!record) return { error: "Retur tidak ditemukan", status: 404 as const };
  const id = String(record.id);
  const grouped = await itemsOf(admin, [id]);
  return { record: { ...record, items: grouped[id] || [] } };
}

export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  const admin = getSupabaseAdmin();
  const sp = new URL(req.url).searchParams;
  const returnNumber = String(sp.get("return_number") || "").trim();

  try {
    if (returnNumber) {
      const result = await detail(admin, returnNumber);
      if ("error" in result) return bad(String(result.error || "Retur tidak ditemukan"), Number(result.status) || 500);
      return NextResponse.json({ item: result.record });
    }

    const type = String(sp.get("type") || "").trim();
    const status = String(sp.get("status") || "").trim();
    const q = String(sp.get("q") || "").trim().toLowerCase();
    const limitRaw = Number(sp.get("limit") || 300);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 1000) : 300;

    let query = admin.from("returns").select("*").order("created_at", { ascending: false }).limit(limit);
    if (TYPE.includes(type)) query = query.eq("type", type);
    if (STATUSES.includes(status)) query = query.eq("status", status);

    const { data: rows, error } = await query;
    if (error) return bad(error.message, 500);

    const filtered = q
      ? (rows || []).filter((row) =>
          [row.return_number, row.order_number, row.customer_name, row.customer_whatsapp]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(q)),
        )
      : rows || [];

    const grouped = await itemsOf(admin, filtered.map((row) => row.id));
    return NextResponse.json({
      items: filtered.map((row) => ({ ...row, items: grouped[row.id] || [] })),
    });
  } catch (error) {
    console.error("[OPS] returns GET:", error);
    return bad("Gagal mengambil data retur", 500);
  }
}

export async function POST(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  const admin = getSupabaseAdmin();

  try {
    const body = await req.json().catch(() => ({}));
    const type = String(body?.type || "").trim();
    const orderNumber = String(body?.order_number || "").trim();
    const manual = body?.manual === true;
    const inputItems = Array.isArray(body?.items) ? body.items : [];
    const manualCustomerName = String(body?.customer_name || "").trim();
    const manualCustomerWhatsapp = String(body?.customer_whatsapp || "").trim();
    const manualAddress = String(body?.shipping_address || "").trim();
    const manualCity = String(body?.shipping_city || "").trim();
    const manualKecamatan = String(body?.shipping_kecamatan || "").trim();
    const manualPostal = String(body?.shipping_postal_code || "").trim();

    if (!TYPE.includes(type)) return bad("Jenis retur tidak valid");
    if (!orderNumber && !manual) return bad("Nomor pesanan wajib diisi");

    /**
     * Nomor pesanan harus nomor, bukan blok identitas. Tanpa penjagaan ini, teks bebas
     * (nama + alamat + WA) pernah tersimpan apa adanya di `returns.order_number` dan
     * muncul di kolom "Pesanan" daftar retur.
     */
    const ORDER_NUMBER_MAX = 40;
    /** Nomor pesanan/referensi: tanpa spasi, tanpa titik dua, tanpa teks alamat. */
    const ORDER_NUMBER_RE = /^[A-Za-z0-9#][A-Za-z0-9._/#-]*$/;
    if (orderNumber) {
      if (orderNumber.length > ORDER_NUMBER_MAX) {
        return bad(`Nomor pesanan maksimal ${ORDER_NUMBER_MAX} karakter. Tempel nomor pesanan saja (mis. SMQ-20261028-1234), bukan nama/alamat.`);
      }
      if (!ORDER_NUMBER_RE.test(orderNumber)) {
        return bad("Nomor pesanan hanya boleh berisi huruf, angka, dan tanda - . _ / — bukan spasi, titik dua, atau teks alamat.");
      }
    }

    if (inputItems.length === 0) return bad("Pilih minimal satu produk");
    if (manual && !manualCustomerName) {
      return bad("Nama pelanggan wajib diisi");
    }

    let order: any = null;
    if (!manual) {
      const { data, error: orderError } = await admin
        .from("orders")
        .select("id, order_number, customer_id, customer_name, customer_whatsapp, status, order_items(*)")
        .eq("order_number", orderNumber)
        .maybeSingle();
      if (orderError) return bad(orderError.message, 500);
      if (!data) return bad("Pesanan tidak ditemukan", 404);
      if (data.status === "dibatalkan") return bad("Pesanan yang dibatalkan tidak bisa diretur");
      order = data;
    }

    const rows: Record<string, unknown>[] = [];

    if (order) {
      const orderItems = new Map((order.order_items || []).map((item: any) => [item.id, item]));

      for (const raw of inputItems) {
        const orderItem = orderItems.get(String(raw?.order_item_id || "")) as any;
        if (!orderItem) return bad("Item pesanan tidak cocok dengan pesanan ini");

        const qty = Math.max(1, Math.min(Number(raw?.qty) || 1, Number(orderItem.quantity) || 1));
        const condition = raw?.condition === "damaged" ? "damaged" : "sellable";
        const replacementSize =
          type === "tukar_size" ? String(raw?.replacement_size || "").trim().toUpperCase() : null;
        let replacementPrice = 0;

        if (type === "tukar_size") {
          if (!replacementSize) return bad(`Ukuran pengganti untuk ${orderItem.product_name} wajib dipilih`);
          if (replacementSize === String(orderItem.size || "").toUpperCase()) {
            return bad(`Ukuran pengganti ${orderItem.product_name} harus berbeda dari ukuran asal`);
          }
          const { data: variant } = await admin
            .from("product_variants")
            .select("stock, price_override")
            .eq("product_id", orderItem.product_id)
            .eq("color", orderItem.color || "default")
            .eq("size", replacementSize)
            .maybeSingle();
          if (!variant) return bad(`Ukuran ${replacementSize} tidak tersedia untuk ${orderItem.product_name}`);
          const { data: productRow } = await admin
            .from("products")
            .select("price")
            .eq("id", orderItem.product_id)
            .maybeSingle();
          replacementPrice = Number(variant.price_override) || Number(productRow?.price) || 0;
          // Harga manual dari form (mis. Tukar Size untuk order CYP/custom) menang atas
          // harga katalog. Kosong/0 = pakai katalog.
          const manualReplacement = Math.max(0, Math.round(Number(raw?.replacement_price) || 0));
          if (manualReplacement > 0) replacementPrice = manualReplacement;
          // Kecukupan stok dicek atomik oleh `samaqu_apply_return_stock` (menghormati stok
          // bersama ala series). Pengecekan `stock` mentah di sini bisa salah untuk series turunan.
        }

        const originalPrice = Number(orderItem.price) || 0;
        rows.push({
          order_item_id: orderItem.id,
          product_id: orderItem.product_id,
          product_name: orderItem.product_name,
          color: orderItem.color || "default",
          size: String(orderItem.size || ""),
          replacement_size: replacementSize,
          replacement_price: type === "tukar_size" ? replacementPrice : 0,
          price_difference: type === "tukar_size" ? (replacementPrice - originalPrice) * qty : 0,
          qty,
          price: originalPrice,
          condition,
        });
      }
    } else {
      const productIds = [
        ...new Set(inputItems.map((raw: any) => String(raw?.product_id || "").trim()).filter(Boolean)),
      ];
      if (productIds.length === 0) return bad("Produk wajib dipilih");

      const [{ data: products, error: productError }, { data: variantRows, error: variantError }] = await Promise.all([
        admin.from("products").select("id, name, price").in("id", productIds),
        admin.from("product_variants").select("product_id, color, size, price_override").in("product_id", productIds),
      ]);
      if (productError) return bad(productError.message, 500);
      if (variantError) return bad(variantError.message, 500);

      const productMap = new Map((products || []).map((product: any) => [String(product.id), product]));
      const variantMap = new Map(
        (variantRows || []).map((variant: any) => [
          `${variant.product_id}||${variant.color || "default"}||${String(variant.size || "").toUpperCase()}`,
          variant,
        ]),
      );

      for (const raw of inputItems) {
        const productId = String(raw?.product_id || "").trim();
        const product = productMap.get(productId) as any;
        if (!product) return bad("Produk tidak ditemukan");

        const color = String(raw?.color || "default").trim() || "default";
        const size = String(raw?.size || "").trim().toUpperCase();
        if (!size) return bad(`Ukuran asal ${product.name} wajib dipilih`);

        const variant = variantMap.get(`${productId}||${color}||${size}`) as any;
        if (!variant) return bad(`Ukuran ${size} tidak tersedia untuk ${product.name}`);

        const qty = Math.max(1, Math.min(Number(raw?.qty) || 1, 999));
        const condition = raw?.condition === "damaged" ? "damaged" : "sellable";
        const replacementSize =
          type === "tukar_size" ? String(raw?.replacement_size || "").trim().toUpperCase() : null;
        let replacementVariant: any = null;

        if (type === "tukar_size") {
          if (!replacementSize) return bad(`Ukuran pengganti untuk ${product.name} wajib dipilih`);
          if (replacementSize === size) {
            return bad(`Ukuran pengganti ${product.name} harus berbeda dari ukuran asal`);
          }
          replacementVariant = variantMap.get(`${productId}||${color}||${replacementSize}`);
          if (!replacementVariant) {
            return bad(`Ukuran ${replacementSize} tidak tersedia untuk ${product.name}`);
          }
        }

        const catalogOriginal = Number(variant.price_override) || Number(product.price) || 0;
        const catalogReplacement = replacementVariant
          ? Number(replacementVariant.price_override) || Number(product.price) || 0
          : 0;
        // Harga manual untuk pesanan manual/CYP. Kosong/0 = pakai katalog.
        const manualOriginal = Math.max(0, Math.round(Number(raw?.price) || 0));
        const manualReplacement = Math.max(0, Math.round(Number(raw?.replacement_price) || 0));
        const originalPrice = manualOriginal > 0 ? manualOriginal : catalogOriginal;
        const replacementPrice = manualReplacement > 0 ? manualReplacement : catalogReplacement;
        rows.push({
          order_item_id: null,
          product_id: productId,
          product_name: product.name,
          color,
          size,
          replacement_size: replacementSize,
          replacement_price: type === "tukar_size" ? replacementPrice : 0,
          price_difference: type === "tukar_size" ? (replacementPrice - originalPrice) * qty : 0,
          qty,
          price: originalPrice,
          condition,
        });
      }
    }

    const priceDifferenceTotal = rows.reduce(
      (sum, row) => sum + (Number(row.price_difference) || 0),
      0,
    );

    const createdBy = await opsActorEmail(req);
    let record: any = null;
    let lastError: any = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const generatedNumber = await newReturnNumber(admin);
      const { data, error } = await admin
        .from("returns")
        .insert({
          return_number: generatedNumber,
          type,
          status: "diajukan",
          order_id: order?.id || null,
          order_number: order?.order_number || orderNumber || generatedNumber,
          customer_id: order?.customer_id || null,
          customer_name: order?.customer_name || manualCustomerName || "-",
          customer_whatsapp: order?.customer_whatsapp || manualCustomerWhatsapp || null,
          ...(manual && (manualAddress || manualCity || manualKecamatan || manualPostal)
            ? {
                shipping_address: manualAddress || null,
                shipping_city: manualCity || null,
                shipping_kecamatan: manualKecamatan || null,
                shipping_postal_code: manualPostal || null,
              }
            : {}),
          reason: String(body?.reason || "").trim() || null,
          notes: String(body?.notes || "").trim() || null,
          shipping_in_cost: Math.max(0, Math.round(Number(body?.shipping_in_cost) || 0)),
          shipping_out_cost: Math.max(0, Math.round(Number(body?.shipping_out_cost) || 0)),
          shipping_payment_status: body?.shipping_payment_status === "paid" ? "paid" : "unpaid",
          refund_amount: Math.max(0, Math.round(Number(body?.refund_amount) || 0)),
          refund_method: String(body?.refund_method || "").trim() || null,
          price_difference_total: priceDifferenceTotal,
          price_difference_status: "unpaid",
          created_by: createdBy,
        })
        .select("*")
        .single();
      if (!error) {
        record = data;
        break;
      }
      lastError = error;
      if (error.code !== "23505") break;
    }
    if (!record) {
      if (lastError?.code === "42703" || /shipping_(address|city|kecamatan|postal_code)/i.test(String(lastError?.message || ""))) {
        return bad(
          "Kolom alamat retur manual belum ada. Jalankan supabase/migrations/20261018_returns_manual.sql dulu.",
          500,
        );
      }
      return bad(lastError?.message || "Gagal menyimpan retur", 500);
    }

    const { data: insertedItems, error: itemError } = await admin
      .from("return_items")
      .insert(rows.map((row) => ({ ...row, return_id: record.id })))
      .select("*");
    if (itemError) {
      await admin.from("returns").delete().eq("id", record.id);
      return bad(itemError.message, 500);
    }

    return NextResponse.json({ item: { ...record, items: insertedItems || [] } }, { status: 201 });
  } catch (error) {
    console.error("[OPS] returns POST:", error);
    return bad("Gagal membuat retur", 500);
  }
}

/**
 * Hapus permanen retur (khusus koreksi/reset data uji).
 * Stok yang sudah diterapkan dibalik dulu lewat RPC yang sama, lalu baris ledger
 * (`stock_movements`, `stock_in`) dan record retur dihapus. `return_items` ikut cascade.
 */
export async function DELETE(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  const admin = getSupabaseAdmin();

  try {
    const sp = new URL(req.url).searchParams;
    const returnNumber = String(sp.get("return_number") || "").trim();
    if (!returnNumber) return bad("Nomor retur wajib diisi");

    const { data: record, error } = await admin
      .from("returns")
      .select("id, return_number, stock_applied_at, stock_reversed_at")
      .eq("return_number", returnNumber)
      .maybeSingle();
    if (error) return bad(error.message, 500);
    if (!record) return bad("Retur tidak ditemukan", 404);

    if (record.stock_applied_at && !record.stock_reversed_at) {
      const { error: reverseError } = await admin.rpc("samaqu_reverse_return_stock", {
        p_return_id: String(record.id),
      });
      if (reverseError) {
        return bad(reverseError.message || "Gagal membalik stok retur; data belum dihapus", 400);
      }
    }

    const refId = String(record.id);
    const { error: movementError } = await admin
      .from("stock_movements")
      .delete()
      .eq("ref_type", "return")
      .eq("ref_id", refId);
    if (movementError) return bad(movementError.message, 500);

    const { error: stockInError } = await admin.from("stock_in").delete().eq("ref_return_id", refId);
    if (stockInError) return bad(stockInError.message, 500);

    const { error: deleteError } = await admin.from("returns").delete().eq("id", refId);
    if (deleteError) return bad(deleteError.message, 500);

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("[OPS] returns DELETE:", error);
    return bad("Gagal menghapus retur", 500);
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  const admin = getSupabaseAdmin();

  try {
    const body = await req.json().catch(() => ({}));
    const returnNumber = String(body?.return_number || "").trim();
    const action = String(body?.action || "").trim();
    if (!returnNumber) return bad("Nomor retur wajib diisi");

    const current = await detail(admin, returnNumber);
    if ("error" in current) return bad(String(current.error || "Retur tidak ditemukan"), Number(current.status) || 500);
    const record = current.record;

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const now = new Date().toISOString();

    if (action === "update") {
      if (["selesai", "dibatalkan"].includes(record.status)) return bad("Retur yang sudah final tidak bisa diubah");
      if (body?.reason !== undefined) patch.reason = String(body.reason || "").trim() || null;
      if (body?.notes !== undefined) patch.notes = String(body.notes || "").trim() || null;
      if (body?.shipping_in_awb !== undefined) patch.shipping_in_awb = String(body.shipping_in_awb || "").trim() || null;
      if (body?.shipping_address !== undefined) patch.shipping_address = String(body.shipping_address || "").trim() || null;
      if (body?.shipping_city !== undefined) patch.shipping_city = String(body.shipping_city || "").trim() || null;
      if (body?.shipping_kecamatan !== undefined) patch.shipping_kecamatan = String(body.shipping_kecamatan || "").trim() || null;
      if (body?.shipping_postal_code !== undefined) patch.shipping_postal_code = String(body.shipping_postal_code || "").trim() || null;
      if (body?.shipping_in_cost !== undefined) patch.shipping_in_cost = Math.max(0, Math.round(Number(body.shipping_in_cost) || 0));
      if (body?.shipping_out_cost !== undefined) patch.shipping_out_cost = Math.max(0, Math.round(Number(body.shipping_out_cost) || 0));
      if (body?.shipping_payment_status !== undefined) {
        patch.shipping_payment_status = body.shipping_payment_status === "paid" ? "paid" : "unpaid";
      }
      if (body?.refund_amount !== undefined) patch.refund_amount = Math.max(0, Math.round(Number(body.refund_amount) || 0));
      if (body?.refund_method !== undefined) patch.refund_method = String(body.refund_method || "").trim() || null;
      if (body?.refund_status !== undefined) patch.refund_status = String(body.refund_status || "").trim() || null;
    } else if (action === "approve") {
      if (record.status !== "diajukan") return bad("Hanya retur berstatus diajukan yang bisa disetujui");
      patch.status = "disetujui";
      patch.approved_at = now;
    } else if (action === "reject") {
      if (record.status !== "diajukan") return bad("Hanya retur berstatus diajukan yang bisa ditolak");
      patch.status = "ditolak";
      patch.cancelled_at = now;
    } else if (action === "receive") {
      if (record.status !== "disetujui") return bad("Setujui retur dulu sebelum menerima barang");
      const { error } = await admin.rpc("samaqu_apply_return_stock", { p_return_id: String(record.id) });
      if (error) return bad(error.message || "Gagal menerapkan pergerakan stok", 400);
      patch.status = "barang_diterima";
      patch.received_at = now;
    } else if (action === "complete") {
      if (!["barang_diterima", "pengganti_dikirim"].includes(record.status)) {
        return bad("Status retur belum siap diselesaikan");
      }
      if (record.type === "tukar_size" && !record.shipping_out_awb) {
        return bad("Buat resi pengganti dulu sebelum menyelesaikan tukar size");
      }
      patch.status = "selesai";
      patch.completed_at = now;
      // Refund TIDAK otomatis dianggap selesai saat retur selesai.
      // Admin menandai lewat aksi `settle_refund` setelah uang benar-benar keluar.
    } else if (action === "settle_refund") {
      if (record.type !== "return") return bad("Aksi refund hanya untuk retur Return");
      if (record.status === "dibatalkan" || record.status === "ditolak") {
        return bad("Retur yang sudah final tidak bisa direfund");
      }
      if (!Number(record.refund_amount)) return bad("Nominal refund belum diisi");
      patch.refund_status = "selesai";
      patch.refund_settled_at = now;
    } else if (action === "cancel") {
      if (record.status === "selesai") return bad("Retur yang sudah selesai tidak bisa dibatalkan");
      if (record.stock_applied_at) {
        const { error } = await admin.rpc("samaqu_reverse_return_stock", { p_return_id: String(record.id) });
        if (error) return bad(error.message || "Gagal membalik pergerakan stok", 400);
      }
      patch.status = "dibatalkan";
      patch.cancelled_at = now;
    } else if (action === "settle_difference") {
      if (record.type !== "tukar_size") return bad("Selisih harga hanya untuk Tukar Size");
      if (record.status === "dibatalkan") return bad("Retur yang dibatalkan tidak punya selisih");
      if (!Number(record.price_difference_total)) return bad("Tidak ada selisih harga");
      patch.price_difference_status = "settled";
      patch.price_difference_settled_at = now;
      patch.price_difference_method = String(body?.method || "").trim() || null;
    } else {
      return bad("Aksi retur tidak dikenal");
    }

    const { data: updated, error } = await admin
      .from("returns")
      .update(patch)
      .eq("id", record.id)
      .select("*")
      .single();
    if (error) {
      if (error.code === "42703" || /shipping_(address|city|kecamatan|postal_code)/i.test(String(error.message || ""))) {
        return bad(
          "Kolom alamat retur manual belum ada. Jalankan supabase/migrations/20261018_returns_manual.sql dulu.",
          500,
        );
      }
      return bad(error.message, 500);
    }

    return NextResponse.json({ item: { ...updated, items: record.items } });
  } catch (error) {
    console.error("[OPS] returns PATCH:", error);
    return bad("Gagal memperbarui retur", 500);
  }
}
