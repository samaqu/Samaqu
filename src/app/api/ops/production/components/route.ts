import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { canSeePrices, productionGuard } from "@/lib/ops-auth";
import { mapComponent, nextComponentCode } from "@/lib/produksi-server";
import { stockStatus } from "@/lib/produksi";
import { loadReservedMap } from "@/lib/produksi-jadwal-server";

/**
 * Master komponen & bahan (menu Produksi → Komponen & Bahan).
 *
 * Tabel terpisah dari `products` — komponen tidak pernah muncul di katalog.
 * Harga disensor untuk Leader di sisi server.
 */

const COMPONENT_FIELDS = [
  "code",
  "name",
  "category",
  "unit_use",
  "unit_buy",
  "conversion",
  "min_stock",
  "safe_price",
  "supplier",
  "notes",
  "fabric_type_id",
  "is_active",
] as const;

function pickComponent(body: any) {
  const out: Record<string, unknown> = {};
  for (const key of COMPONENT_FIELDS) {
    if (body?.[key] !== undefined) out[key] = body[key];
  }
  if (out.fabric_type_id === "") out.fabric_type_id = null;
  if (typeof out.code === "string") out.code = out.code.trim().toUpperCase();
  return out;
}

function friendlyError(message: string): string {
  if (message.includes("production_components_code_key")) return "Kode komponen sudah dipakai.";
  if (message.includes("production_components_category_check")) return "Kategori komponen tidak dikenal.";
  if (message.includes("conversion_check")) return "Konversi satuan harus lebih dari 0.";
  return message.replace(/^.*?:\s*/, "") || "Gagal menyimpan komponen.";
}

export async function GET(req: NextRequest) {
  const access = await productionGuard(req);
  if (!access.ok) return access.response;
  const showPrices = canSeePrices(access.role);

  const sp = new URL(req.url).searchParams;
  const search = String(sp.get("search") || "").trim();
  const category = String(sp.get("category") || "").trim();
  const status = String(sp.get("status") || "").trim();
  const includeInactive = sp.get("include_inactive") === "1";

  const admin = getSupabaseAdmin();
  let query = admin
    .from("production_components_stock")
    .select("*")
    .order("category", { ascending: true })
    .order("code", { ascending: true });

  if (search) {
    const safe = search.replace(/[,()]/g, " ").trim();
    if (safe) query = query.or(`code.ilike.%${safe}%,name.ilike.%${safe}%`);
  }
  if (category) query = query.eq("category", category);
  if (!includeInactive) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let items = (data || []).map((row: any) => mapComponent(row, showPrices));
  if (status === "aman" || status === "menipis" || status === "habis") {
    items = items.filter((item: any) => item.status === status);
  }

  // Ringkasan selalu dari SEMUA komponen aktif, bukan dari hasil filter.
  const { data: all } = await admin
    .from("production_components_stock")
    .select("stock, min_stock, real_price")
    .eq("is_active", true);

  const summary: Record<string, number> = { total: 0, aman: 0, menipis: 0, habis: 0 };
  let stockValue = 0;
  for (const row of all || []) {
    const stock = Number((row as any).stock) || 0;
    const minStock = Number((row as any).min_stock) || 0;
    summary.total += 1;
    summary[stockStatus(stock, minStock)] += 1;
    stockValue += stock * (Number((row as any).real_price) || 0);
  }
  if (showPrices) summary.stock_value = Math.round(stockValue);

  // Reservasi jadwal Disetujui (Fase 3). Tersedia = stok fisik - dicadangkan.
  const reservedMap = await loadReservedMap(admin);
  items = items.map((item: any) => {
    const reserved = reservedMap.get(String(item.id)) || 0;
    return {
      ...item,
      reserved_stock: reserved,
      available_stock: Math.round((Number(item.stock) - reserved) * 10000) / 10000,
    };
  });

  return NextResponse.json({
    items,
    summary,
    role: access.role,
    can_write: access.canWrite,
    prices: showPrices,
  });
}

export async function POST(req: NextRequest) {
  const access = await productionGuard(req, { write: true });
  if (!access.ok) return access.response;

  try {
    const body = await req.json();
    const admin = getSupabaseAdmin();
    const category = String(body?.category || "").trim();
    if (!category) return NextResponse.json({ error: "Kategori wajib dipilih." }, { status: 400 });

    const component = pickComponent(body);
    if (!component.code) component.code = await nextComponentCode(admin, category);

    const initialQty = Number(body?.initial_qty) || 0;
    const initialPrice = Number(body?.initial_price) || 0;

    const { data, error } = await admin.rpc("production_save_component", {
      p_component: component,
      p_initial_qty: initialQty > 0 ? initialQty : null,
      p_initial_price: initialQty > 0 ? initialPrice : null,
      p_actor: access.email,
    });
    if (error) return NextResponse.json({ error: friendlyError(error.message) }, { status: 400 });

    return NextResponse.json({ item: mapComponent(data, true) });
  } catch (e) {
    console.error("[PRODUKSI] komponen POST:", e);
    return NextResponse.json({ error: "Gagal menyimpan komponen." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const access = await productionGuard(req, { write: true });
  if (!access.ok) return access.response;

  try {
    const body = await req.json();
    const id = String(body?.id || "").trim();
    if (!id) return NextResponse.json({ error: "id komponen wajib." }, { status: 400 });

    const admin = getSupabaseAdmin();
    const component = { ...pickComponent(body), id };

    const { data, error } = await admin.rpc("production_save_component", {
      p_component: component,
      p_initial_qty: null,
      p_initial_price: null,
      p_actor: access.email,
    });
    if (error) return NextResponse.json({ error: friendlyError(error.message) }, { status: 400 });

    return NextResponse.json({ item: mapComponent(data, true) });
  } catch (e) {
    console.error("[PRODUKSI] komponen PATCH:", e);
    return NextResponse.json({ error: "Gagal mengubah komponen." }, { status: 500 });
  }
}
