import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifyOrderLookupToken } from "@/lib/order-token";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Baca SATU pesanan untuk halaman sukses checkout — termasuk untuk customer tamu (belum login).
 *
 * Aman karena wajib membawa token yang diturunkan dari nomor pesanan (lihat `src/lib/order-token.ts`):
 * tanpa token yang cocok, endpoint ini tidak mengembalikan apa pun. Jadi setelah policy RLS `orders`
 * ditutup dari anon, tautan `checkout/success?order=…&t=…` tetap bisa dibuka tanpa membocorkan
 * pesanan orang lain.
 *
 *   GET /api/orders/lookup?order=SMQ-…&t=<token>
 */
export async function GET(req: NextRequest) {
  // Endpoint publik: batasi supaya token tidak bisa ditebak berulang-ulang dari satu IP.
  const limit = await checkRateLimit(req, "order-lookup", 60, 15 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan. Coba lagi nanti." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  const sp = new URL(req.url).searchParams;
  const orderNumber = String(sp.get("order") || "").trim();
  const token = String(sp.get("t") || "").trim();

  if (!orderNumber) return NextResponse.json({ error: "order wajib" }, { status: 400 });
  if (!verifyOrderLookupToken(orderNumber, token)) {
    return NextResponse.json({ error: "Tautan pesanan tidak sah" }, { status: 403 });
  }

  const { data, error } = await getSupabaseAdmin()
    .from("orders")
    .select("*, order_items(product_id, product_name, color, size, series, quantity, price)")
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Pesanan tidak ditemukan" }, { status: 404 });

  return NextResponse.json({ order: data });
}
