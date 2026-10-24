import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { canSeePrices, productionGuard } from "@/lib/ops-auth";
import { mapComponent, mapMovement } from "@/lib/produksi-server";

/** Detail komponen: informasi, saldo stok, dan riwayat buku stok (saldo berjalan). */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const access = await productionGuard(req);
  if (!access.ok) return access.response;
  const showPrices = canSeePrices(access.role);

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "id komponen wajib." }, { status: 400 });

  const admin = getSupabaseAdmin();
  const { data: component, error } = await admin
    .from("production_components_stock")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!component) return NextResponse.json({ error: "Komponen tidak ditemukan." }, { status: 404 });

  const { data: movements, error: movementError } = await admin
    .from("production_stock_movements")
    .select("*")
    .eq("component_id", id)
    .order("movement_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (movementError) return NextResponse.json({ error: movementError.message }, { status: 500 });

  let balance = 0;
  const withBalance = (movements || []).map((row: any) => {
    balance += Number(row.qty) || 0;
    return mapMovement({ ...row, running_balance: Number(balance.toFixed(4)) }, showPrices);
  });
  withBalance.reverse();

  // Riwayat pembelian komponen ini (khusus Owner — isinya harga semua).
  let purchases: any[] = [];
  if (showPrices) {
    const { data: items } = await admin
      .from("production_purchase_items")
      .select("id, purchase_id, qty_buy, unit_buy, price_buy, qty_use, line_value, allocated_cost, final_unit_price, created_at")
      .eq("component_id", id)
      .order("created_at", { ascending: false })
      .limit(25);

    const ids = Array.from(new Set((items || []).map((item: any) => item.purchase_id)));
    const { data: headers } = ids.length
      ? await admin
          .from("production_purchases")
          .select("id, purchase_number, purchase_date, supplier")
          .in("id", ids)
      : { data: [] as any[] };
    const headerById = new Map((headers || []).map((h: any) => [h.id, h]));

    purchases = (items || []).map((item: any) => {
      const header = headerById.get(item.purchase_id) || {};
      return {
        id: item.id,
        purchase_number: header.purchase_number || "",
        purchase_date: header.purchase_date || item.created_at,
        supplier: header.supplier || "",
        qty_buy: Number(item.qty_buy) || 0,
        unit_buy: item.unit_buy,
        price_buy: Number(item.price_buy) || 0,
        qty_use: Number(item.qty_use) || 0,
        line_value: Number(item.line_value) || 0,
        allocated_cost: Number(item.allocated_cost) || 0,
        final_unit_price: Number(item.final_unit_price) || 0,
      };
    });
  }

  return NextResponse.json({
    item: mapComponent(component, showPrices),
    movements: withBalance,
    purchases,
    role: access.role,
    can_write: access.canWrite,
    prices: showPrices,
  });
}
