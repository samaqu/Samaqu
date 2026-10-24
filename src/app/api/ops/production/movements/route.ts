import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { canSeePrices, productionGuard } from "@/lib/ops-auth";
import { mapMovement } from "@/lib/produksi-server";

/**
 * Buku stok komponen — append-only.
 *   GET  : daftar pergerakan (filter komponen, jenis, tanggal).
 *   POST : stok awal (batch) dan catat Rusak/Hilang.
 * Tidak ada endpoint edit/hapus — koreksi lewat transaksi penyesuaian baru.
 */

export async function GET(req: NextRequest) {
  const access = await productionGuard(req);
  if (!access.ok) return access.response;
  const showPrices = canSeePrices(access.role);

  const sp = new URL(req.url).searchParams;
  const componentId = String(sp.get("component_id") || "").trim();
  const type = String(sp.get("type") || "").trim();
  const start = String(sp.get("start") || "").trim();
  const end = String(sp.get("end") || "").trim();
  const limit = Math.min(Math.max(parseInt(sp.get("limit") || "300", 10) || 300, 1), 2000);

  const admin = getSupabaseAdmin();
  let query = admin
    .from("production_stock_movements")
    .select("*")
    .order("movement_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (componentId) query = query.eq("component_id", componentId);
  if (type) query = query.eq("type", type);
  if (start) query = query.gte("movement_date", start);
  if (end) query = query.lte("movement_date", end);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = Array.from(new Set((data || []).map((m: any) => m.component_id)));
  const { data: components } = ids.length
    ? await admin
        .from("production_components")
        .select("id, code, name, unit_use")
        .in("id", ids)
    : { data: [] as any[] };
  const componentById = new Map((components || []).map((c: any) => [c.id, c]));

  const items = (data || []).map((row: any) => {
    const component = componentById.get(row.component_id) as any;
    return mapMovement(
      {
        ...row,
        component_code: component?.code || "",
        component_name: component?.name || "",
        unit_use: component?.unit_use || "",
      },
      showPrices,
    );
  });

  return NextResponse.json({ items, role: access.role, can_write: access.canWrite, prices: showPrices });
}

export async function POST(req: NextRequest) {
  const access = await productionGuard(req, { write: true });
  if (!access.ok) return access.response;

  try {
    const body = await req.json();
    const action = String(body?.action || "").trim();
    const admin = getSupabaseAdmin();

    if (action === "stok_awal") {
      const rows = Array.isArray(body?.items) ? body.items : [];
      if (rows.length === 0) {
        return NextResponse.json({ error: "Minimal satu baris stok awal." }, { status: 400 });
      }
      const items = rows.map((row: any, index: number) => {
        const qty = Number(row?.qty);
        const price = Number(row?.unit_price) || 0;
        if (!row?.component_id) throw new Error(`Baris ${index + 1}: pilih komponen.`);
        if (!Number.isFinite(qty) || qty <= 0) throw new Error(`Baris ${index + 1}: jumlah harus lebih dari 0.`);
        if (price < 0) throw new Error(`Baris ${index + 1}: harga tidak valid.`);
        return { component_id: row.component_id, qty, unit_price: price };
      });

      const date = String(body?.date || "").trim() || null;
      const { data, error } = await admin.rpc("production_record_initial_stock", {
        p_items: items,
        p_date: date,
        p_actor: access.email,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ result: data }, { status: 201 });
    }

    if (action === "rusak_hilang" || action === "penyesuaian") {
      const componentId = String(body?.component_id || "").trim();
      const qty = Number(body?.qty);
      const notes = String(body?.notes || "").trim();
      if (!componentId) return NextResponse.json({ error: "Komponen wajib dipilih." }, { status: 400 });
      if (!Number.isFinite(qty) || qty <= 0) {
        return NextResponse.json({ error: "Jumlah harus lebih dari 0." }, { status: 400 });
      }
      if (!notes) return NextResponse.json({ error: "Catatan wajib diisi." }, { status: 400 });

      const { data, error } = await admin.rpc("production_record_movement", {
        p_component_id: componentId,
        p_type: action,
        p_qty: -Math.abs(qty),
        p_date: String(body?.date || "").trim() || null,
        p_notes: notes,
        p_actor: access.email,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ result: data }, { status: 201 });
    }

    return NextResponse.json({ error: "Aksi tidak dikenal." }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gagal menyimpan transaksi stok.";
    if (/^Baris \d+/.test(message)) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("[PRODUKSI] movements POST:", e);
    return NextResponse.json({ error: "Gagal menyimpan transaksi stok." }, { status: 500 });
  }
}
