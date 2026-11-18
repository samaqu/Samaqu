import { NextRequest, NextResponse } from "next/server";
import { isOpsAdmin, opsIdentity, unauthorized } from "@/lib/ops-auth";
import { createResellerOrder } from "@/lib/reseller/orders";
import { loadActiveReseller } from "@/lib/reseller/admin-order";

/**
 * Buat pesanan atas nama reseller (admin ops & panel admin).
 *
 * Memakai fungsi yang SAMA dengan portal reseller (`createResellerOrder`): harga beli, diskon per
 * reseller/produk, batas harga jual, potong saldo, kekurangan, ongkir J&T, dan nomor EP- semuanya
 * dihitung ulang di server dari database — harga dari browser tidak pernah dipercaya.
 *
 * Body: { reseller_id, items[{product_id,color,size,quantity,sell_price}], customer{name,whatsapp},
 *         shipping{address,city,district,province?,postalCode?,notes?,method?,cost?},
 *         mode: "otomatis" | "menyusul", show_reseller_name_on_label?, confirm_duplicate? }
 * - mode "otomatis": layanan J&T + ongkir diverifikasi ke tarif, dipotong dari saldo (tanpa diskon).
 * - mode "menyusul": ongkir 0, stok ditahan, saldo dipotong sebesar produk saja (wajib cukup);
 *   ongkir diisi belakangan lewat `/orders/<nomor>/ongkir`.
 */
export async function POST(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  const identity = await opsIdentity(req);
  if (!identity?.email) return unauthorized();

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;

  const loaded = await loadActiveReseller(String(raw.reseller_id ?? ""));
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: loaded.status });

  const mode = String(raw.mode ?? "otomatis");
  if (mode !== "otomatis" && mode !== "menyusul") {
    return NextResponse.json({ error: "Mode pengiriman tidak dikenal" }, { status: 400 });
  }

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

  const result = await createResellerOrder(
    loaded.reseller,
    {
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
    },
    {
      adminEmail: identity.email,
      shippingPending: mode === "menyusul",
      confirmDuplicate: raw.confirm_duplicate === true,
    }
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...(result.code ? { code: result.code } : {}) },
      { status: result.status }
    );
  }

  const { ok: _ok, ...payload } = result;
  void _ok;
  return NextResponse.json({ ok: true, ...payload });
}
