import { NextRequest, NextResponse } from "next/server";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";
import { getResellerCatalog } from "@/lib/reseller/katalog";
import { getResellerBalance } from "@/lib/reseller/saldo";
import { loadActiveReseller } from "@/lib/reseller/admin-order";

// Harga reseller bisa diubah kapan saja — jangan pernah di-cache.
export const dynamic = "force-dynamic";

/**
 * Katalog + saldo untuk form "Buat Pesanan" admin: katalog yang SAMA dengan yang dilihat reseller itu
 * (diskon khusus reseller ikut dihitung), plus saldo tersedianya saat ini.
 *   GET /api/ops/reseller/orders/katalog?reseller_id=<uuid>
 */
export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const resellerId = new URL(req.url).searchParams.get("reseller_id") || "";
  const loaded = await loadActiveReseller(resellerId);
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: loaded.status });

  try {
    const [products, saldo] = await Promise.all([
      getResellerCatalog(loaded.reseller.discount_percent),
      getResellerBalance(loaded.reseller.id),
    ]);
    return NextResponse.json({
      data: products,
      saldo: saldo ?? { saldo_tersedia: 0, saldo_ditahan: 0, saldo_total: 0 },
    });
  } catch (error) {
    console.error("[OPS-RESELLER-ORDER] Gagal memuat katalog:", error);
    return NextResponse.json({ error: "Gagal memuat katalog" }, { status: 500 });
  }
}
