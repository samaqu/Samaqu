import { NextRequest, NextResponse } from "next/server";
import { resellerSession, resellerUnauthorized } from "@/lib/reseller/auth";
import { getResellerCatalog } from "@/lib/reseller/katalog";

// Harga reseller bisa diubah kapan saja dari tab admin Produk & Harga —
// jangan pernah menyajikan respons katalog dari cache.
export const dynamic = "force-dynamic";

/**
 * Katalog reseller: hanya produk yang boleh dijual reseller
 * (`reseller_discount_percent` tidak NULL) + varian, stok efektif,
 * harga katalog, harga beli, dan batas harga jual. Semua harga server.
 */
export async function GET(req: NextRequest) {
  const session = await resellerSession(req);
  if (!session) return resellerUnauthorized();

  try {
    const products = await getResellerCatalog();
    return NextResponse.json({ data: products });
  } catch (error) {
    console.error("[RESELLER-KATALOG] Gagal memuat katalog:", error);
    return NextResponse.json({ error: "Gagal memuat katalog" }, { status: 500 });
  }
}
