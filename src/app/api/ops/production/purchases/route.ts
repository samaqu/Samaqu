import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { forbidden, productionGuard } from "@/lib/ops-auth";

/**
 * Pembelian bahan (menu Produksi → Pembelian Bahan).
 *
 * Ongkir/biaya tambahan satu pembelian dibagi proporsional ke nilai tiap baris,
 * lalu ditambahkan ke harga per satuan pakai. Perhitungan & penyimpanan atomik
 * dilakukan RPC `production_record_purchase`.
 *
 * Isi menu ini seluruhnya harga → hanya Owner (Leader ditolak di server).
 */

type IncomingItem = { component_id?: string; qty_buy?: number; price_buy?: number };

function rowError(message: string): string {
  return message.replace(/^.*?:\s*/, "") || "Gagal menyimpan pembelian.";
}

export async function GET(req: NextRequest) {
  const access = await productionGuard(req);
  if (!access.ok) return access.response;
  if (access.role !== "owner") return forbidden("Harga pembelian hanya untuk Owner");

  const sp = new URL(req.url).searchParams;
  const start = String(sp.get("start") || "").trim();
  const end = String(sp.get("end") || "").trim();
  const supplier = String(sp.get("supplier") || "").trim();
  const limit = Math.min(Math.max(parseInt(sp.get("limit") || "100", 10) || 100, 1), 300);

  const admin = getSupabaseAdmin();
  let query = admin
    .from("production_purchases")
    .select("*")
    .order("purchase_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (start) query = query.gte("purchase_date", start);
  if (end) query = query.lte("purchase_date", end);
  if (supplier) query = query.ilike("supplier", `%${supplier}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (data || []).map((p: any) => p.id);
  const { data: items } = ids.length
    ? await admin
        .from("production_purchase_items")
        .select("*")
        .in("purchase_id", ids)
        .order("created_at", { ascending: true })
    : { data: [] as any[] };

  const componentIds = Array.from(
    new Set((items || []).map((item: any) => item.component_id).filter(Boolean)),
  );
  const { data: componentRows } = componentIds.length
    ? await admin.from("production_components").select("id, unit_use").in("id", componentIds)
    : { data: [] as any[] };
  const unitUseById = new Map((componentRows || []).map((c: any) => [c.id, c.unit_use]));

  const byPurchase = new Map<string, any[]>();
  for (const item of items || []) {
    const list = byPurchase.get(item.purchase_id) || [];
    list.push({
      id: item.id,
      component_id: item.component_id,
      component_code: item.component_code,
      component_name: item.component_name,
      qty_buy: Number(item.qty_buy) || 0,
      unit_buy: item.unit_buy,
      unit_use: unitUseById.get(item.component_id) || "",
      price_buy: Number(item.price_buy) || 0,
      conversion: Number(item.conversion) || 1,
      qty_use: Number(item.qty_use) || 0,
      line_value: Number(item.line_value) || 0,
      allocated_cost: Number(item.allocated_cost) || 0,
      final_unit_price: Number(item.final_unit_price) || 0,
      real_price_before: Number(item.real_price_before) || 0,
      real_price_after: Number(item.real_price_after) || 0,
    });
    byPurchase.set(item.purchase_id, list);
  }

  const purchases = (data || []).map((p: any) => ({
    id: p.id,
    purchase_number: p.purchase_number,
    purchase_date: p.purchase_date,
    supplier: p.supplier || "",
    additional_cost: Number(p.additional_cost) || 0,
    items_value: Number(p.items_value) || 0,
    total_value: Number(p.total_value) || 0,
    notes: p.notes || "",
    actor: p.actor || "",
    created_at: p.created_at,
    items: byPurchase.get(p.id) || [],
  }));

  return NextResponse.json({ items: purchases });
}

export async function POST(req: NextRequest) {
  const access = await productionGuard(req, { write: true });
  if (!access.ok) return access.response;

  try {
    const body = await req.json();
    const rawItems: IncomingItem[] = Array.isArray(body?.items) ? body.items : [];
    if (rawItems.length === 0) {
      return NextResponse.json({ error: "Minimal satu baris pembelian." }, { status: 400 });
    }

    const items = rawItems.map((item, index) => {
      const qty = Number(item?.qty_buy);
      const price = Number(item?.price_buy);
      if (!item?.component_id) throw new Error(`Baris ${index + 1}: pilih komponen.`);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error(`Baris ${index + 1}: jumlah beli harus lebih dari 0.`);
      if (!Number.isFinite(price) || price < 0) throw new Error(`Baris ${index + 1}: harga beli tidak valid.`);
      return { component_id: item.component_id, qty_buy: qty, price_buy: price };
    });

    const additional = Number(body?.additional_cost) || 0;
    if (additional < 0) {
      return NextResponse.json({ error: "Ongkir/biaya tambahan tidak boleh negatif." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc("production_record_purchase", {
      p_header: {
        purchase_date: String(body?.purchase_date || "").trim() || null,
        supplier: String(body?.supplier || "").trim() || null,
        additional_cost: additional,
        notes: String(body?.notes || "").trim() || null,
      },
      p_items: items,
      p_actor: access.email,
    });

    if (error) {
      return NextResponse.json({ error: rowError(error.message) }, { status: 400 });
    }

    return NextResponse.json({ item: data }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gagal menyimpan pembelian.";
    if (/^Baris \d+/.test(message)) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("[PRODUKSI] pembelian POST:", e);
    return NextResponse.json({ error: "Gagal menyimpan pembelian." }, { status: 500 });
  }
}
