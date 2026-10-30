import { NextRequest, NextResponse } from "next/server";
import { resellerSession, resellerUnauthorized } from "@/lib/reseller/auth";
import { createResellerOrder, listResellerOrders } from "@/lib/reseller/orders";

/** Daftar pesanan milik reseller sendiri (paginasi). */
export async function GET(req: NextRequest) {
  const session = await resellerSession(req);
  if (!session) return resellerUnauthorized();

  const url = new URL(req.url);
  const page = Number(url.searchParams.get("page")) || 1;
  const pageSize = Number(url.searchParams.get("pageSize")) || 10;
  const month = (url.searchParams.get("month") || "").trim();

  const result = await listResellerOrders(session.reseller.id, page, pageSize, month);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json(result);
}

/**
 * Buat pesanan reseller. Input browser hanya: items (product_id, color,
 * size, quantity, sell_price), data penerima, layanan J&T, toggle label.
 * Harga beli, ongkir, dan total SELALU dihitung ulang di server, lalu
 * semuanya disimpan atomik oleh RPC `samaqu_reseller_create_order`.
 */
export async function POST(req: NextRequest) {
  const session = await resellerSession(req);
  if (!session) return resellerUnauthorized();

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  const items = rawItems.map((item) => {
    const value = (item ?? {}) as Record<string, unknown>;
    return {
      productId: String(value.product_id ?? value.productId ?? ""),
      color: String(value.color ?? ""),
      size: String(value.size ?? ""),
      quantity: Number(value.quantity),
      sellPrice: Number(value.sell_price ?? value.sellPrice),
    };
  });

  const customer = (raw.customer ?? {}) as Record<string, unknown>;
  const shipping = (raw.shipping ?? {}) as Record<string, unknown>;

  const result = await createResellerOrder(session.reseller, {
    items,
    customer: {
      name: String(customer.name ?? ""),
      whatsapp: String(customer.whatsapp ?? ""),
    },
    shipping: {
      address: String(shipping.address ?? ""),
      city: String(shipping.city ?? ""),
      district: String(shipping.district ?? ""),
      province: shipping.province == null ? undefined : String(shipping.province),
      postalCode: shipping.postalCode == null ? undefined : String(shipping.postalCode),
      notes: shipping.notes == null ? undefined : String(shipping.notes),
      method: String(shipping.method ?? ""),
      cost: Number(shipping.cost),
      weight: Number(shipping.weight) || undefined,
    },
    showResellerNameOnLabel: raw.show_reseller_name_on_label === true,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { ok: _ok, ...payload } = result;
  void _ok;
  return NextResponse.json({ ok: true, ...payload });
}
