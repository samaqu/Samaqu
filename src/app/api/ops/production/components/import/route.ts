import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { productionGuard } from "@/lib/ops-auth";
import { nextComponentCode } from "@/lib/produksi-server";
import { COMPONENT_CATEGORIES } from "@/lib/produksi";

/**
 * Import Paste komponen dari Excel/Sheet.
 * Kolom: nama, kategori, satuan, harga beli (harga stok awal), Harga Aman,
 * stok awal, stok minimum, jenis kain (opsional).
 *
 * Setiap baris divalidasi ulang di server; baris yang gagal dilaporkan tanpa
 * membatalkan baris lain yang valid.
 */

type IncomingRow = {
  name?: string;
  category?: string;
  unit_use?: string;
  price?: number;
  safe_price?: number;
  initial_stock?: number;
  min_stock?: number;
  fabric_type_id?: string | null;
};

export async function POST(req: NextRequest) {
  const access = await productionGuard(req, { write: true });
  if (!access.ok) return access.response;

  try {
    const body = await req.json();
    const rows: IncomingRow[] = Array.isArray(body?.rows) ? body.rows : [];
    if (rows.length === 0) return NextResponse.json({ error: "Tidak ada baris untuk disimpan." }, { status: 400 });
    if (rows.length > 500) return NextResponse.json({ error: "Maksimal 500 baris sekali import." }, { status: 400 });

    const admin = getSupabaseAdmin();
    const validCategories = new Set<string>(COMPONENT_CATEGORIES.map((c) => c.value));

    const failed: { line: number; name: string; error: string }[] = [];
    let inserted = 0;

    // Prefix dihitung sekali per kategori, lalu naik di memori supaya tidak
    // menembak query kode berulang kali untuk setiap baris.
    const nextByCategory = new Map<string, string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const name = String(row?.name || "").trim();
      const category = String(row?.category || "").trim();

      if (!name) {
        failed.push({ line: i + 1, name, error: "Nama wajib diisi." });
        continue;
      }
      if (!validCategories.has(category)) {
        failed.push({ line: i + 1, name, error: "Kategori tidak dikenal." });
        continue;
      }

      if (!nextByCategory.has(category)) {
        nextByCategory.set(category, await nextComponentCode(admin, category));
      }
      const code = nextByCategory.get(category) as string;

      const initialQty = Number(row?.initial_stock) || 0;
      const initialPrice = Number(row?.price) || 0;

      const { error } = await admin.rpc("production_save_component", {
        p_component: {
          code,
          name,
          category,
          unit_use: String(row?.unit_use || "pcs").trim().toLowerCase(),
          unit_buy: String(row?.unit_use || "pcs").trim().toLowerCase(),
          conversion: 1,
          min_stock: Number(row?.min_stock) || 0,
          safe_price: Number(row?.safe_price) || 0,
          fabric_type_id: row?.fabric_type_id || null,
          is_active: true,
        },
        p_initial_qty: initialQty > 0 ? initialQty : null,
        p_initial_price: initialQty > 0 ? initialPrice : null,
        p_actor: access.email,
      });

      if (error) {
        failed.push({ line: i + 1, name, error: error.message });
        continue;
      }

      inserted += 1;
      const match = /^(.*)-(\d+)$/.exec(code);
      if (match) {
        nextByCategory.set(category, `${match[1]}-${String(Number(match[2]) + 1).padStart(3, "0")}`);
      }
    }

    return NextResponse.json({ inserted, failed, total: rows.length });
  } catch (e) {
    console.error("[PRODUKSI] import komponen:", e);
    return NextResponse.json({ error: "Gagal mengimpor komponen." }, { status: 500 });
  }
}
