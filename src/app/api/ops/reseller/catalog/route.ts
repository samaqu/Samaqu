import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";
import { listAdminCatalog } from "@/lib/reseller/admin-catalog";

/**
 * Tab admin "Produk & Harga" — pengaturan harga reseller PER SERIES
 * (tiap series = satu baris `products`).
 *
 *   GET  → produk KATALOG WEBSITE + harga katalog, diskon khusus, kolom
 *          reseller, harga beli & batas jual hasil hitungan server, dan
 *          diskon default. Produk Open Order/tersembunyi tidak ikut.
 *   PATCH { updates: [{ id, reseller_enabled?, reseller_discount_percent?,
 *          reseller_min_sell_price? }] } → simpan per baris maupun massal.
 *
 * Batas harga jual portal = max(harga minimum jual tersimpan, harga beli).
 * Hanya menyentuh kolom reseller — harga katalog/stok/minimum_price CYP tidak
 * pernah ditulis di sini.
 */
const MAX_UPDATES = 500;

export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  try {
    const { rows, defaultDiscount } = await listAdminCatalog();
    return NextResponse.json({ data: rows, default_discount: defaultDiscount });
  } catch {
    return NextResponse.json({ error: "Gagal memuat produk" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const updates = Array.isArray(body.updates) ? body.updates : [];
  if (updates.length === 0 || updates.length > MAX_UPDATES) {
    return NextResponse.json({ error: "Tidak ada perubahan yang dikirim" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const saved: string[] = [];

  for (const raw of updates) {
    const item = (raw ?? {}) as Record<string, unknown>;
    const id = String(item.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "ID produk tidak valid" }, { status: 400 });

    const patch: Record<string, unknown> = {};

    if (item.reseller_enabled !== undefined) {
      patch.reseller_enabled = item.reseller_enabled === true;
    }

    if (item.reseller_discount_percent !== undefined) {
      const value = item.reseller_discount_percent;
      if (value === null || value === "") {
        patch.reseller_discount_percent = null;
      } else {
        const num = Number(value);
        if (!Number.isFinite(num) || num < 0 || num > 100) {
          return NextResponse.json({ error: "Diskon harus 0–100" }, { status: 400 });
        }
        patch.reseller_discount_percent = Math.round(num * 100) / 100;
      }
    }

    if (item.reseller_min_sell_price !== undefined) {
      const value = item.reseller_min_sell_price;
      if (value === null || value === "") {
        patch.reseller_min_sell_price = null;
      } else {
        const num = Math.round(Number(value));
        if (!Number.isFinite(num) || num < 0) {
          return NextResponse.json({ error: "Harga minimum jual tidak valid" }, { status: 400 });
        }
        patch.reseller_min_sell_price = num;
      }
    }

    if (Object.keys(patch).length === 0) continue;

    const { error } = await supabase.from("products").update(patch).eq("id", id);
    if (error) {
      console.error("[OPS-RESELLER] Gagal menyimpan harga reseller:", id, error.message);
      return NextResponse.json({ error: "Gagal menyimpan perubahan" }, { status: 500 });
    }
    saved.push(id);
  }

  return NextResponse.json({ ok: true, updated: saved.length });
}
