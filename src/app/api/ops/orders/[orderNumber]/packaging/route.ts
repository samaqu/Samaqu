import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, opsIdentity, unauthorized } from "@/lib/ops-auth";
import { computeOrderPackaging } from "@/lib/produksi-order-hpp";
import { isCoverHangerKategori } from "@/lib/item-label";

async function orderHasCoverProduct(admin: ReturnType<typeof getSupabaseAdmin>, orderId: string) {
  const { data: lines } = await admin
    .from("order_items")
    .select("product_id")
    .eq("order_id", orderId);
  const ids = Array.from(new Set((lines || []).map((row: any) => String(row.product_id || "")).filter(Boolean)));
  if (ids.length === 0) return false;
  const { data: products } = await admin
    .from("products")
    .select("category")
    .in("id", ids);
  return (products || []).some((row: any) => isCoverHangerKategori(row.category));
}

/**
 * Paket kemasan default/resmi untuk satu pesanan.
 * Harga komponen hanya dikirim ke Owner; admin cukup melihat nama, qty, dan stok.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ orderNumber: string }> },
) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const { orderNumber } = await context.params;
  const identity = await opsIdentity(req);
  const owner = identity?.role === "owner";
  const admin = getSupabaseAdmin();

  const { data: order } = await admin
    .from("orders")
    .select("id, order_number")
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: "Pesanan tidak ditemukan" }, { status: 404 });

  const { data: header } = await admin
    .from("production_order_hpp")
    .select("packaged_at, returned_at, use_cover_hanger, packaging_warning")
    .eq("order_id", order.id)
    .maybeSingle();

  if (header?.packaged_at && !header?.returned_at) {
    const coverProductInOrder = await orderHasCoverProduct(admin, order.id);
    const { data: savedItems } = await admin
      .from("production_order_packaging_items")
      .select("component_id, component_code, component_name, unit_use, qty, unit_price, total")
      .eq("order_id", order.id)
      .order("component_code", { ascending: true });
    return NextResponse.json({
      already_packaged: true,
      use_cover_hanger: Boolean(header.use_cover_hanger),
      has_cover_hanger: false,
      cover_product_in_order: coverProductInOrder,
      packaging_warning: Boolean(header.packaging_warning),
      items: (savedItems || []).map((row: any) => ({
        component_id: row.component_id,
        component_code: row.component_code,
        component_name: row.component_name,
        unit_use: row.unit_use || "",
        qty: Number(row.qty) || 0,
        stock: null,
        kind: "packaging",
        ...(owner
          ? { real_price: Number(row.unit_price) || 0, total: Number(row.total) || 0 }
          : {}),
      })),
    });
  }

  const computed = await computeOrderPackaging(admin, order.id, null, true);
  return NextResponse.json({
    already_packaged: false,
    use_cover_hanger: computed.use_cover_hanger,
    has_cover_hanger: computed.has_cover_hanger,
    cover_product_in_order: computed.cover_product_in_order,
    packaging_warning: false,
    items: computed.items.map((item) => ({
      component_id: item.component_id,
      component_code: item.component_code,
      component_name: item.component_name,
      unit_use: item.unit_use,
      qty: item.qty,
      stock: item.stock,
      kind: item.kind,
      ...(owner
        ? { real_price: item.real_price, total: Math.round(item.qty * item.real_price * 100) / 100 }
        : {}),
    })),
  });
}
