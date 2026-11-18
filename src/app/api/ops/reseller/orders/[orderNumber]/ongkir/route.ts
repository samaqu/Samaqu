import { NextRequest, NextResponse } from "next/server";
import { isOpsAdmin, opsIdentity, unauthorized } from "@/lib/ops-auth";
import { calcResellerOngkir } from "@/lib/reseller/ongkir";
import { getResellerBalance } from "@/lib/reseller/saldo";
import { cityOfShipping, loadPendingShippingOrder, setResellerOrderShipping } from "@/lib/reseller/set-shipping";

/**
 * "Isi Ongkir" untuk pesanan reseller berstatus "Menunggu ongkir".
 *
 * GET  -> opsi layanan J&T (dihitung dari berat + tujuan yang tersimpan di pesanan) + saldo reseller
 *         + ringkasan, supaya admin melihat total, saldo, dan kekurangan SEBELUM konfirmasi.
 * POST -> { method, cost }: tarif diverifikasi ulang ke J&T, ongkir dipotong dari saldo (baris ledger
 *         terpisah); kalau saldo kurang masuk jalur bayar kekurangan yang sudah ada.
 *         { custom: { name, service }, cost }: kurir lain (di luar J&T), nominal isian admin tanpa verifikasi tarif;
 *         potong saldo & jalur kekurangan sama persis.
 */
export async function GET(req: NextRequest, context: { params: Promise<{ orderNumber: string }> }) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  const { orderNumber } = await context.params;

  const order = await loadPendingShippingOrder(decodeURIComponent(orderNumber));
  if (!order) return NextResponse.json({ error: "Pesanan reseller tidak ditemukan." }, { status: 404 });
  if (order.status === "dibatalkan") return NextResponse.json({ error: "Pesanan sudah dibatalkan." }, { status: 409 });
  if (order.shipping_pending !== true) {
    return NextResponse.json({ error: "Pesanan ini tidak menunggu ongkir." }, { status: 409 });
  }

  const [tariff, saldo] = await Promise.all([
    calcResellerOngkir({
      city: cityOfShipping(order.shipping_city, order.shipping_kecamatan),
      district: order.shipping_kecamatan || "",
      weight: Math.max(300, Number(order.weight) || 0),
    }),
    getResellerBalance(order.reseller_id),
  ]);

  return NextResponse.json({
    ...tariff.body,
    ...(tariff.status >= 400 ? { tariff_status: tariff.status } : {}),
    order: { order_number: order.order_number, total: Number(order.total) || 0, weight: Number(order.weight) || 0 },
    saldo: saldo ?? { saldo_tersedia: 0, saldo_ditahan: 0, saldo_total: 0 },
  });
}

export async function POST(req: NextRequest, context: { params: Promise<{ orderNumber: string }> }) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  const identity = await opsIdentity(req);
  if (!identity?.email) return unauthorized();
  const { orderNumber } = await context.params;

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const result = await setResellerOrderShipping({
    orderNumber: decodeURIComponent(orderNumber),
    method: String(body.method ?? ""),
    cost: Number(body.cost),
    actorEmail: identity.email,
    // Kurir lain: { name, service } -> nominal isian admin (tanpa verifikasi tarif J&T).
    custom:
      body.custom && typeof body.custom === "object"
        ? { name: (body.custom as Record<string, unknown>).name, service: (body.custom as Record<string, unknown>).service }
        : null,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const { ok: _ok, ...payload } = result;
  void _ok;
  return NextResponse.json({ ok: true, ...payload });
}
